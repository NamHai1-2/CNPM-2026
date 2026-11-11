import type { Sql } from '../../src/db/client.js';
import type { Actor } from '../../src/types.js';
import { seedMerchant, type Seeded } from './seed.js';

export interface PointsFixture extends Seeded {
  /** Actor of the Owner, ready for the points functions. */
  actor: Actor;
}

/** Saves the loyalty rules directly in the database (the T06 service is not needed by these tests). */
export async function setRules(
  sql: Sql,
  merchantId: string,
  userId: string,
  earnRatio: number,
  minRedemption: number,
): Promise<void> {
  await sql`
    INSERT INTO loyalty_rules (merchant_id, earn_ratio, min_redemption_threshold, updated_by)
    VALUES (${merchantId}, ${earnRatio}, ${minRedemption}, ${userId})
    ON CONFLICT (merchant_id) DO UPDATE SET
      earn_ratio = EXCLUDED.earn_ratio, min_redemption_threshold = EXCLUDED.min_redemption_threshold`;
}

export async function setBalance(sql: Sql, customerId: string, balance: number): Promise<void> {
  await sql`UPDATE customers SET balance = ${balance} WHERE id = ${customerId}`;
}

export async function balanceOf(sql: Sql, customerId: string): Promise<number> {
  const [row] = await sql`SELECT balance FROM customers WHERE id = ${customerId}`;
  return Number(row.balance);
}

export async function countTransactions(sql: Sql, customerId: string): Promise<number> {
  const [row] = await sql`SELECT count(*)::int AS n FROM transactions WHERE customer_id = ${customerId}`;
  return Number(row.n);
}

/**
 * A merchant with an Owner and a customer CUS001, rules set to earn_ratio 10000 (VND per point) and minimum redemption 50,
 * and the customer balance set to `balance` (default 0). The ledger formula of db-schema.md section 6 holds from 0.
 */
export async function pointsFixture(
  sql: Sql,
  opts: { balance?: number; earnRatio?: number; minRedemption?: number; withRules?: boolean } = {},
): Promise<PointsFixture> {
  const seeded = await seedMerchant(sql);
  await setBalance(sql, seeded.customerId, opts.balance ?? 0);
  if (opts.withRules !== false) {
    await setRules(sql, seeded.merchantId, seeded.ownerId, opts.earnRatio ?? 10000, opts.minRedemption ?? 50);
  }
  return { ...seeded, actor: { kind: 'USER', userId: seeded.ownerId } };
}

/**
 * The balance that the ledger alone would give (db-schema.md section 6):
 * ISSUE + REVERSAL of REDEEM - REDEEM - REVERSAL of ISSUE.
 */
export async function ledgerBalance(sql: Sql, customerId: string): Promise<number> {
  const [row] = await sql`
    SELECT coalesce(sum(
      CASE
        WHEN t.type = 'ISSUE' THEN t.points
        WHEN t.type = 'REDEEM' THEN -t.points
        WHEN t.type = 'REVERSAL' AND o.type = 'REDEEM' THEN t.points
        WHEN t.type = 'REVERSAL' AND o.type = 'ISSUE' THEN -t.points
      END), 0)::bigint AS total
    FROM transactions t
    LEFT JOIN transactions o ON o.id = t.reverses_transaction_id
    WHERE t.customer_id = ${customerId}`;
  return Number(row.total);
}

/** Inserts an API key row so that a transaction can be attributed to it. */
export async function insertApiKey(sql: Sql, merchantId: string, userId: string): Promise<string> {
  const keyId = `oct_test_${Math.random().toString(16).slice(2)}`;
  const [row] = await sql`
    INSERT INTO api_keys (merchant_id, key_id, secret_encrypted, created_by)
    VALUES (${merchantId}, ${keyId}, ${Buffer.from('secret')}, ${userId}) RETURNING id`;
  return String(row.id);
}
