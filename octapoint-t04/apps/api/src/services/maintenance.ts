import type { Sql } from '../db/client.js';

/**
 * Daily cleanup (docs/config-and-deploy.md section 4): deletes idempotency keys older than 24 hours (they no longer protect
 * anything, BR-10) and sessions that are expired or revoked (they can never be used again). Returns how many rows were removed.
 */
export async function cleanupExpired(sql: Sql): Promise<{ idempotencyDeleted: number; sessionsDeleted: number }> {
  const idempotency = await sql`
    DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours' RETURNING id`;
  const sessions = await sql`
    DELETE FROM sessions WHERE expires_at < now() OR revoked_at IS NOT NULL RETURNING id`;
  return { idempotencyDeleted: idempotency.length, sessionsDeleted: sessions.length };
}
