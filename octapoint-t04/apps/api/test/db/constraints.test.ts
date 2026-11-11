import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertIssue, nextTxCode, seedMerchant, type Seeded } from '../helpers/seed.js';

let db: TestDatabase;
let sql: Sql;
let a: Seeded;
let b: Seeded;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  a = await seedMerchant(sql);
  b = await seedMerchant(sql);
});
afterAll(async () => {
  await db.drop();
});

describe('customers', () => {
  it('never let the balance go below 0 or above 1,000,000,000 (BR-05)', async () => {
    await expect(sql`UPDATE customers SET balance = -1 WHERE id = ${a.customerId}`).rejects.toThrow(/balance/);
    await expect(sql`UPDATE customers SET balance = 1000000001 WHERE id = ${a.customerId}`).rejects.toThrow(/balance/);
    await expect(sql`UPDATE customers SET balance = 1000000000 WHERE id = ${a.customerId}`).resolves.toBeDefined();
    await sql`UPDATE customers SET balance = 100 WHERE id = ${a.customerId}`;
  });

  it('keep the customer code unique per merchant only (BR-04)', async () => {
    await expect(
      sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${a.merchantId}, 'CUS001', 'Dup')`,
    ).rejects.toThrow(/duplicate key/);
    // b already has CUS001 too: the same code in another merchant is fine.
    expect(b.customerId).toBeDefined();
  });

  it('accept only upper-case codes of 1-32 letters or digits (CR-02)', async () => {
    for (const code of ['cus002', 'CUS 002', '', 'A'.repeat(33)]) {
      await expect(
        sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${a.merchantId}, ${code}, 'Bad')`,
      ).rejects.toThrow(/customer_code|check/);
    }
  });

  it('keep an optional phone unique per merchant (MSG38)', async () => {
    await sql`INSERT INTO customers (merchant_id, customer_code, name, phone) VALUES (${a.merchantId}, 'P1', 'P1', '0901234567')`;
    await expect(
      sql`INSERT INTO customers (merchant_id, customer_code, name, phone) VALUES (${a.merchantId}, 'P2', 'P2', '0901234567')`,
    ).rejects.toThrow(/uq_customer_phone/);
    await expect(
      sql`INSERT INTO customers (merchant_id, customer_code, name, phone) VALUES (${b.merchantId}, 'P2', 'P2', '0901234567')`,
    ).resolves.toBeDefined();
    // several customers without a phone are allowed
    await sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${a.merchantId}, 'N1', 'N1')`;
    await sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${a.merchantId}, 'N2', 'N2')`;
  });

  it('reject a phone that is not 10 digits starting with 0', async () => {
    await expect(
      sql`INSERT INTO customers (merchant_id, customer_code, name, phone) VALUES (${a.merchantId}, 'P9', 'P9', '12345')`,
    ).rejects.toThrow(/phone|check/);
  });
});

describe('tenant isolation (BR-01)', () => {
  it('rejects a transaction that mixes a merchant with another merchant\'s customer', async () => {
    await expect(sql`
      INSERT INTO transactions (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after, performed_by_user_id, proof_hash)
      VALUES (${nextTxCode()}, ${a.merchantId}, ${b.customerId}, 'ISSUE', 10, 100000, 10000, 110, ${a.ownerId}, ${'a'.repeat(64)})`,
    ).rejects.toThrow(/foreign key/);
    await expect(insertIssue(sql, a)).resolves.toBeDefined();
  });
});

describe('users', () => {
  it('keep email unique without regard to case', async () => {
    await expect(sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (${a.merchantId}, 'OWNER000001@EXAMPLE.COM', 'h', 'Staff', 'MERCHANT_STAFF')`,
    ).rejects.toThrow(/duplicate key/);
  });

  it('allow only one Owner per merchant', async () => {
    await expect(sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (${a.merchantId}, 'second-owner@example.com', 'h', 'Owner 2', 'MERCHANT_OWNER')`,
    ).rejects.toThrow(/uq_one_owner_per_merchant/);
  });

  it('tie Admin to no merchant and everyone else to a merchant', async () => {
    await expect(sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (${a.merchantId}, 'admin@example.com', 'h', 'Admin', 'ADMIN')`,
    ).rejects.toThrow(/check/);
    await expect(sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (NULL, 'staff@example.com', 'h', 'Staff', 'MERCHANT_STAFF')`,
    ).rejects.toThrow(/check/);
    await expect(sql`
      INSERT INTO users (merchant_id, email, password_hash, full_name, role)
      VALUES (NULL, 'admin@example.com', 'h', 'Admin', 'ADMIN')`,
    ).resolves.toBeDefined();
  });
});

describe('idempotency keys', () => {
  it('need exactly one scope (API key or user)', async () => {
    await expect(sql`
      INSERT INTO idempotency_keys (idempotency_key, request_hash, response_status, response_body)
      VALUES ('k1', ${'b'.repeat(64)}, 201, '{}')`,
    ).rejects.toThrow(/check/);
  });

  it('are unique per scope and key', async () => {
    await sql`
      INSERT INTO idempotency_keys (scope_user_id, idempotency_key, request_hash, response_status, response_body)
      VALUES (${a.ownerId}, 'k2', ${'b'.repeat(64)}, 201, '{}')`;
    await expect(sql`
      INSERT INTO idempotency_keys (scope_user_id, idempotency_key, request_hash, response_status, response_body)
      VALUES (${a.ownerId}, 'k2', ${'b'.repeat(64)}, 201, '{}')`,
    ).rejects.toThrow(/uq_idem_user/);
    // the same key for another user is a different scope
    await expect(sql`
      INSERT INTO idempotency_keys (scope_user_id, idempotency_key, request_hash, response_status, response_body)
      VALUES (${b.ownerId}, 'k2', ${'b'.repeat(64)}, 201, '{}')`,
    ).resolves.toBeDefined();
  });
});
