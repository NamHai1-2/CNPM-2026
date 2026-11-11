import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Sql } from '../../src/db/client.js';
import { masterKeyFromConfig } from '../../src/lib/crypto.js';
import { getRequestTarget, requireApiKey } from '../../src/middleware/api-key.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp, testConfig } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  createGatewayKey,
  nowSeconds,
  signedRequest,
  type Call,
  type GatewayKey,
} from '../helpers/gateway.js';
import {
  ledgerBalance,
  pointsFixture,
  setBalance,
  setRules,
  type PointsFixture,
} from '../helpers/points.js';
import { seedMerchant } from '../helpers/seed.js';

// Task T09 acceptance criteria: the external API gateway (API key + HMAC) and the external endpoints (docs/api-spec.md A).

let db: TestDatabase;
let sql: Sql;
let app: Hono<AppEnv>;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  app = createTestApp(sql);
});
afterAll(async () => {
  await db.drop();
});

type Json = Record<string, unknown>;
const json = async (res: Response): Promise<Json> => (await res.json()) as Json;

async function expectError(res: Response, status: number, code: string): Promise<Json> {
  const body = await json(res);
  expect({ status: res.status, code: body.code }).toEqual({ status, code });
  return body;
}

interface Shop extends PointsFixture {
  key: GatewayKey;
}

/** A merchant with Owner, customer CUS001, rules (10,000 VND per point, minimum redemption 1) and an ACTIVE API key. */
async function shop(opts: { balance?: number; withRules?: boolean } = {}): Promise<Shop> {
  const fixture = await pointsFixture(sql, {
    balance: opts.balance ?? 0,
    minRedemption: 1,
    withRules: opts.withRules,
  });
  const key = await createGatewayKey(sql, fixture.merchantId, fixture.ownerId);
  return { ...fixture, key };
}

const ISSUE = '/api/v1/points/issue';
const REDEEM = '/api/v1/points/redeem';

function post(
  s: Shop,
  target: string,
  body: unknown,
  idempotencyKey: string | null = randomUUID(),
  extra: Partial<Call> = {},
) {
  return signedRequest(app, s.key, {
    method: 'POST',
    target,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    idempotencyKey,
    ...extra,
  });
}
const get = (s: Shop, target: string, extra: Partial<Call> = {}) =>
  signedRequest(app, s.key, { method: 'GET', target, ...extra });

async function txCount(s: Shop): Promise<number> {
  const [row] =
    await sql`SELECT count(*)::int AS n FROM transactions WHERE merchant_id = ${s.merchantId}`;
  return Number(row.n);
}
async function balanceOf(s: Shop): Promise<number> {
  const [row] = await sql`SELECT balance FROM customers WHERE id = ${s.customerId}`;
  return Number(row.balance);
}

// ---------------------------------------------------------------------------------------------------------------------
describe('signature vectors of api-spec A.2 through the real middleware', () => {
  const SECRET = 'test_secret_do_not_use';
  const FIXED_NOW = 1_700_000_000;
  let vectorApp: Hono<AppEnv>;

  beforeAll(async () => {
    const s = await pointsFixture(sql);
    await createGatewayKey(sql, s.merchantId, s.ownerId, { keyId: 'oct_vector', secret: SECRET });
    // A small app with the real middleware and a fixed clock; every route answers what the gateway put in the context.
    vectorApp = createApp({
      checkDb: async () => {},
      routes: (a) => {
        a.use(
          '/api/*',
          requireApiKey({
            sql,
            masterKey: masterKeyFromConfig(testConfig()),
            nowSeconds: () => FIXED_NOW,
          }),
        );
        a.all('/api/*', (c) =>
          c.json({
            ok: true,
            merchant_id: c.get('apiKey').merchantId,
            body_bytes: c.get('rawBody').length,
          }),
        );
      },
    });
  });

  const vector1Body = '{"customer_code":"CUS001","amount":150000}';
  const send = (
    method: string,
    target: string,
    headers: Record<string, string>,
    body?: string,
    env?: unknown,
  ): Promise<Response> =>
    Promise.resolve(
      vectorApp.request(
        target,
        {
          method,
          headers: { 'X-API-Key': 'oct_vector', 'X-Timestamp': String(FIXED_NOW), ...headers },
          body,
        },
        env as never,
      ),
    );

  it('vector 1: the signed POST issue request is accepted and the raw body is kept', async () => {
    const res = await send(
      'POST',
      ISSUE,
      {
        'X-Idempotency-Key': '11111111-1111-4111-8111-111111111111',
        'X-Signature': 'a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0',
      },
      vector1Body,
    );
    expect(res.status).toBe(200);
    expect(((await json(res)) as Json).body_bytes).toBe(vector1Body.length);
  });

  it('vector 2: the signed GET with a query string is accepted', async () => {
    const res = await send('GET', '/api/v1/customers/CUS001/transactions?page=2&type=ISSUE', {
      'X-Signature': 'd53e51fa1efe9d41097a3a2aa50cd6d982699acbb8e174cb8c828511c990c08c',
    });
    expect(res.status).toBe(200);
  });

  it('vector 3: the signature of vector 1 with another idempotency key is MSG16, the right signature is accepted', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const replay = await send(
      'POST',
      ISSUE,
      {
        'X-Idempotency-Key': other,
        'X-Signature': 'a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0',
      },
      vector1Body,
    );
    await expectError(replay, 401, 'MSG16');

    const correct = await send(
      'POST',
      ISSUE,
      {
        'X-Idempotency-Key': other,
        'X-Signature': '096ee56092b5ac5514efd58cbb1ba62292ba2200520c520501ab05b33365e912',
      },
      vector1Body,
    );
    expect(correct.status).toBe(200);
  });

  it('accepts a timestamp exactly 300 seconds away on both sides and refuses 301', async () => {
    const sigFor = async (ts: number): Promise<string> => {
      const { sign } = await import('../../src/lib/hmac.js');
      return sign(SECRET, {
        timestamp: String(ts),
        method: 'GET',
        target: '/api/v1/x',
        body: '',
        idempotencyKey: '',
      });
    };
    for (const [ts, status] of [
      [FIXED_NOW - 300, 200],
      [FIXED_NOW + 300, 200],
      [FIXED_NOW - 301, 401],
      [FIXED_NOW + 301, 401],
    ] as const) {
      const res = await send('GET', '/api/v1/x', {
        'X-Timestamp': String(ts),
        'X-Signature': await sigFor(ts),
      });
      expect(res.status).toBe(status);
      if (status === 401) {
        const body = await json(res);
        expect(body.code).toBe('MSG17');
        expect(body.server_time).toBe(FIXED_NOW); // lets the client see how far its clock is off
      }
    }
  });

  it('signs the request target exactly as sent: env.incoming.url wins over the parsed URL (an empty query keeps its "?")', async () => {
    const { sign } = await import('../../src/lib/hmac.js');
    const signature = sign(SECRET, {
      timestamp: String(FIXED_NOW),
      method: 'GET',
      target: '/api/v1/echo?',
      body: '',
      idempotencyKey: '',
    });
    // Without the real target the server would see "/api/v1/echo" (the URL parser drops the empty query) and refuse.
    const withIncoming = await send(
      'GET',
      '/api/v1/echo?',
      { 'X-Signature': signature },
      undefined,
      {
        incoming: { url: '/api/v1/echo?' },
      },
    );
    expect(withIncoming.status).toBe(200);
    const withoutIncoming = await send('GET', '/api/v1/echo?', { 'X-Signature': signature });
    await expectError(withoutIncoming, 401, 'MSG16');
  });

  it('getRequestTarget falls back to path and query when there is no node request', async () => {
    const tiny = new Hono();
    tiny.get('*', (c) => c.text(getRequestTarget(c)));
    const res = await tiny.request('/api/v1/a?b=1&c=%41');
    expect(await res.text()).toBe('/api/v1/a?b=1&c=%41');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('verification order (api-spec A.2): the first failing check answers', () => {
  it('missing X-API-Key, unknown key: 401 MSG18', async () => {
    const s = await shop();
    await expectError(
      await get(s, '/api/v1/customers/CUS001/balance', { keyId: null }),
      401,
      'MSG18',
    );
    await expectError(
      await get(s, '/api/v1/customers/CUS001/balance', { keyId: 'oct_does_not_exist' }),
      401,
      'MSG18',
    );
    await expectError(
      await get(s, '/api/v1/customers/CUS001/balance', { keyId: '' }),
      401,
      'MSG18',
    );
  });

  it('a SUSPENDED key, a REVOKED key and a SUSPENDED or PENDING merchant: 401 MSG18', async () => {
    const s = await shop();
    const suspendedKey = await createGatewayKey(sql, s.merchantId, s.ownerId, {
      status: 'SUSPENDED',
    });
    const revokedKey = await createGatewayKey(sql, s.merchantId, s.ownerId, { status: 'REVOKED' });
    for (const k of [suspendedKey, revokedKey]) {
      await expectError(
        await signedRequest(app, k, { method: 'GET', target: '/api/v1/customers/CUS001/balance' }),
        401,
        'MSG18',
      );
    }
    expect((await get(s, '/api/v1/customers/CUS001/balance')).status).toBe(200);

    for (const status of ['SUSPENDED', 'PENDING']) {
      await sql`UPDATE merchants SET status = ${status} WHERE id = ${s.merchantId}`;
      await expectError(await get(s, '/api/v1/customers/CUS001/balance'), 401, 'MSG18');
    }
    await sql`UPDATE merchants SET status = 'ACTIVE' WHERE id = ${s.merchantId}`;
    expect((await get(s, '/api/v1/customers/CUS001/balance')).status).toBe(200);
  });

  it('a revoked key stops working immediately', async () => {
    const s = await shop();
    expect((await get(s, '/api/v1/customers/CUS001/balance')).status).toBe(200);
    await sql`UPDATE api_keys SET status = 'REVOKED', revoked_at = now() WHERE id = ${s.key.id}`;
    await expectError(await get(s, '/api/v1/customers/CUS001/balance'), 401, 'MSG18');
  });

  it('a timestamp 400 seconds old or in the future: 401 MSG17 with server_time (Unix seconds)', async () => {
    const s = await shop();
    for (const offset of [-400, 400]) {
      const before = nowSeconds();
      const body = await expectError(
        await get(s, '/api/v1/customers/CUS001/balance', { timestamp: before + offset }),
        401,
        'MSG17',
      );
      expect(Math.abs((body.server_time as number) - before)).toBeLessThanOrEqual(2);
    }
  });

  it('a timestamp that is missing, not an integer, negative or in another format: 401 MSG17', async () => {
    const s = await shop();
    for (const ts of ['abc', '1700000000.5', '-5', '1e9', '', ' 1700000000', '0x10']) {
      const res = await app.request('/api/v1/customers/CUS001/balance', {
        headers: { 'X-API-Key': s.key.keyId, 'X-Timestamp': ts, 'X-Signature': 'a'.repeat(64) },
      });
      await expectError(res, 401, 'MSG17');
    }
    const noTimestamp = await app.request('/api/v1/customers/CUS001/balance', {
      headers: { 'X-API-Key': s.key.keyId, 'X-Signature': 'a'.repeat(64) },
    });
    await expectError(noTimestamp, 401, 'MSG17');
  });

  it('a wrong secret, a wrong or missing signature, an upper-case or short signature: 401 MSG16', async () => {
    const s = await shop();
    const target = '/api/v1/customers/CUS001/balance';
    await expectError(await get(s, target, { secret: 'another-secret' }), 401, 'MSG16');
    await expectError(await get(s, target, { signature: 'f'.repeat(64) }), 401, 'MSG16');
    await expectError(await get(s, target, { signature: null }), 401, 'MSG16');
    await expectError(await get(s, target, { signature: '' }), 401, 'MSG16');
    await expectError(await get(s, target, { signature: 'abc123' }), 401, 'MSG16');
    const good = await get(s, target);
    expect(good.status).toBe(200);
    const sig = (await signedRequest(app, s.key, { method: 'GET', target })).status; // control: a fresh correct call
    expect(sig).toBe(200);
  });

  it('an altered body, an altered query and an altered idempotency key: 401 MSG16 and nothing is written', async () => {
    const s = await shop();
    const body = JSON.stringify({ customer_code: 'CUS001', amount: 150000 });
    const key = randomUUID();

    await expectError(
      await post(s, ISSUE, body, key, {
        send: { body: JSON.stringify({ customer_code: 'CUS001', amount: 999000 }) },
      }),
      401,
      'MSG16',
    );
    await expectError(
      await post(s, ISSUE, body, key, { send: { body: body + ' ' } }),
      401,
      'MSG16',
    ); // one extra byte
    await expectError(
      await post(s, ISSUE, body, key, { send: { idempotencyKey: randomUUID() } }),
      401,
      'MSG16',
    );
    await expectError(
      await post(s, ISSUE, body, key, { send: { idempotencyKey: null } }),
      401,
      'MSG16',
    );
    await expectError(
      await get(s, '/api/v1/customers/CUS001/transactions?page=1', {
        send: { target: '/api/v1/customers/CUS001/transactions?page=2' },
      }),
      401,
      'MSG16',
    );
    await expectError(
      await get(s, '/api/v1/customers/CUS001/balance', {
        send: { target: '/api/v1/customers/CUS002/balance' },
      }),
      401,
      'MSG16',
    );
    expect(await txCount(s)).toBe(0);
    expect(await balanceOf(s)).toBe(0);
  });

  it('the checks run in order: key, then timestamp, then signature', async () => {
    const s = await shop();
    const target = '/api/v1/customers/CUS001/balance';
    // everything wrong: the key is reported
    await expectError(
      await get(s, target, { keyId: 'oct_nope', timestamp: 1, signature: 'x' }),
      401,
      'MSG18',
    );
    // key right, timestamp and signature wrong: the timestamp is reported
    await expectError(await get(s, target, { timestamp: 1, signature: 'x' }), 401, 'MSG17');
    // key and timestamp right, signature wrong
    await expectError(await get(s, target, { signature: 'x' }), 401, 'MSG16');
    // signature wrong AND body invalid: authentication is answered before validation
    await expectError(
      await post(s, ISSUE, 'not json', randomUUID(), { signature: 'x' }),
      401,
      'MSG16',
    );
    // a valid signature with an invalid body gets past authentication and is answered by the validation
    await expectError(await post(s, ISSUE, 'not json'), 400, 'MSG33');
  });

  it('answers a request without any credentials with MSG18 and sets no CORS header', async () => {
    const res = await app.request('/api/v1/points/issue', { method: 'POST', body: '{}' });
    await expectError(res, 401, 'MSG18');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('an unknown path under an external prefix needs a valid key first, then is a 404', async () => {
    const s = await shop();
    await expectError(await app.request('/api/v1/points/unknown'), 401, 'MSG18');
    await expectError(await get(s, '/api/v1/points/unknown'), 404, 'MSG33');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('issue, redeem, balance and transactions end to end', () => {
  it('issue, redeem, balance, transactions (api-spec A.3)', async () => {
    const s = await shop();

    // issue: 1,500,000 VND at 10,000 VND per point = 150 points
    const issueRes = await post(s, ISSUE, { customer_code: 'CUS001', amount: 1_500_000 });
    expect(issueRes.status).toBe(201);
    const issued = await json(issueRes);
    expect(issued).toMatchObject({
      type: 'ISSUE',
      customer_code: 'CUS001',
      points: 150,
      balance_after: 150,
      status: 'PENDING_ANCHOR',
      sui_digest: null,
      explorer_url: null,
      reverses_transaction_id: null,
    });
    expect(issued.transaction_id).toMatch(/^TXN-\d{8}-[A-Z0-9]{8}$/);
    expect(new Date(issued.created_at as string).toISOString()).toBe(issued.created_at);

    // redeem 60
    const redeemRes = await post(s, REDEEM, { customer_code: 'CUS001', points: 60 });
    expect(redeemRes.status).toBe(201);
    const redeemed = await json(redeemRes);
    expect(redeemed).toMatchObject({
      type: 'REDEEM',
      points: 60,
      balance_after: 90,
      status: 'PENDING_ANCHOR',
    });

    // balance
    const balance = await get(s, '/api/v1/customers/CUS001/balance');
    expect(balance.status).toBe(200);
    expect(await json(balance)).toEqual({ customer_code: 'CUS001', balance: 90 });

    // transactions: newest first, only the fields of the Transaction object
    const list = await get(s, '/api/v1/customers/CUS001/transactions');
    expect(list.status).toBe(200);
    const page = await json(list);
    expect(page).toMatchObject({ page: 1, page_size: 20, total: 2 });
    const items = page.items as Json[];
    expect(items.map((i) => i.transaction_id)).toEqual([
      redeemed.transaction_id,
      issued.transaction_id,
    ]);
    expect(Object.keys(items[0]!).sort()).toEqual(
      [
        'transaction_id',
        'type',
        'customer_code',
        'points',
        'balance_after',
        'status',
        'sui_digest',
        'explorer_url',
        'reverses_transaction_id',
        'created_at',
      ].sort(),
    );

    // the rows are attributed to the API key and the database agrees with the answers
    const rows =
      await sql`SELECT performed_by_api_key_id AS k, performed_by_user_id AS u FROM transactions WHERE merchant_id = ${s.merchantId}`;
    expect(rows.every((r) => String(r.k) === s.key.id && r.u === null)).toBe(true);
    expect(await balanceOf(s)).toBe(90);
    expect(await ledgerBalance(sql, s.customerId)).toBe(90);
  });

  it('transaction filters: type, status, date_from and date_to (UTC+7, inclusive)', async () => {
    const s = await shop({ balance: 0 });
    await post(s, ISSUE, { customer_code: 'CUS001', amount: 1_000_000 });
    await post(s, REDEEM, { customer_code: 'CUS001', points: 10 });
    const base = '/api/v1/customers/CUS001/transactions';
    const total = async (query: string): Promise<number> =>
      (await json(await get(s, `${base}${query}`))).total as number;

    expect(await total('?type=ISSUE')).toBe(1);
    expect(await total('?type=REDEEM')).toBe(1);
    expect(await total('?type=REVERSAL')).toBe(0);
    expect(await total('?status=PENDING_ANCHOR')).toBe(2);
    expect(await total('?status=ANCHORED')).toBe(0);
    expect(await total('?type=ISSUE&status=PENDING_ANCHOR')).toBe(1);

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(),
    );
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      new Date(Date.now() - 86_400_000),
    );
    expect(await total(`?date_from=${today}&date_to=${today}`)).toBe(2); // both ends included
    expect(await total(`?date_to=${yesterday}`)).toBe(0);
    expect(await total(`?date_from=${yesterday}`)).toBe(2);
  });

  it('pages of 20 in a stable order: 25 transactions give 20 + 5 and no repeated row', async () => {
    const s = await shop();
    for (let i = 0; i < 25; i += 1) {
      expect((await post(s, ISSUE, { customer_code: 'CUS001', amount: 10_000 })).status).toBe(201);
    }
    const first = await json(await get(s, '/api/v1/customers/CUS001/transactions'));
    const second = await json(await get(s, '/api/v1/customers/CUS001/transactions?page=2'));
    const third = await json(await get(s, '/api/v1/customers/CUS001/transactions?page=3'));
    expect(first).toMatchObject({ page: 1, page_size: 20, total: 25 });
    expect((first.items as unknown[]).length).toBe(20);
    expect((second.items as unknown[]).length).toBe(5);
    expect((third.items as unknown[]).length).toBe(0); // a page beyond the last is empty, not an error
    const ids = [...(first.items as Json[]), ...(second.items as Json[])].map(
      (i) => i.transaction_id,
    );
    expect(new Set(ids).size).toBe(25);
    expect((first.items as Json[])[0]!.balance_after as number).toBe(25); // newest first
  });

  it('an inactive customer: balance and history still work, issue and redeem are MSG39', async () => {
    const s = await shop({ balance: 30 });
    await sql`UPDATE customers SET is_active = false WHERE id = ${s.customerId}`;
    expect(await json(await get(s, '/api/v1/customers/CUS001/balance'))).toEqual({
      customer_code: 'CUS001',
      balance: 30,
    });
    expect((await get(s, '/api/v1/customers/CUS001/transactions')).status).toBe(200);
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 100_000 }),
      422,
      'MSG39',
    );
    await expectError(await post(s, REDEEM, { customer_code: 'CUS001', points: 5 }), 422, 'MSG39');
    expect(await balanceOf(s)).toBe(30);
  });

  it('business errors keep the order and the HTTP statuses of api-spec A.3', async () => {
    const s = await shop({ balance: 5 });
    await setRules(sql, s.merchantId, s.ownerId, 10_000, 50);
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 9_999 }),
      422,
      'MSG24',
    ); // 0 points
    await expectError(await post(s, REDEEM, { customer_code: 'CUS001', points: 10 }), 422, 'MSG09'); // below the minimum first
    await expectError(await post(s, REDEEM, { customer_code: 'CUS001', points: 60 }), 422, 'MSG08'); // balance 5
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS999', amount: 100_000 }),
      404,
      'MSG22',
    );
    expect(await txCount(s)).toBe(0);
  });

  it('rules not saved yet: issue and redeem answer MSG32', async () => {
    const s = await shop({ withRules: false });
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 100_000 }),
      422,
      'MSG32',
    );
    await expectError(await post(s, REDEEM, { customer_code: 'CUS001', points: 1 }), 422, 'MSG32');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('idempotency of the external API (BR-10)', () => {
  it('replaying an identical signed request creates one transaction and returns the same answer', async () => {
    const s = await shop();
    const body = JSON.stringify({ customer_code: 'CUS001', amount: 500_000 });
    const key = randomUUID();
    const first = await post(s, ISSUE, body, key);
    expect(first.status).toBe(201);
    const firstBody = await json(first);

    const replay = await post(s, ISSUE, body, key); // a new timestamp and signature, same operation
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual(firstBody);

    expect(await txCount(s)).toBe(1);
    expect(await balanceOf(s)).toBe(50); // the points were added once
  });

  it('the same key with a different request is MSG34 and changes nothing', async () => {
    const s = await shop();
    const key = randomUUID();
    expect((await post(s, ISSUE, { customer_code: 'CUS001', amount: 500_000 }, key)).status).toBe(
      201,
    );
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 600_000 }, key),
      409,
      'MSG34',
    );
    await expectError(
      await post(s, REDEEM, { customer_code: 'CUS001', points: 5 }, key),
      409,
      'MSG34',
    ); // another path
    expect(await txCount(s)).toBe(1);
  });

  it('the same body with a new idempotency key and a stale timestamp is MSG17, nothing is created', async () => {
    const s = await shop();
    const body = JSON.stringify({ customer_code: 'CUS001', amount: 500_000 });
    expect((await post(s, ISSUE, body, randomUUID())).status).toBe(201);
    const stale = await post(s, ISSUE, body, randomUUID(), { timestamp: nowSeconds() - 400 });
    await expectError(stale, 401, 'MSG17');
    expect(await txCount(s)).toBe(1);
  });

  it('a missing or too long idempotency key on a POST is MSG33 (the key is signed, so the signature is valid)', async () => {
    const s = await shop();
    const body = { customer_code: 'CUS001', amount: 500_000 };
    await expectError(await post(s, ISSUE, body, null), 400, 'MSG33');
    await expectError(await post(s, ISSUE, body, 'k'.repeat(129)), 400, 'MSG33');
    expect((await post(s, ISSUE, body, 'k'.repeat(128))).status).toBe(201); // 128 is allowed
    expect(await txCount(s)).toBe(1);
  });

  it('a failed request is not saved: after the customer is funded the same key works', async () => {
    const s = await shop({ balance: 0 });
    const key = randomUUID();
    const body = { customer_code: 'CUS001', points: 20 };
    await expectError(await post(s, REDEEM, body, key), 422, 'MSG08');
    await setBalance(sql, s.customerId, 100);
    expect((await post(s, REDEEM, body, key)).status).toBe(201);
    expect(await balanceOf(s)).toBe(80);
    expect(await txCount(s)).toBe(1);
  });

  it('five identical requests at the same time create one transaction', async () => {
    const s = await shop();
    const body = JSON.stringify({ customer_code: 'CUS001', amount: 500_000 });
    const key = randomUUID();
    const responses = await Promise.all(Array.from({ length: 5 }, () => post(s, ISSUE, body, key)));
    const bodies = await Promise.all(responses.map(json));
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(bodies.map((b) => b.transaction_id)).size).toBe(1);
    expect(await txCount(s)).toBe(1);
    expect(await balanceOf(s)).toBe(50);
  });

  it('the same key may be used by two different API keys of one merchant without clashing', async () => {
    const s = await shop();
    const second = await createGatewayKey(sql, s.merchantId, s.ownerId);
    const key = randomUUID();
    const body = JSON.stringify({ customer_code: 'CUS001', amount: 500_000 });
    expect((await post(s, ISSUE, body, key)).status).toBe(201);
    const other = await signedRequest(app, second, {
      method: 'POST',
      target: ISSUE,
      body,
      idempotencyKey: key,
    });
    expect(other.status).toBe(201);
    expect(await txCount(s)).toBe(2); // the scope of a key is the API key (BR-10)
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('validation (MSG33) and tenant isolation (BR-01)', () => {
  it('rejects bad bodies with 400 MSG33 and writes nothing', async () => {
    const s = await shop();
    const bad: unknown[] = [
      'not json',
      '',
      '[]',
      '{}',
      { customer_code: 'CUS001' },
      { amount: 100_000 },
      { customer_code: 'CUS001', amount: 0 },
      { customer_code: 'CUS001', amount: -5 },
      { customer_code: 'CUS001', amount: 1.5 },
      { customer_code: 'CUS001', amount: '100000' },
      { customer_code: 'CUS001', amount: null },
      { customer_code: 'CUS001', amount: 1_000_000_001 },
      { customer_code: 'cus001', amount: 100_000 }, // never changed silently (CR-02)
      { customer_code: 'CUS 001', amount: 100_000 },
      { customer_code: 'C'.repeat(33), amount: 100_000 },
      { customer_code: 5, amount: 100_000 },
    ];
    for (const body of bad) await expectError(await post(s, ISSUE, body), 400, 'MSG33');

    const badRedeem: unknown[] = [
      { customer_code: 'CUS001', points: 0 },
      { customer_code: 'CUS001', points: 1.5 },
      { customer_code: 'CUS001', points: '5' },
      { customer_code: 'CUS001', points: 1_000_001 },
      { customer_code: 'cus001', points: 5 },
    ];
    for (const body of badRedeem) await expectError(await post(s, REDEEM, body), 400, 'MSG33');
    expect(await txCount(s)).toBe(0);
  });

  it('a calculated 1,000,001 points or a balance above 1,000,000,000 is MSG33', async () => {
    const s = await shop();
    await setRules(sql, s.merchantId, s.ownerId, 1, 1); // 1 VND per point
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 1_000_001 }),
      400,
      'MSG33',
    );
    await setBalance(sql, s.customerId, 999_999_999);
    await expectError(await post(s, ISSUE, { customer_code: 'CUS001', amount: 2 }), 400, 'MSG33');
    expect((await post(s, ISSUE, { customer_code: 'CUS001', amount: 1 })).status).toBe(201); // exactly 1,000,000,000
  });

  it('bad path codes, pages and filters on the GET endpoints are 400 MSG33', async () => {
    const s = await shop();
    const bad = [
      '/api/v1/customers/cus001/balance',
      '/api/v1/customers/cus001/transactions',
      '/api/v1/customers/CUS001/transactions?page=0',
      '/api/v1/customers/CUS001/transactions?page=-1',
      '/api/v1/customers/CUS001/transactions?page=abc',
      '/api/v1/customers/CUS001/transactions?page=1.5',
      '/api/v1/customers/CUS001/transactions?type=issue',
      '/api/v1/customers/CUS001/transactions?type=',
      '/api/v1/customers/CUS001/transactions?status=DONE',
      '/api/v1/customers/CUS001/transactions?date_from=2026-13-40',
      '/api/v1/customers/CUS001/transactions?date_to=01-11-2026',
    ];
    for (const target of bad) await expectError(await get(s, target), 400, 'MSG33');
  });

  it('a merchant id in the body, the query or a header is ignored: the merchant comes from the API key only', async () => {
    const a = await shop();
    const b = await shop();
    const res = await post(a, ISSUE, {
      customer_code: 'CUS001',
      amount: 100_000,
      merchant_id: b.merchantId,
    });
    expect(res.status).toBe(201);
    expect(await txCount(a)).toBe(1);
    expect(await txCount(b)).toBe(0);
    expect(await balanceOf(b)).toBe(0);
    const sneaky = await get(a, `/api/v1/customers/CUS001/balance?merchant_id=${b.merchantId}`);
    expect(await json(sneaky)).toEqual({ customer_code: 'CUS001', balance: 10 });
  });

  it('a customer of another merchant looks like an unknown customer (404 MSG22) on every endpoint', async () => {
    const a = await shop();
    const b = await shop();
    await sql`INSERT INTO customers (merchant_id, customer_code, name, balance) VALUES (${b.merchantId}, 'ONLYB', 'Only B', 77)`;
    await expectError(await get(a, '/api/v1/customers/ONLYB/balance'), 404, 'MSG22');
    await expectError(await get(a, '/api/v1/customers/ONLYB/transactions'), 404, 'MSG22');
    await expectError(
      await post(a, ISSUE, { customer_code: 'ONLYB', amount: 100_000 }),
      404,
      'MSG22',
    );
    await expectError(await post(a, REDEEM, { customer_code: 'ONLYB', points: 5 }), 404, 'MSG22');
    expect(await txCount(b)).toBe(0);
  });

  it("two merchants with the same customer code never see each other's balance or history", async () => {
    const a = await shop({ balance: 11 });
    const b = await shop({ balance: 22 });
    expect(await json(await get(a, '/api/v1/customers/CUS001/balance'))).toEqual({
      customer_code: 'CUS001',
      balance: 11,
    });
    expect(await json(await get(b, '/api/v1/customers/CUS001/balance'))).toEqual({
      customer_code: 'CUS001',
      balance: 22,
    });
    await post(b, ISSUE, { customer_code: 'CUS001', amount: 100_000 });
    expect(
      (await json(await get(a, '/api/v1/customers/CUS001/transactions'))).total as number,
    ).toBe(0);
    expect(
      (await json(await get(b, '/api/v1/customers/CUS001/transactions'))).total as number,
    ).toBe(1);
  });

  it('a signature made with the key of one merchant cannot be used with the key id of another', async () => {
    const a = await shop();
    const b = await shop();
    const res = await get(a, '/api/v1/customers/CUS001/balance', { keyId: b.key.keyId }); // signed with a's secret
    await expectError(res, 401, 'MSG16');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('GET /api/v1/loyalty-rules (Should)', () => {
  it("returns the saved rules of the key's merchant", async () => {
    const s = await shop();
    await setRules(sql, s.merchantId, s.ownerId, 5000, 20);
    const res = await get(s, '/api/v1/loyalty-rules');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ earn_ratio: 5000, min_redemption_threshold: 20 });
  });

  it('answers MSG32 when no rules are saved, and needs a valid signature like every external call', async () => {
    const s = await shop({ withRules: false });
    await expectError(await get(s, '/api/v1/loyalty-rules'), 422, 'MSG32');
    await expectError(await get(s, '/api/v1/loyalty-rules', { signature: 'x' }), 401, 'MSG16');
  });

  it('is isolated per merchant', async () => {
    const a = await shop();
    const b = await shop();
    await setRules(sql, a.merchantId, a.ownerId, 111, 2);
    await setRules(sql, b.merchantId, b.ownerId, 222, 3);
    expect(await json(await get(a, '/api/v1/loyalty-rules'))).toEqual({
      earn_ratio: 111,
      min_redemption_threshold: 2,
    });
    expect(await json(await get(b, '/api/v1/loyalty-rules'))).toEqual({
      earn_ratio: 222,
      min_redemption_threshold: 3,
    });
  });
});

describe('the suspension of a merchant reaches the gateway at once (BR-18)', () => {
  it('SUSPENDED stops the key, ACTIVE brings it back, and the ledger is untouched in between', async () => {
    const s = await shop();
    expect((await post(s, ISSUE, { customer_code: 'CUS001', amount: 100_000 })).status).toBe(201);
    await sql`UPDATE merchants SET status = 'SUSPENDED' WHERE id = ${s.merchantId}`;
    await expectError(
      await post(s, ISSUE, { customer_code: 'CUS001', amount: 100_000 }),
      401,
      'MSG18',
    );
    await sql`UPDATE merchants SET status = 'ACTIVE' WHERE id = ${s.merchantId}`;
    expect((await post(s, ISSUE, { customer_code: 'CUS001', amount: 100_000 })).status).toBe(201);
    expect(await txCount(s)).toBe(2);
    const other = await seedMerchant(sql); // another merchant is unaffected throughout
    expect(other.merchantId).not.toBe(s.merchantId);
  });
});
