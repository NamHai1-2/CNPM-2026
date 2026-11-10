import { createHash, randomBytes } from 'node:crypto';
import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { isValidPassword } from '../lib/password-policy.js';
import type { AuthContext, Role } from '../types.js';
import { writeAudit } from './audit.js';

export const SESSION_COOKIE = 'octapoint_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // BR-19: 8 hours

/** Where the portal sends each role after login (api-spec.md B.2). */
const REDIRECTS: Record<Role, string> = {
  ADMIN: '/admin',
  MERCHANT_OWNER: '/dashboard',
  MERCHANT_STAFF: '/customers',
};

/** Only this hash is stored; the cookie holds the token itself (db-schema.md, sessions). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createSession(
  db: Sql,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`;
  return { token, expiresAt };
}

/**
 * Returns who the session belongs to, or null when it must be refused: unknown token, revoked, expired,
 * user inactive, or (for merchant users) merchant not ACTIVE. Runs on EVERY request (BR-19).
 */
export async function findSessionAuth(db: Sql, token: string): Promise<AuthContext | null> {
  const rows = await db`
    SELECT s.id AS session_id, u.id AS user_id, u.role, u.merchant_id, u.email, u.full_name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN merchants m ON m.id = u.merchant_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.is_active
      AND (u.merchant_id IS NULL OR m.status = 'ACTIVE')`;
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    role: row.role as Role,
    merchantId: row.merchant_id === null ? null : String(row.merchant_id),
    email: String(row.email),
    fullName: String(row.full_name),
  };
}

export async function revokeSession(db: Sql, sessionId: string): Promise<void> {
  await db`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId} AND revoked_at IS NULL`;
}

// A real BCrypt hash is compared even when the email is unknown, so the response time does not
// reveal whether an account exists.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('not-a-real-password-1');
  return dummyHash;
}

export interface LoginResult {
  user: { id: string; full_name: string; email: string; role: Role };
  redirect: string;
  token: string;
  expiresAt: Date;
}

/**
 * Login order (api-spec.md B.2): email + password first; an unknown email, a wrong password and an
 * inactive user all give the same MSG02. Only after the credentials are verified is the merchant
 * status checked (MSG15).
 */
export async function login(sql: Sql, email: string, password: string): Promise<LoginResult> {
  const rows = await sql`
    SELECT u.id, u.email, u.full_name, u.role, u.merchant_id, u.password_hash, u.is_active,
           m.status AS merchant_status
    FROM users u
    LEFT JOIN merchants m ON m.id = u.merchant_id
    WHERE u.email = ${email}`;
  const user = rows[0];

  const hash = user ? String(user.password_hash) : await getDummyHash();
  const passwordOk = await verifyPassword(password, hash);
  if (!user || !passwordOk || !user.is_active) throw new AppError('MSG02');

  if (user.merchant_id !== null && user.merchant_status !== 'ACTIVE') throw new AppError('MSG15');

  const { token, expiresAt } = await createSession(sql, String(user.id));
  const role = user.role as Role;
  return {
    user: {
      id: String(user.id),
      full_name: String(user.full_name),
      email: String(user.email),
      role,
    },
    redirect: REDIRECTS[role],
    token,
    expiresAt,
  };
}

export interface MeView {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  merchant: { code: string; name: string; status: string } | null;
}

export async function getMe(db: Sql, auth: AuthContext): Promise<MeView> {
  let merchant: MeView['merchant'] = null;
  if (auth.merchantId !== null) {
    const rows = await db`SELECT code, name, status FROM merchants WHERE id = ${auth.merchantId}`;
    const row = rows[0];
    if (row) merchant = { code: String(row.code), name: String(row.name), status: String(row.status) };
  }
  return { id: auth.userId, full_name: auth.fullName, email: auth.email, role: auth.role, merchant };
}

/**
 * Change password (UC-02, CR-08). Order of checks: wrong current password (MSG36), then the policy
 * (MSG37), then "same as the current one" (MSG37). On success all OTHER sessions of the user end, the
 * current one stays, and PASSWORD_CHANGED is written to the audit log in the same transaction.
 */
export async function changePassword(
  sql: Sql,
  auth: AuthContext,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${auth.userId}`;
  const hash = rows[0] ? String(rows[0].password_hash) : null;
  if (hash === null || !(await verifyPassword(currentPassword, hash))) throw new AppError('MSG36');

  if (!isValidPassword(newPassword, auth.email)) throw new AppError('MSG37');
  if (await verifyPassword(newPassword, hash)) throw new AppError('MSG37');

  const newHash = await hashPassword(newPassword); // slow: done before the transaction opens
  await withTransaction(sql, async (tx) => {
    await tx`UPDATE users SET password_hash = ${newHash}, updated_at = now() WHERE id = ${auth.userId}`;
    await tx`
      UPDATE sessions SET revoked_at = now()
      WHERE user_id = ${auth.userId} AND id <> ${auth.sessionId} AND revoked_at IS NULL`;
    await writeAudit(tx, {
      merchantId: auth.merchantId,
      actorUserId: auth.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'user',
      entityId: auth.userId,
    });
  });
}
