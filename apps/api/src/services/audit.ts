import type { Sql } from '../db/client.js';
import type { AuditEntry } from '../types.js';

/**
 * Writes one row to audit_logs (CR-04). Call it inside the same transaction as the action it records,
 * so the action and its log entry succeed or fail together. `db` is a pool or a transaction.
 */
export async function writeAudit(db: Sql, entry: AuditEntry): Promise<void> {
  await db`
    INSERT INTO audit_logs (merchant_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (${entry.merchantId}, ${entry.actorUserId}, ${entry.action}, ${entry.entityType},
            ${entry.entityId}, ${db.json((entry.details ?? {}) as never)})`;
}
