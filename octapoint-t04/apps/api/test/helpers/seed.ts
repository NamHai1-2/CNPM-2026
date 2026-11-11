import type { Sql } from '../../src/db/client.js';

export interface Seeded {
  merchantId: string;
  ownerId: string;
  customerId: string;
}

let merchantCounter = 0;
let txCounter = 0;

/** Unique codes that match CR-05: TXN-YYYYMMDD-XXXXXXXX. */
export function nextTxCode(): string {
  txCounter += 1;
  return `TXN-20261101-${String(txCounter).padStart(8, '0')}`;
}

/** One ACTIVE merchant with an Owner and one customer (code CUS001, balance 100). */
export async function seedMerchant(sql: Sql): Promise<Seeded> {
  merchantCounter += 1;
  const n = String(merchantCounter).padStart(6, '0');
  const [merchant] = await sql`
    INSERT INTO merchants (code, name, status) VALUES (${'MCH-' + n}, ${'Shop ' + n}, 'ACTIVE') RETURNING id`;
  const [owner] = await sql`
    INSERT INTO users (merchant_id, email, password_hash, full_name, role)
    VALUES (${merchant.id}, ${`owner${n}@example.com`}, 'hash', 'Owner', 'MERCHANT_OWNER') RETURNING id`;
  const [customer] = await sql`
    INSERT INTO customers (merchant_id, customer_code, name, balance)
    VALUES (${merchant.id}, 'CUS001', 'Customer', 100) RETURNING id`;
  return {
    merchantId: String(merchant.id),
    ownerId: String(owner.id),
    customerId: String(customer.id),
  };
}

const PROOF_HASH = 'a'.repeat(64);

export async function insertIssue(sql: Sql, s: Seeded, points = 10): Promise<string> {
  const [row] = await sql`
    INSERT INTO transactions
      (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after,
       performed_by_user_id, proof_hash)
    VALUES
      (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'ISSUE', ${points}, ${points * 10000}, 10000,
       ${100 + points}, ${s.ownerId}, ${PROOF_HASH})
    RETURNING id`;
  return String(row.id);
}

export async function insertRedeem(sql: Sql, s: Seeded, points = 10): Promise<string> {
  const [row] = await sql`
    INSERT INTO transactions
      (code, merchant_id, customer_id, type, points, balance_after, performed_by_user_id, proof_hash)
    VALUES
      (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'REDEEM', ${points}, 90, ${s.ownerId}, ${PROOF_HASH})
    RETURNING id`;
  return String(row.id);
}

export async function insertReversal(
  sql: Sql,
  s: Seeded,
  originalId: string,
  points = 10,
): Promise<string> {
  const [row] = await sql`
    INSERT INTO transactions
      (code, merchant_id, customer_id, type, points, balance_after, reverses_transaction_id,
       performed_by_user_id, proof_hash)
    VALUES
      (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'REVERSAL', ${points}, 100, ${originalId},
       ${s.ownerId}, ${PROOF_HASH})
    RETURNING id`;
  return String(row.id);
}
