import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { withTransaction } from '../../src/db/client.js';
import { computeProofHash } from '../../src/lib/proof-hash.js';
import { issuePoints, redeemPoints } from '../../src/services/points.js';
import { insertTransaction, toTransactionView } from '../../src/services/transactions.js';
import type { Actor, ProofFields } from '../../src/types.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  balanceOf,
  countTransactions,
  insertApiKey,
  ledgerBalance,
  pointsFixture,
  setRules,
} from '../helpers/points.js';

// Task T07a acceptance criteria (the concurrency tests are in points-concurrency.test.ts).

let db: TestDatabase;
let sql: Sql;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
});
afterAll(async () => {
  await db.drop();
});

/** The code of the AppError that a promise rejects with. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return 'NO ERROR';
}

describe('issue', () => {
  it('computes points = floor(amount / earn_ratio): the remainder is lost', async () => {
    const f = await pointsFixture(sql); // earn_ratio 10000
    const cases: [number, number][] = [
      [100000, 10],
      [99999, 9],
      [15000, 1],
      [10000, 1],
    ];
    let expected = 0;
    for (const [amount, points] of cases) {
      const row = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount, actor: f.actor });
      expect(row.points).toBe(points);
      expected += points;
      expect(row.balanceAfter).toBe(expected);
    }
    expect(await balanceOf(sql, f.customerId)).toBe(21); // 10 + 9 + 1 + 1
  });

  it('stores the bill amount, the earn ratio used, the actor and a PENDING_ANCHOR status', async () => {
    const f = await pointsFixture(sql);
    const row = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 150000, actor: f.actor });

    expect(row).toMatchObject({
      type: 'ISSUE',
      merchantId: f.merchantId,
      customerId: f.customerId,
      customerCode: 'CUS001',
      points: 15,
      billAmount: 150000,
      earnRatio: 10000,
      balanceAfter: 15,
      reversesTransactionId: null,
      reversesCode: null,
      status: 'PENDING_ANCHOR',
      suiDigest: null,
    });
    expect(row.code).toMatch(/^TXN-[0-9]{8}-[A-Z0-9]{8}$/);

    const [stored] = await sql`SELECT * FROM transactions WHERE id = ${row.id}`;
    expect(stored.type).toBe('ISSUE');
    expect(Number(stored.bill_amount)).toBe(150000);
    expect(Number(stored.earn_ratio)).toBe(10000);
    expect(Number(stored.balance_after)).toBe(15);
    expect(String(stored.performed_by_user_id)).toBe(f.ownerId);
    expect(stored.performed_by_api_key_id).toBeNull();
    expect(stored.status).toBe('PENDING_ANCHOR');
    expect(stored.sui_digest).toBeNull();
  });

  it('writes a proof hash that the stored row reproduces by itself', async () => {
    const f = await pointsFixture(sql);
    const row = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 150000, actor: f.actor });
    const [stored] = await sql`SELECT code, merchant_id, type, points, created_at, proof_hash FROM transactions WHERE id = ${row.id}`;

    const fields: ProofFields = {
      transaction_id: String(stored.code),
      merchant_id: String(stored.merchant_id),
      customer_code: 'CUS001',
      type: 'ISSUE',
      points: Number(stored.points),
      created_at: (stored.created_at as Date).toISOString(),
    };
    expect(computeProofHash(fields)).toBe(stored.proof_hash);
    expect(row.proofHash).toBe(stored.proof_hash);
  });

  it('uses the rule that is saved NOW, and keeps the ratio used in each row (BR-22)', async () => {
    const f = await pointsFixture(sql);
    const first = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100000, actor: f.actor });
    await setRules(sql, f.merchantId, f.ownerId, 5000, 50);
    const second = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100000, actor: f.actor });

    expect(first.points).toBe(10);
    expect(second.points).toBe(20);
    const rows = await sql`SELECT earn_ratio FROM transactions WHERE customer_id = ${f.customerId} ORDER BY created_at, id`;
    expect(rows.map((r) => Number(r.earn_ratio))).toEqual([10000, 5000]);
  });

  it('answers MSG24 when the amount is too low to earn a point', async () => {
    const f = await pointsFixture(sql);
    expect(await codeOf(issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 9999, actor: f.actor }))).toBe('MSG24');
    expect(await countTransactions(sql, f.customerId)).toBe(0);
  });

  it('answers MSG33 for more than 1,000,000 points and for a balance above 1,000,000,000', async () => {
    const f = await pointsFixture(sql, { earnRatio: 1 });
    // 1,000,000,000 VND at 1 VND per point = 1,000,000,000 points: above the 1,000,000 per request ceiling
    expect(await codeOf(issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 1_000_000_000, actor: f.actor }))).toBe('MSG33');
    // exactly 1,000,000 points is allowed
    const ok = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 1_000_000, actor: f.actor });
    expect(ok.points).toBe(1_000_000);

    const g = await pointsFixture(sql, { earnRatio: 1, balance: 999_999_990 });
    expect(await codeOf(issuePoints(sql, { merchantId: g.merchantId, customerCode: 'CUS001', amount: 11, actor: g.actor }))).toBe('MSG33');
    expect(await balanceOf(sql, g.customerId)).toBe(999_999_990);
    const reachesMax = await issuePoints(sql, { merchantId: g.merchantId, customerCode: 'CUS001', amount: 10, actor: g.actor });
    expect(reachesMax.balanceAfter).toBe(1_000_000_000);
  });

  it('answers MSG33 for an amount that is not an integer from 1 to 1,000,000,000, and for a malformed code', async () => {
    const f = await pointsFixture(sql);
    for (const amount of [0, -5, 1.5, Number.NaN, 1_000_000_001]) {
      expect(await codeOf(issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount, actor: f.actor }))).toBe('MSG33');
    }
    for (const customerCode of ['cus001', 'CUS 001', '']) {
      expect(await codeOf(issuePoints(sql, { merchantId: f.merchantId, customerCode, amount: 100000, actor: f.actor }))).toBe('MSG33');
    }
    expect(await countTransactions(sql, f.customerId)).toBe(0);
  });
});

describe('redeem', () => {
  it('deducts the points, stores a REDEEM row without bill amount or ratio, and may reach exactly 0', async () => {
    const f = await pointsFixture(sql, { balance: 100, minRedemption: 10 }); // the last redeem (40) must reach the minimum
    const row = await redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 60, actor: f.actor });
    expect(row).toMatchObject({ type: 'REDEEM', points: 60, billAmount: null, earnRatio: null, balanceAfter: 40, status: 'PENDING_ANCHOR' });
    const [stored] = await sql`SELECT bill_amount, earn_ratio, balance_after FROM transactions WHERE id = ${row.id}`;
    expect(stored.bill_amount).toBeNull();
    expect(stored.earn_ratio).toBeNull();

    const last = await redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 40, actor: f.actor });
    expect(last.balanceAfter).toBe(0);
    expect(await balanceOf(sql, f.customerId)).toBe(0);
  });

  it('answers MSG08 when the balance does not cover the points, and changes nothing', async () => {
    const f = await pointsFixture(sql, { balance: 80 });
    expect(await codeOf(redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 81, actor: f.actor }))).toBe('MSG08');
    expect(await balanceOf(sql, f.customerId)).toBe(80);
    expect(await countTransactions(sql, f.customerId)).toBe(0);
  });

  it('answers MSG09 below the minimum, and checks it BEFORE the balance', async () => {
    const f = await pointsFixture(sql, { balance: 10, minRedemption: 50 });
    // 20 points: below the minimum AND above the balance: MSG09 comes first
    expect(await codeOf(redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 20, actor: f.actor }))).toBe('MSG09');
    const g = await pointsFixture(sql, { balance: 500, minRedemption: 50 });
    expect(await codeOf(redeemPoints(sql, { merchantId: g.merchantId, customerCode: 'CUS001', points: 49, actor: g.actor }))).toBe('MSG09');
    expect((await redeemPoints(sql, { merchantId: g.merchantId, customerCode: 'CUS001', points: 50, actor: g.actor })).points).toBe(50);
  });

  it('puts the minimum in the MSG09 text', async () => {
    const f = await pointsFixture(sql, { balance: 500, minRedemption: 75 });
    let thrown: unknown;
    try {
      await redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 10, actor: f.actor });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string }).code).toBe('MSG09');
    expect((thrown as { params?: Record<string, unknown> }).params).toEqual({ min_points: 75 });
  });

  it('answers MSG33 for points that are not an integer from 1 to 1,000,000', async () => {
    const f = await pointsFixture(sql, { balance: 5_000_000 });
    for (const points of [0, -1, 1.5, Number.NaN, 1_000_001]) {
      expect(await codeOf(redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points, actor: f.actor }))).toBe('MSG33');
    }
  });
});

describe('who may be served (order of checks for issue and redeem)', () => {
  const issue = (f: { merchantId: string; actor: Actor }, code = 'CUS001') =>
    issuePoints(sql, { merchantId: f.merchantId, customerCode: code, amount: 100000, actor: f.actor });
  const redeem = (f: { merchantId: string; actor: Actor }, code = 'CUS001') =>
    redeemPoints(sql, { merchantId: f.merchantId, customerCode: code, points: 50, actor: f.actor });

  it('answers MSG22 for an unknown customer and for a customer of another merchant', async () => {
    const f = await pointsFixture(sql, { balance: 100 });
    const other = await pointsFixture(sql, { balance: 100 });
    await sql`UPDATE customers SET customer_code = 'ONLYOTHER' WHERE id = ${other.customerId}`;
    expect(await codeOf(issue(f, 'NOSUCH'))).toBe('MSG22');
    expect(await codeOf(redeem(f, 'NOSUCH'))).toBe('MSG22');
    expect(await codeOf(issue(f, 'ONLYOTHER'))).toBe('MSG22');
    expect(await balanceOf(sql, other.customerId)).toBe(100);
  });

  it('answers MSG39 for an inactive customer', async () => {
    const f = await pointsFixture(sql, { balance: 100 });
    await sql`UPDATE customers SET is_active = false WHERE id = ${f.customerId}`;
    expect(await codeOf(issue(f))).toBe('MSG39');
    expect(await codeOf(redeem(f))).toBe('MSG39');
    expect(await balanceOf(sql, f.customerId)).toBe(100);
  });

  it('answers MSG32 when the rules were never saved (BR-22)', async () => {
    const f = await pointsFixture(sql, { balance: 100, withRules: false });
    expect(await codeOf(issue(f))).toBe('MSG32');
    expect(await codeOf(redeem(f))).toBe('MSG32');
    expect(await countTransactions(sql, f.customerId)).toBe(0);
  });

  it('looks at the customer before the rules: unknown customer without rules is MSG22, inactive without rules is MSG39', async () => {
    const f = await pointsFixture(sql, { withRules: false });
    expect(await codeOf(issue(f, 'NOSUCH'))).toBe('MSG22');
    await sql`UPDATE customers SET is_active = false WHERE id = ${f.customerId}`;
    expect(await codeOf(issue(f))).toBe('MSG39');
  });
});

describe('the ledger row', () => {
  it('names the API key when an API key performed the operation, and exactly one actor is stored', async () => {
    const f = await pointsFixture(sql);
    const apiKeyId = await insertApiKey(sql, f.merchantId, f.ownerId);
    const row = await issuePoints(sql, {
      merchantId: f.merchantId,
      customerCode: 'CUS001',
      amount: 100000,
      actor: { kind: 'API_KEY', apiKeyId },
    });
    expect(row.performedBy).toEqual({ kind: 'API_KEY', apiKeyId });
    const [stored] = await sql`SELECT performed_by_user_id, performed_by_api_key_id FROM transactions WHERE id = ${row.id}`;
    expect(stored.performed_by_user_id).toBeNull();
    expect(String(stored.performed_by_api_key_id)).toBe(apiKeyId);
  });

  it('tries another code when the first one is taken (a collision never aborts the transaction)', async () => {
    const f = await pointsFixture(sql);
    const first = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100000, actor: f.actor });

    const codes = [first.code, first.code, 'TXN-20261101-RETRY001'];
    const row = await withTransaction(sql, (tx) =>
      insertTransaction(
        tx,
        {
          type: 'ISSUE',
          merchantId: f.merchantId,
          customerId: f.customerId,
          customerCode: 'CUS001',
          points: 1,
          billAmount: 10000,
          earnRatio: 10000,
          balanceAfter: 11,
          reverses: null,
          actor: f.actor,
        },
        { generateCode: () => codes.shift()! },
      ),
    );
    expect(row.code).toBe('TXN-20261101-RETRY001');
    expect(codes).toEqual([]); // both taken codes were tried first
  });

  it('gives up with an error after too many collisions', async () => {
    const f = await pointsFixture(sql);
    const first = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100000, actor: f.actor });
    const attempt = withTransaction(sql, (tx) =>
      insertTransaction(
        tx,
        {
          type: 'ISSUE',
          merchantId: f.merchantId,
          customerId: f.customerId,
          customerCode: 'CUS001',
          points: 1,
          billAmount: 10000,
          earnRatio: 10000,
          balanceAfter: 11,
          reverses: null,
          actor: f.actor,
        },
        { generateCode: () => first.code },
      ),
    );
    await expect(attempt).rejects.toThrow(/unique transaction code/);
  });

  it('formats the JSON view of api-spec: explorer link only when ANCHORED', async () => {
    const f = await pointsFixture(sql);
    const row = await issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 150000, actor: f.actor });
    const template = 'https://suiscan.xyz/testnet/tx/{digest}';

    expect(toTransactionView(row, template)).toEqual({
      transaction_id: row.code,
      type: 'ISSUE',
      customer_code: 'CUS001',
      points: 15,
      balance_after: 15,
      status: 'PENDING_ANCHOR',
      sui_digest: null,
      explorer_url: null,
      reverses_transaction_id: null,
      created_at: row.createdAt.toISOString(),
    });
    const anchored = { ...row, status: 'ANCHORED' as const, suiDigest: 'DIGEST123' };
    expect(toTransactionView(anchored, template).explorer_url).toBe('https://suiscan.xyz/testnet/tx/DIGEST123');
    const failed = { ...row, status: 'FAILED' as const };
    expect(toTransactionView(failed, template).explorer_url).toBeNull();
  });

  it('keeps the ledger and the balance consistent after a mix of operations and failures', async () => {
    const f = await pointsFixture(sql); // balance 0
    const ops: (() => Promise<unknown>)[] = [
      () => issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 500000, actor: f.actor }), // +50
      () => redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 50, actor: f.actor }), // -50
      () => redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 50, actor: f.actor }), // MSG08
      () => issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 123456, actor: f.actor }), // +12
      () => issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 100, actor: f.actor }), // MSG24
    ];
    for (const op of ops) await op().catch(() => undefined);
    expect(await balanceOf(sql, f.customerId)).toBe(12);
    expect(await ledgerBalance(sql, f.customerId)).toBe(12);
    expect(await countTransactions(sql, f.customerId)).toBe(3);
  });
});

describe('merchants do not mix', () => {
  it('a merchant can only change its own customer even when the code is the same', async () => {
    const a = await pointsFixture(sql);
    const b = await pointsFixture(sql); // also has a customer CUS001
    await issuePoints(sql, { merchantId: a.merchantId, customerCode: 'CUS001', amount: 100000, actor: a.actor });
    expect(await balanceOf(sql, a.customerId)).toBe(10);
    expect(await balanceOf(sql, b.customerId)).toBe(0);
    expect(await countTransactions(sql, b.customerId)).toBe(0);
  });
});