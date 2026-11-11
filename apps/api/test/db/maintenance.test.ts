import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { cleanupExpired } from '../../src/services/maintenance.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMerchant } from '../helpers/seed.js';

let db: TestDatabase;
let sql: Sql;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
});
afterAll(async () => {
  await db.drop();
});

describe('cleanupExpired', () => {
  it('removes idempotency keys older than 24 hours and expired or revoked sessions, and nothing else', async () => {
    const f = await seedMerchant(sql);
    const hash = 'a'.repeat(64);

    for (const [key, age] of [['old-1', '25 hours'], ['old-2', '3 days'], ['fresh', '1 hour']] as const) {
      await sql`
        INSERT INTO idempotency_keys (scope_user_id, idempotency_key, request_hash, response_status, response_body, created_at)
        VALUES (${f.ownerId}, ${key}, ${hash}, 201, '{}', now() - ${age}::interval)`;
    }
    const sessions = [
      ['expired', "now() - interval '1 hour'", null],
      ['revoked', "now() + interval '1 hour'", 'now()'],
      ['valid', "now() + interval '1 hour'", null],
    ] as const;
    for (const [name, expires, revoked] of sessions) {
      await sql.unsafe(
        `INSERT INTO sessions (token_hash, user_id, expires_at, revoked_at)
         VALUES ('${name.padEnd(64, '0')}', '${f.ownerId}', ${expires}, ${revoked ?? 'NULL'})`,
      );
    }

    const result = await cleanupExpired(sql);
    expect(result).toEqual({ idempotencyDeleted: 2, sessionsDeleted: 2 });

    const keys = await sql`SELECT idempotency_key FROM idempotency_keys`;
    expect(keys.map((k) => k.idempotency_key)).toEqual(['fresh']);
    const left = await sql`SELECT token_hash FROM sessions`;
    expect(left).toHaveLength(1);
    expect(String(left[0]!.token_hash).startsWith('valid')).toBe(true);
  });

  it('removes nothing and answers zeros when there is nothing to clean', async () => {
    // what is left from the first test is still valid (a fresh key and an unexpired session)
    expect(await cleanupExpired(sql)).toEqual({ idempotencyDeleted: 0, sessionsDeleted: 0 });
  });
});
