import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  insertIssue,
  insertRedeem,
  insertReversal,
  nextTxCode,
  seedMerchant,
  type Seeded,
} from '../helpers/seed.js';

// Task T01 acceptance criteria: the database itself protects the ledger (BR-03, BR-21, LI-08).

let db: TestDatabase;
let sql: Sql;
let s: Seeded;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  s = await seedMerchant(sql);
});
afterAll(async () => {
  await db.drop();
});

describe('ledger protection', () => {
  it('rejects changing a fixed column', async () => {
    const id = await insertIssue(sql, s);
    await expect(sql`UPDATE transactions SET points = 5 WHERE id = ${id}`).rejects.toThrow(/immutable/);
  });

  it('allows the anchoring retry fields to change', async () => {
    const id = await insertIssue(sql, s);
    await expect(
      sql`UPDATE transactions SET attempt_count = 1, next_attempt_at = now(), last_error = 'timeout' WHERE id = ${id}`,
    ).resolves.toBeDefined();
  });

  it('allows PENDING_ANCHOR to become ANCHORED, and then freezes it', async () => {
    const id = await insertIssue(sql, s);
    await sql`UPDATE transactions SET status = 'ANCHORED', sui_digest = 'DIGEST1' WHERE id = ${id}`;
    await expect(
      sql`UPDATE transactions SET status = 'FAILED', sui_digest = NULL WHERE id = ${id}`,
    ).rejects.toThrow(/final/);
    await expect(sql`UPDATE transactions SET sui_digest = 'OTHER' WHERE id = ${id}`).rejects.toThrow(/final/);
  });

  it('freezes FAILED as well', async () => {
    const id = await insertIssue(sql, s);
    await sql`UPDATE transactions SET status = 'FAILED' WHERE id = ${id}`;
    await expect(sql`UPDATE transactions SET status = 'PENDING_ANCHOR' WHERE id = ${id}`).rejects.toThrow(/final/);
  });

  it('requires a digest exactly when the status is ANCHORED', async () => {
    const id = await insertIssue(sql, s);
    await expect(sql`UPDATE transactions SET status = 'ANCHORED' WHERE id = ${id}`).rejects.toThrow(/chk_digest/);
  });

  it('rejects DELETE and TRUNCATE', async () => {
    const id = await insertIssue(sql, s);
    await expect(sql`DELETE FROM transactions WHERE id = ${id}`).rejects.toThrow(/immutable/);
    await expect(sql`TRUNCATE transactions`).rejects.toThrow();
  });

  it('allows one reversal of an ISSUE or REDEEM and no second one', async () => {
    const issue = await insertIssue(sql, s, 10);
    const redeem = await insertRedeem(sql, s, 7);
    await expect(insertReversal(sql, s, issue, 10)).resolves.toBeDefined();
    await expect(insertReversal(sql, s, issue, 10)).rejects.toThrow(/uq_one_reversal/);
    await expect(insertReversal(sql, s, redeem, 7)).resolves.toBeDefined();
  });

  it('rejects reversing a REVERSAL', async () => {
    const issue = await insertIssue(sql, s, 10);
    const reversal = await insertReversal(sql, s, issue, 10);
    await expect(insertReversal(sql, s, reversal, 10)).rejects.toThrow(/invalid reversal target/);
  });

  it('rejects a reversal with different points', async () => {
    const issue = await insertIssue(sql, s, 10);
    await expect(insertReversal(sql, s, issue, 9)).rejects.toThrow(/invalid reversal target/);
  });

  it('rejects a reversal across merchants', async () => {
    const other = await seedMerchant(sql);
    const issue = await insertIssue(sql, other, 10);
    await expect(insertReversal(sql, s, issue, 10)).rejects.toThrow(/invalid reversal target/);
  });

  it('needs exactly one actor (user or API key)', async () => {
    await expect(sql`
      INSERT INTO transactions (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after, proof_hash)
      VALUES (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'ISSUE', 10, 100000, 10000, 110, ${'a'.repeat(64)})`,
    ).rejects.toThrow(/chk_actor/);
  });

  it('checks the fields that belong to each type', async () => {
    await expect(sql`
      INSERT INTO transactions (code, merchant_id, customer_id, type, points, balance_after, performed_by_user_id, proof_hash)
      VALUES (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'ISSUE', 10, 110, ${s.ownerId}, ${'a'.repeat(64)})`,
    ).rejects.toThrow(/chk_type_fields/);
  });

  it('keeps points within the per-request ceiling', async () => {
    await expect(sql`
      INSERT INTO transactions (code, merchant_id, customer_id, type, points, balance_after, performed_by_user_id, proof_hash)
      VALUES (${nextTxCode()}, ${s.merchantId}, ${s.customerId}, 'REDEEM', 1000001, 0, ${s.ownerId}, ${'a'.repeat(64)})`,
    ).rejects.toThrow(/points/);
  });
});
