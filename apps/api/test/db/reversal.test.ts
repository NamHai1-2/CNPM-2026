import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { computeProofHash } from '../../src/lib/proof-hash.js';
import { reverseTransaction } from '../../src/services/ledger.js';
import { issuePoints, redeemPoints } from '../../src/services/points.js';
import type { AppEnv, ProofFields } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  balanceOf,
  countTransactions,
  ledgerBalance,
  pointsFixture,
  setBalance,
  setRules,
  type PointsFixture,
} from '../helpers/points.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T08 acceptance criteria: reversal (UC-14, BR-03, BR-05, BR-21).

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

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return 'NO ERROR';
}

const issue = (f: PointsFixture, amount = 100000) =>
  issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount, actor: f.actor }); // 100000 at 10000 = 10 points
const redeem = (f: PointsFixture, points = 10) =>
  redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points, actor: f.actor });
const reverse = (f: PointsFixture, transactionCode: string) =>
  reverseTransaction(sql, { merchantId: f.merchantId, transactionCode, actor: { kind: 'USER', userId: f.ownerId } });

/** A fixture whose rules let a redeem of any size through (minimum 1) and whose balance starts at 0. */
const fixture = (balance = 0) => pointsFixture(sql, { balance, minRedemption: 1 });

describe('reversing an ISSUE', () => {
  it('takes the points back and writes a REVERSAL linked to the original, with who did it', async () => {
    const f = await fixture();
    const original = await issue(f); // balance 10
    const reversal = await reverse(f, original.code);

    expect(reversal).toMatchObject({
      type: 'REVERSAL',
      merchantId: f.merchantId,
      customerId: f.customerId,
      customerCode: 'CUS001',
      points: 10,
      billAmount: null,
      earnRatio: null,
      balanceAfter: 0,
      reversesTransactionId: original.id,
      reversesCode: original.code,
      performedBy: { kind: 'USER', userId: f.ownerId },
      status: 'PENDING_ANCHOR',
      suiDigest: null,
    });
    expect(reversal.code).toMatch(/^TXN-[0-9]{8}-[A-Z0-9]{8}$/);
    expect(reversal.code).not.toBe(original.code);
    expect(await balanceOf(sql, f.customerId)).toBe(0);
  });

  it('never changes the original row (BR-03)', async () => {
    const f = await fixture();
    const original = await issue(f);
    const [before] = await sql`SELECT * FROM transactions WHERE id = ${original.id}`;
    await reverse(f, original.code);
    const [after] = await sql`SELECT * FROM transactions WHERE id = ${original.id}`;
    expect(after).toEqual(before);
  });

  it('writes a proof hash that includes the original code and that the stored row reproduces', async () => {
    const f = await fixture();
    const original = await issue(f);
    const reversal = await reverse(f, original.code);
    const [stored] = await sql`SELECT code, merchant_id, type, points, created_at, proof_hash FROM transactions WHERE id = ${reversal.id}`;

    const fields: ProofFields = {
      transaction_id: String(stored.code),
      merchant_id: String(stored.merchant_id),
      customer_code: 'CUS001',
      type: 'REVERSAL',
      points: Number(stored.points),
      created_at: (stored.created_at as Date).toISOString(),
      reverses_transaction_id: original.code,
    };
    expect(computeProofHash(fields)).toBe(stored.proof_hash);
    const withoutLink: ProofFields = { ...fields };
    delete withoutLink.reverses_transaction_id;
    expect(computeProofHash(withoutLink)).not.toBe(stored.proof_hash);
  });

  it('answers MSG25 when the customer already spent the points, and changes nothing', async () => {
    const f = await fixture();
    const original = await issue(f); // +10
    await redeem(f, 10); // balance 0
    const before = await countTransactions(sql, f.customerId);

    expect(await codeOf(reverse(f, original.code))).toBe('MSG25');
    expect(await balanceOf(sql, f.customerId)).toBe(0);
    expect(await countTransactions(sql, f.customerId)).toBe(before);
    expect(await sql`SELECT 1 FROM transactions WHERE reverses_transaction_id = ${original.id}`).toHaveLength(0);
  });

  it('allows the reversal when exactly enough points are left', async () => {
    const f = await fixture();
    const original = await issue(f); // +10
    await redeem(f, 4); // 6 left: not enough for 10
    expect(await codeOf(reverse(f, original.code))).toBe('MSG25');
    await setBalance(sql, f.customerId, 10);
    expect((await reverse(f, original.code)).balanceAfter).toBe(0);
  });
});

describe('reversing a REDEEM', () => {
  it('gives the points back', async () => {
    const f = await fixture(50);
    const spent = await redeem(f, 20); // balance 30
    const reversal = await reverse(f, spent.code);
    expect(reversal).toMatchObject({ type: 'REVERSAL', points: 20, balanceAfter: 50, reversesCode: spent.code });
    expect(await balanceOf(sql, f.customerId)).toBe(50);
  });

  it('answers MSG41 when giving the points back would pass 1,000,000,000', async () => {
    const f = await fixture(1_000_000_000);
    const spent = await redeem(f, 10); // 999,999,990
    await issue(f); // +10 = 1,000,000,000
    expect(await codeOf(reverse(f, spent.code))).toBe('MSG41');
    expect(await balanceOf(sql, f.customerId)).toBe(1_000_000_000);
    expect(await sql`SELECT 1 FROM transactions WHERE reverses_transaction_id = ${spent.id}`).toHaveLength(0);
  });
});

describe('what cannot be reversed, and what is not found', () => {
  it('answers MSG26 for a second reversal of the same transaction and for a reversal of a reversal', async () => {
    const f = await fixture();
    const original = await issue(f);
    const reversal = await reverse(f, original.code);
    expect(await codeOf(reverse(f, original.code))).toBe('MSG26');
    expect(await codeOf(reverse(f, reversal.code))).toBe('MSG26');
    expect(await balanceOf(sql, f.customerId)).toBe(0);
    expect(await sql`SELECT 1 FROM transactions WHERE reverses_transaction_id = ${original.id}`).toHaveLength(1);
  });

  it('answers MSG22 for an unknown code and for a transaction of another merchant, and MSG33 for a malformed code', async () => {
    const f = await fixture();
    const other = await fixture();
    const theirs = await issue(other);
    expect(await codeOf(reverse(f, 'TXN-20260101-ZZZZZZZZ'))).toBe('MSG22');
    expect(await codeOf(reverse(f, theirs.code))).toBe('MSG22');
    expect(await balanceOf(sql, other.customerId)).toBe(10); // untouched
    for (const bad of ['', 'txn-20260101-ZZZZZZZZ', 'TXN-2026-ZZZZZZZZ', 'not a code']) {
      expect(await codeOf(reverse(f, bad))).toBe('MSG33');
    }
  });

  it('works for an inactive customer and whatever the anchoring status of the original', async () => {
    const f = await fixture();
    const a = await issue(f);
    const b = await issue(f);
    const c = await issue(f);
    await sql`UPDATE transactions SET status = 'FAILED' WHERE id = ${b.id}`;
    await sql`UPDATE transactions SET status = 'ANCHORED', sui_digest = 'D1' WHERE id = ${c.id}`;
    await sql`UPDATE customers SET is_active = false WHERE id = ${f.customerId}`;

    for (const original of [a, b, c]) {
      expect((await reverse(f, original.code)).type).toBe('REVERSAL');
    }
    expect(await balanceOf(sql, f.customerId)).toBe(0);
  });
});

describe('simultaneous requests', () => {
  it('five reversals of the same transaction at once: exactly one succeeds, the others get MSG26, the balance moves once', async () => {
    const f = await fixture();
    const original = await issue(f);
    await issue(f); // balance 20, so a second reversal would not fail for lack of points
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => reverse(f, original.code)));

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed.map((r) => (r.reason as { code?: string }).code)).toEqual(['MSG26', 'MSG26', 'MSG26', 'MSG26']);
    expect(await balanceOf(sql, f.customerId)).toBe(10);
    expect(await sql`SELECT 1 FROM transactions WHERE reverses_transaction_id = ${original.id}`).toHaveLength(1);
  });

  it('a reversal and a redeem at the same time never make the balance negative', async () => {
    const f = await fixture();
    const original = await issue(f); // +10
    const results = await Promise.allSettled([reverse(f, original.code), redeem(f, 10)]);
    const balance = await balanceOf(sql, f.customerId);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // one of them must lose: 10 points cannot be taken twice
    expect(balance).toBe(0);
    expect(await ledgerBalance(sql, f.customerId)).toBe(0);
  });
});

describe('audit and ledger consistency', () => {
  it('writes REVERSAL_CREATED with the original, the reversal and the points', async () => {
    const f = await fixture();
    const original = await issue(f);
    const reversal = await reverse(f, original.code);
    const rows = await sql`SELECT merchant_id, actor_user_id, entity_type, entity_id, details FROM audit_logs WHERE action = 'REVERSAL_CREATED' AND entity_id = ${reversal.id}`;
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.merchant_id)).toBe(f.merchantId);
    expect(String(rows[0]!.actor_user_id)).toBe(f.ownerId);
    expect(rows[0]!.entity_type).toBe('transaction');
    expect(rows[0]!.details).toEqual({ original: original.code, reversal: reversal.code, points: 10 });
  });

  it('keeps balance = ledger after a mix of operations and reversals', async () => {
    const f = await fixture();
    const first = await issue(f); // +10
    const second = await issue(f); // +10
    const spent = await redeem(f, 5); // -5
    await reverse(f, first.code); // -10
    await reverse(f, spent.code); // +5
    await codeOf(reverse(f, first.code)); // MSG26: no change
    expect(await balanceOf(sql, f.customerId)).toBe(10 + 10 - 5 - 10 + 5);
    expect(await ledgerBalance(sql, f.customerId)).toBe(await balanceOf(sql, f.customerId));
    expect(second.code).toBeDefined();
  });
});

// ---------------------------------------------------------------- HTTP

describe('POST /api/v1/merchant/ledger/{code}/reverse', () => {
  async function prepared(t: Tenant): Promise<{ code: string }> {
    await sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${t.merchantId}, 'CUS001', 'Customer')`;
    await setRules(sql, t.merchantId, t.ownerId, 10000, 1);
    const row = await issuePoints(sql, { merchantId: t.merchantId, customerCode: 'CUS001', amount: 100000, actor: { kind: 'USER', userId: t.ownerId } });
    return { code: row.code };
  }
  const post = (path: string, cookie?: string, csrf = true) => {
    const headers: Record<string, string> = cookie ? portalHeaders(cookie) : { 'X-Requested-With': 'octapoint-portal' };
    if (!csrf) delete headers['X-Requested-With'];
    return app.request(path, { method: 'POST', headers });
  };
  const codeOfRes = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;

  it('lets the Owner reverse and answers 201 with the reversal', async () => {
    const { a } = await createTwoMerchants(sql, app);
    const original = await prepared(a);
    const res = await post(`/api/v1/merchant/ledger/${original.code}/reverse`, a.cookie);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      reversal: {
        transaction_id: expect.stringMatching(/^TXN-[0-9]{8}-[A-Z0-9]{8}$/),
        type: 'REVERSAL',
        customer_code: 'CUS001',
        points: 10,
        balance_after: 0,
        status: 'PENDING_ANCHOR',
        sui_digest: null,
        explorer_url: null,
        reverses_transaction_id: original.code,
        created_at: expect.stringMatching(/Z$/),
      },
    });
  });

  it('answers the rule errors with their statuses: MSG26 and MSG25 are 409, MSG22 is 404, MSG33 is 400', async () => {
    const { a } = await createTwoMerchants(sql, app);
    const original = await prepared(a);
    expect((await post(`/api/v1/merchant/ledger/${original.code}/reverse`, a.cookie)).status).toBe(201);

    const again = await post(`/api/v1/merchant/ledger/${original.code}/reverse`, a.cookie);
    expect(again.status).toBe(409);
    expect(await codeOfRes(again)).toBe('MSG26');

    const spendable = await issuePoints(sql, { merchantId: a.merchantId, customerCode: 'CUS001', amount: 100000, actor: { kind: 'USER', userId: a.ownerId } });
    await redeemPoints(sql, { merchantId: a.merchantId, customerCode: 'CUS001', points: 10, actor: { kind: 'USER', userId: a.ownerId } });
    const short = await post(`/api/v1/merchant/ledger/${spendable.code}/reverse`, a.cookie);
    expect(short.status).toBe(409);
    expect(await codeOfRes(short)).toBe('MSG25');

    const unknown = await post('/api/v1/merchant/ledger/TXN-20260101-ZZZZZZZZ/reverse', a.cookie);
    expect(unknown.status).toBe(404);
    expect(await codeOfRes(unknown)).toBe('MSG22');
    const malformed = await post('/api/v1/merchant/ledger/not-a-code/reverse', a.cookie);
    expect(malformed.status).toBe(400);
    expect(await codeOfRes(malformed)).toBe('MSG33');
  });

  it('does not let one merchant reverse the transaction of another (MSG22)', async () => {
    const { a, b } = await createTwoMerchants(sql, app);
    const theirs = await prepared(b);
    const res = await post(`/api/v1/merchant/ledger/${theirs.code}/reverse`, a.cookie);
    expect(res.status).toBe(404);
    expect(await codeOfRes(res)).toBe('MSG22');
    expect(await sql`SELECT 1 FROM transactions WHERE merchant_id = ${b.merchantId} AND type = 'REVERSAL'`).toHaveLength(0);
  });

  it('refuses staff, anonymous users and a missing X-Requested-With header', async () => {
    const { a } = await createTwoMerchants(sql, app);
    const original = await prepared(a);
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const path = `/api/v1/merchant/ledger/${original.code}/reverse`;

    const asStaff = await post(path, staffCookie);
    expect(asStaff.status).toBe(403);
    expect(await codeOfRes(asStaff)).toBe('MSG04');
    const anonymous = await post(path);
    expect(anonymous.status).toBe(401);
    expect(await codeOfRes(anonymous)).toBe('MSG35');
    const noHeader = await post(path, a.cookie, false);
    expect(noHeader.status).toBe(403);
    expect(await sql`SELECT 1 FROM transactions WHERE merchant_id = ${a.merchantId} AND type = 'REVERSAL'`).toHaveLength(0);
  });
});
