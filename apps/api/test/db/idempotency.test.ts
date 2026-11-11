import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { sha256Hex } from '../../src/lib/hmac.js';
import { hashRequest, readIdempotencyKey, withIdempotency } from '../../src/services/idempotency.js';
import { issuePointsInTx, redeemPointsInTx } from '../../src/services/points.js';
import { toTransactionView } from '../../src/services/transactions.js';
import type { IdempotencyScope } from '../../src/types.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { balanceOf, countTransactions, insertApiKey, pointsFixture, setBalance, type PointsFixture } from '../helpers/points.js';

// Task T07b acceptance criteria (service level). The HTTP endpoints are in portal-points.test.ts.

let db: TestDatabase;
let sql: Sql;
const TEMPLATE = 'https://suiscan.xyz/testnet/tx/{digest}';

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
});
afterAll(async () => {
  await db.drop();
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return 'NO ERROR';
}

const userScope = (f: PointsFixture): IdempotencyScope => ({ kind: 'USER', userId: f.ownerId });

/** Issue 10 points (100000 VND at 10000 per point) through withIdempotency. */
function issueOnce(f: PointsFixture, scope: IdempotencyScope, key: string, hash = 'hash-1') {
  return withIdempotency(sql, { scope, key, requestHash: hash }, async (tx) => {
    const row = await issuePointsInTx(tx, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100000, actor: f.actor });
    return { status: 201, body: toTransactionView(row, TEMPLATE) };
  });
}

describe('withIdempotency', () => {
  it('runs once for the same key and request, and returns the first response again', async () => {
    const f = await pointsFixture(sql);
    const first = await issueOnce(f, userScope(f), 'key-1');
    const second = await issueOnce(f, userScope(f), 'key-1');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await countTransactions(sql, f.customerId)).toBe(1);
    expect(await balanceOf(sql, f.customerId)).toBe(10); // not 20
  });

  it('stores the response that it will replay', async () => {
    const f = await pointsFixture(sql);
    const first = await issueOnce(f, userScope(f), 'key-stored');
    const [row] = await sql`
      SELECT scope_user_id, scope_api_key_id, request_hash, response_status, response_body
      FROM idempotency_keys WHERE idempotency_key = 'key-stored'`;
    expect(String(row.scope_user_id)).toBe(f.ownerId);
    expect(row.scope_api_key_id).toBeNull();
    expect(row.request_hash).toBe('hash-1');
    expect(Number(row.response_status)).toBe(201);
    expect(row.response_body).toEqual(first.body);
  });

  it('runs once when five identical requests arrive at the same time', async () => {
    const f = await pointsFixture(sql);
    const results = await Promise.all(Array.from({ length: 5 }, () => issueOnce(f, userScope(f), 'key-parallel')));

    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(results.filter((r) => r.replayed)).toHaveLength(4);
    for (const result of results) expect(result.body).toEqual(results[0]!.body);
    expect(await countTransactions(sql, f.customerId)).toBe(1);
    expect(await balanceOf(sql, f.customerId)).toBe(10);
  });

  it('answers MSG34 for the same key with another request, does nothing, and still replays the first response', async () => {
    const f = await pointsFixture(sql);
    const first = await issueOnce(f, userScope(f), 'key-clash', 'hash-A');
    expect(await codeOf(issueOnce(f, userScope(f), 'key-clash', 'hash-B'))).toBe('MSG34');
    expect(await countTransactions(sql, f.customerId)).toBe(1);

    const again = await issueOnce(f, userScope(f), 'key-clash', 'hash-A');
    expect(again.replayed).toBe(true);
    expect(again.body).toEqual(first.body);
  });

  it('saves nothing when the work fails, so the same key can be retried after the cause is fixed', async () => {
    const f = await pointsFixture(sql, { balance: 0, minRedemption: 1 });
    const redeem = () =>
      withIdempotency(sql, { scope: userScope(f), key: 'key-retry', requestHash: 'hash-R' }, async (tx) => {
        const row = await redeemPointsInTx(tx, { merchantId: f.merchantId, customerCode: 'CUS001', points: 10, actor: f.actor });
        return { status: 201, body: toTransactionView(row, TEMPLATE) };
      });

    expect(await codeOf(redeem())).toBe('MSG08'); // balance 0
    expect(await sql`SELECT 1 FROM idempotency_keys WHERE idempotency_key = 'key-retry'`).toHaveLength(0);
    expect(await countTransactions(sql, f.customerId)).toBe(0);

    await setBalance(sql, f.customerId, 25);
    const retried = await redeem();
    expect(retried.replayed).toBe(false);
    expect(await balanceOf(sql, f.customerId)).toBe(15);
    expect(await redeem().then((r) => r.replayed)).toBe(true); // and now it is protected
    expect(await balanceOf(sql, f.customerId)).toBe(15);
  });

  it('keeps a key separate for each scope: two users, two API keys, a user and an API key', async () => {
    const f = await pointsFixture(sql);
    const apiKeyA = await insertApiKey(sql, f.merchantId, f.ownerId);
    const apiKeyB = await insertApiKey(sql, f.merchantId, f.ownerId);
    const [other] = await sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (${f.merchantId}, 'second.user@example.com', 'hash', 'Second', 'MERCHANT_STAFF') RETURNING id`;

    const scopes: IdempotencyScope[] = [
      { kind: 'USER', userId: f.ownerId },
      { kind: 'USER', userId: String(other.id) },
      { kind: 'API_KEY', apiKeyId: apiKeyA },
      { kind: 'API_KEY', apiKeyId: apiKeyB },
    ];
    for (const scope of scopes) {
      const result = await issueOnce(f, scope, 'same-key-everywhere');
      expect(result.replayed).toBe(false);
    }
    expect(await countTransactions(sql, f.customerId)).toBe(4);
    expect(await sql`SELECT 1 FROM idempotency_keys WHERE idempotency_key = 'same-key-everywhere'`).toHaveLength(4);
  });

  it('stores an API key scope in scope_api_key_id', async () => {
    const f = await pointsFixture(sql);
    const apiKeyId = await insertApiKey(sql, f.merchantId, f.ownerId);
    await issueOnce(f, { kind: 'API_KEY', apiKeyId }, 'key-api');
    const [row] = await sql`SELECT scope_user_id, scope_api_key_id FROM idempotency_keys WHERE idempotency_key = 'key-api'`;
    expect(row.scope_user_id).toBeNull();
    expect(String(row.scope_api_key_id)).toBe(apiKeyId);
  });

  it('ignores and deletes a saved key older than 24 hours, even for another request', async () => {
    const f = await pointsFixture(sql);
    await issueOnce(f, userScope(f), 'key-old', 'hash-old');
    await sql`UPDATE idempotency_keys SET created_at = now() - interval '25 hours' WHERE idempotency_key = 'key-old'`;

    const result = await issueOnce(f, userScope(f), 'key-old', 'hash-new'); // would be MSG34 if the row still counted
    expect(result.replayed).toBe(false);
    expect(await countTransactions(sql, f.customerId)).toBe(2);
    const rows = await sql`SELECT request_hash FROM idempotency_keys WHERE idempotency_key = 'key-old'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.request_hash).toBe('hash-new');
  });

  it('still protects a key that is 23 hours old', async () => {
    const f = await pointsFixture(sql);
    await issueOnce(f, userScope(f), 'key-23h');
    await sql`UPDATE idempotency_keys SET created_at = now() - interval '23 hours' WHERE idempotency_key = 'key-23h'`;
    expect((await issueOnce(f, userScope(f), 'key-23h')).replayed).toBe(true);
    expect(await countTransactions(sql, f.customerId)).toBe(1);
  });

  it('keeps and replays the status that the work returned', async () => {
    const f = await pointsFixture(sql);
    const run = () => withIdempotency(sql, { scope: userScope(f), key: 'key-200', requestHash: 'h' }, async () => ({ status: 200, body: { ok: true } }));
    expect(await run()).toEqual({ status: 200, body: { ok: true }, replayed: false });
    expect(await run()).toEqual({ status: 200, body: { ok: true }, replayed: true });
  });
});

describe('readIdempotencyKey', () => {
  it('returns a key of 1 to 128 characters exactly as sent', () => {
    for (const key of ['a', '11111111-1111-4111-8111-111111111111', 'x'.repeat(128), 'with spaces inside', 'ünïcode-key']) {
      expect(readIdempotencyKey(key)).toBe(key);
    }
  });

  it('answers MSG33 when it is missing, blank or too long', async () => {
    for (const bad of [undefined, '', '   ', 'x'.repeat(129)]) {
      expect(() => readIdempotencyKey(bad)).toThrow();
      try {
        readIdempotencyKey(bad);
      } catch (error) {
        expect((error as { code?: string }).code).toBe('MSG33');
      }
    }
  });
});

describe('hashRequest', () => {
  it('is sha256hex(METHOD.target.sha256hex(body)), as in db-schema.md', () => {
    const body = '{"amount":100000}';
    expect(hashRequest('POST', '/api/v1/x?a=1', body)).toBe(sha256Hex(`POST./api/v1/x?a=1.${sha256Hex(body)}`));
  });

  it('is the same for the same request and different when the method, the target or the body differs', () => {
    const base = hashRequest('POST', '/api/v1/points/issue', '{"amount":1}');
    expect(hashRequest('POST', '/api/v1/points/issue', '{"amount":1}')).toBe(base);
    expect(hashRequest('post', '/api/v1/points/issue', '{"amount":1}')).toBe(base); // the method is upper-cased
    expect(hashRequest('PUT', '/api/v1/points/issue', '{"amount":1}')).not.toBe(base);
    expect(hashRequest('POST', '/api/v1/points/redeem', '{"amount":1}')).not.toBe(base);
    expect(hashRequest('POST', '/api/v1/points/issue?x=1', '{"amount":1}')).not.toBe(base);
    expect(hashRequest('POST', '/api/v1/points/issue', '{"amount":2}')).not.toBe(base);
    expect(hashRequest('POST', '/api/v1/points/issue', '{"amount": 1}')).not.toBe(base); // other bytes, other request
  });

  it('gives the same result for bytes and for the same text', () => {
    const text = '{"amount":1}';
    expect(hashRequest('POST', '/p', new TextEncoder().encode(text))).toBe(hashRequest('POST', '/p', text));
  });
});
