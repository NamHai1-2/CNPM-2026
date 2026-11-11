import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { issuePoints, redeemPoints } from '../../src/services/points.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { balanceOf, countTransactions, ledgerBalance, pointsFixture, type PointsFixture } from '../helpers/points.js';

// Task T07a: the balance is never wrong, however many requests arrive at the same moment (BR-05, BR-06).

let db: TestDatabase;
let sql: Sql;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
});
afterAll(async () => {
  await db.drop();
});

const issueOne = (f: PointsFixture) =>
  issuePoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', amount: 10000, actor: f.actor }); // +1 point (ratio 10000)
const redeemTen = (f: PointsFixture) =>
  redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 10, actor: f.actor });

function failureCodes(results: PromiseSettledResult<unknown>[]): string[] {
  return results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason as { code?: string }).code ?? String(r.reason));
}

describe('simultaneous requests on one customer', () => {
  it('20 redeems of 10 points on a balance of 50: exactly 5 succeed, 15 get MSG08, the balance ends at 0', async () => {
    const f = await pointsFixture(sql, { balance: 50, minRedemption: 1 });
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => redeemTen(f)));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(5);
    expect(failureCodes(results)).toEqual(Array(15).fill('MSG08'));
    expect(await balanceOf(sql, f.customerId)).toBe(0);
    expect(await countTransactions(sql, f.customerId)).toBe(5);
    expect(await ledgerBalance(sql, f.customerId)).toBe(-50); // the ledger only holds the 5 redeems; the 50 points were set directly

    const after = (await sql`SELECT balance_after FROM transactions WHERE customer_id = ${f.customerId} ORDER BY balance_after DESC`).map((r) => Number(r.balance_after));
    expect(after).toEqual([40, 30, 20, 10, 0]); // every redeem saw the balance left by the one before it
  });

  it('20 simultaneous issues add up exactly, every ledger row has its own balance and its own code', async () => {
    const f = await pointsFixture(sql); // balance 0
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => issueOne(f)));

    expect(failureCodes(results)).toEqual([]);
    expect(await balanceOf(sql, f.customerId)).toBe(20);
    expect(await ledgerBalance(sql, f.customerId)).toBe(20);
    const rows = await sql`SELECT code, balance_after FROM transactions WHERE customer_id = ${f.customerId}`;
    expect(new Set(rows.map((r) => Number(r.balance_after))).size).toBe(20); // 1..20, none repeated
    expect(new Set(rows.map((r) => String(r.code))).size).toBe(20);
  });

  it('issues and redeems at the same time never lose or invent a point', async () => {
    const f = await pointsFixture(sql, { balance: 100, minRedemption: 1 });
    const results = await Promise.allSettled([
      ...Array.from({ length: 10 }, () => issueOne(f)), // +10
      ...Array.from({ length: 10 }, () => redeemTen(f)), // -100 at most, and the balance always covers it
    ]);
    expect(failureCodes(results)).toEqual([]);
    expect(await balanceOf(sql, f.customerId)).toBe(100 + 10 - 100);
    expect(await countTransactions(sql, f.customerId)).toBe(20);
  });

  it('with a small balance, the final balance equals the start plus the issues that worked minus the redeems that worked, and is never negative', async () => {
    const f = await pointsFixture(sql, { balance: 30, minRedemption: 1 });
    const results = await Promise.allSettled([
      ...Array.from({ length: 8 }, () => redeemTen(f)),
      ...Array.from({ length: 8 }, () => issueOne(f)),
    ]);
    const redeemsDone = results.slice(0, 8).filter((r) => r.status === 'fulfilled').length;
    const issuesDone = results.slice(8).filter((r) => r.status === 'fulfilled').length;
    expect(issuesDone).toBe(8); // issuing never fails here
    const balance = await balanceOf(sql, f.customerId);
    expect(balance).toBe(30 + issuesDone - 10 * redeemsDone);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(await countTransactions(sql, f.customerId)).toBe(redeemsDone + issuesDone);
    for (const code of failureCodes(results)) expect(code).toBe('MSG08');
    const bad = await sql`SELECT 1 FROM transactions WHERE customer_id = ${f.customerId} AND balance_after < 0`;
    expect(bad).toHaveLength(0);
  });

  it('a failed request in the middle of the crowd leaves no trace', async () => {
    const f = await pointsFixture(sql, { balance: 20, minRedemption: 1 });
    const tooMuch = redeemPoints(sql, { merchantId: f.merchantId, customerCode: 'CUS001', points: 500, actor: f.actor });
    const results = await Promise.allSettled([redeemTen(f), tooMuch, redeemTen(f), issueOne(f)]);
    expect(failureCodes(results)).toEqual(['MSG08']);
    expect(await balanceOf(sql, f.customerId)).toBe(20 - 10 - 10 + 1);
    expect(await countTransactions(sql, f.customerId)).toBe(3);
  });
});

describe('different customers do not wait for each other', () => {
  it('two customers of two merchants are changed independently and correctly', async () => {
    const a = await pointsFixture(sql, { balance: 50, minRedemption: 1 });
    const b = await pointsFixture(sql, { balance: 50, minRedemption: 1 });
    await Promise.all([
      ...Array.from({ length: 5 }, () => redeemTen(a)),
      ...Array.from({ length: 5 }, () => redeemTen(b)),
    ]);
    expect(await balanceOf(sql, a.customerId)).toBe(0);
    expect(await balanceOf(sql, b.customerId)).toBe(0);
  });
});
