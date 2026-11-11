import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction, type Sql } from '../../src/db/client.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
let sql: Sql;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
});
afterAll(async () => {
  await db.drop();
});

describe('withTransaction', () => {
  it('commits and returns the value of the callback', async () => {
    const id = await withTransaction(sql, async (tx) => {
      const [row] = await tx`INSERT INTO merchants (code, name) VALUES ('MCH-TX0001', 'Commit') RETURNING id`;
      return String(row.id);
    });
    const rows = await sql`SELECT id FROM merchants WHERE code = 'MCH-TX0001'`;
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.id)).toBe(id);
  });

  it('rolls everything back when the callback throws', async () => {
    await expect(
      withTransaction(sql, async (tx) => {
        await tx`INSERT INTO merchants (code, name) VALUES ('MCH-TX0002', 'Rollback')`;
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    const rows = await sql`SELECT id FROM merchants WHERE code = 'MCH-TX0002'`;
    expect(rows).toHaveLength(0);
  });
});
