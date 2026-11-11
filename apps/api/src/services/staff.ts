import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { isValidPassword } from '../lib/password-policy.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import { isUuid, isValidEmail } from '../lib/validation.js';
import type { Page } from '../types.js';
import { writeAudit } from './audit.js';
import { PAGE_SIZE } from './merchants.js';

export interface StaffView {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

function toView(row: Record<string, unknown>): StaffView {
  return {
    id: String(row.id),
    full_name: String(row.full_name),
    email: String(row.email),
    is_active: Boolean(row.is_active),
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

/** The staff (MERCHANT_STAFF) of one merchant, newest first, 20 per page. The Owner is not listed. */
export async function listStaff(db: Sql, merchantId: string, page: number): Promise<Page<StaffView>> {
  const rows = await db`
    SELECT id, full_name, email, is_active, created_at FROM users
    WHERE merchant_id = ${merchantId} AND role = 'MERCHANT_STAFF'
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
  const [count] = await db`
    SELECT count(*)::int AS total FROM users WHERE merchant_id = ${merchantId} AND role = 'MERCHANT_STAFF'`;
  return { items: rows.map(toView), page, page_size: PAGE_SIZE, total: Number(count.total) };
}

/**
 * Creates a staff account for the merchant (UC-08). Check order, as for registration: malformed data (MSG33),
 * email already used by ANY account (MSG31), password policy (MSG37). The email is unique across all merchants
 * because login uses the email alone.
 */
export async function createStaff(
  sql: Sql,
  input: { merchantId: string; actorUserId: string; fullName: string; email: string; initialPassword: string },
): Promise<StaffView> {
  const email = input.email.trim();
  const fullName = input.fullName.trim();
  if (fullName.length > 200 || email.length > 254 || !isValidEmail(email)) throw new AppError('MSG33');

  const existing = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) throw new AppError('MSG31');
  if (!isValidPassword(input.initialPassword, email)) throw new AppError('MSG37');

  const passwordHash = await hashPassword(input.initialPassword); // slow: before the transaction opens
  try {
    return await withTransaction(sql, async (tx) => {
      const [row] = await tx`
        INSERT INTO users (merchant_id, email, password_hash, full_name, role)
        VALUES (${input.merchantId}, ${email}, ${passwordHash}, ${fullName}, 'MERCHANT_STAFF')
        RETURNING id, full_name, email, is_active, created_at`;
      await writeAudit(tx, {
        merchantId: input.merchantId,
        actorUserId: input.actorUserId,
        action: 'STAFF_CREATED',
        entityType: 'user',
        entityId: String(row.id),
      });
      return toView(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, 'users_email_key')) throw new AppError('MSG31'); // two requests at once
    throw error;
  }
}

/**
 * Deactivates a staff account: it can no longer log in and its sessions end at once (BR-19). Only staff of the
 * caller's own merchant can be deactivated; anything else (unknown id, another merchant, the Owner) answers
 * MSG33. There is no delete and no reactivation. Deactivating an inactive account changes nothing.
 */
export async function deactivateStaff(
  sql: Sql,
  input: { merchantId: string; staffId: string; actorUserId: string },
): Promise<StaffView> {
  if (!isUuid(input.staffId)) throw new AppError('MSG33');

  return await withTransaction(sql, async (tx) => {
    const rows = await tx`
      SELECT id, full_name, email, is_active, created_at FROM users
      WHERE id = ${input.staffId} AND merchant_id = ${input.merchantId} AND role = 'MERCHANT_STAFF' FOR UPDATE`;
    const staff = rows[0];
    if (!staff) throw new AppError('MSG33');
    if (!staff.is_active) return toView(staff);

    await tx`UPDATE users SET is_active = false, updated_at = now() WHERE id = ${input.staffId}`;
    await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${input.staffId} AND revoked_at IS NULL`;
    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: 'STAFF_DEACTIVATED',
      entityType: 'user',
      entityId: input.staffId,
    });
    return toView({ ...staff, is_active: false });
  });
}
