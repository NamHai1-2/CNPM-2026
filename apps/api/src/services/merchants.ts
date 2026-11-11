import { withTransaction, type Sql } from '../db/client.js';
import { generateMerchantCode } from '../lib/codes.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { isValidPassword } from '../lib/password-policy.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import { isUuid, isValidEmail } from '../lib/validation.js';
import type { MerchantStatus, Page } from '../types.js';
import { writeAudit } from './audit.js';

export const PAGE_SIZE = 20;
const MAX_CODE_TRIES = 5;
const MERCHANT_STATUSES: readonly MerchantStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

export interface MerchantView {
  id: string;
  code: string;
  name: string;
  owner_email: string | null;
  status: MerchantStatus;
  created_at: string;
}

export interface RegisterInput {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
}

/** Page number from a query string: a missing value is page 1; anything but an integer >= 1 is MSG33. */
export function parsePage(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^[1-9]\d{0,8}$/.test(value)) throw new AppError('MSG33');
  return Number(value);
}

/**
 * Self-service registration (UC-18): a PENDING merchant and its Owner, created together.
 * Check order (SRS 3.2.1.1): data (MSG33 for malformed values), email already used (MSG31), password policy (MSG37).
 * `deps.generateCode` exists so tests can force a code collision.
 */
export async function registerMerchant(
  sql: Sql,
  input: RegisterInput,
  deps: { generateCode?: () => string } = {},
): Promise<void> {
  const email = input.email.trim();
  const businessName = input.businessName.trim();
  const ownerName = input.ownerName.trim();
  if (businessName.length > 200 || ownerName.length > 200 || email.length > 254 || !isValidEmail(email)) {
    throw new AppError('MSG33');
  }

  const existing = await sql`SELECT 1 FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) throw new AppError('MSG31');
  if (!isValidPassword(input.password, email)) throw new AppError('MSG37');

  const passwordHash = await hashPassword(input.password); // slow: done before the transaction opens
  const generateCode = deps.generateCode ?? generateMerchantCode;

  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt += 1) {
    try {
      await withTransaction(sql, async (tx) => {
        const [merchant] = await tx`
          INSERT INTO merchants (code, name, status) VALUES (${generateCode()}, ${businessName}, 'PENDING')
          RETURNING id`;
        await tx`
          INSERT INTO users (merchant_id, email, password_hash, full_name, role)
          VALUES (${merchant.id}, ${email}, ${passwordHash}, ${ownerName}, 'MERCHANT_OWNER')`;
      });
      return;
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) throw new AppError('MSG31'); // two registrations at once
      if (isUniqueViolation(error, 'merchants_code_key')) continue; // code collision: try a new code
      throw error;
    }
  }
  throw new Error('could not generate a unique merchant code');
}

function toView(row: Record<string, unknown>): MerchantView {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    owner_email: row.owner_email === null || row.owner_email === undefined ? null : String(row.owner_email),
    status: row.status as MerchantStatus,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

/** Admin list (api-spec B.3): newest first, 20 per page, optional status filter. */
export async function listMerchants(
  db: Sql,
  filter: { status?: string; page: number },
): Promise<Page<MerchantView>> {
  let status: MerchantStatus | undefined;
  if (filter.status !== undefined) {
    if (!MERCHANT_STATUSES.includes(filter.status as MerchantStatus)) throw new AppError('MSG33');
    status = filter.status as MerchantStatus;
  }
  const statusFilter = () => (status ? db`AND m.status = ${status}` : db``);

  const rows = await db`
    SELECT m.id, m.code, m.name, m.status, m.created_at, u.email AS owner_email
    FROM merchants m
    LEFT JOIN users u ON u.merchant_id = m.id AND u.role = 'MERCHANT_OWNER'
    WHERE true ${statusFilter()}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(filter.page - 1) * PAGE_SIZE}`;
  const [count] = await db`SELECT count(*)::int AS total FROM merchants m WHERE true ${statusFilter()}`;

  return { items: rows.map(toView), page: filter.page, page_size: PAGE_SIZE, total: Number(count.total) };
}

/** Allowed status changes (SRS 3.2.1.2): Approve from PENDING or SUSPENDED, Suspend only from ACTIVE. */
const TRANSITIONS: Record<'ACTIVE' | 'SUSPENDED', readonly MerchantStatus[]> = {
  ACTIVE: ['PENDING', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
};

/**
 * Approve (to = 'ACTIVE') or suspend (to = 'SUSPENDED') a merchant in one transaction. The merchant row is
 * locked first, so two simultaneous requests cannot both succeed. The merchant's API keys follow its status:
 * suspend sets ACTIVE keys to SUSPENDED; approve sets SUSPENDED keys back to ACTIVE; REVOKED keys never change.
 * An unknown or malformed id and a forbidden transition both answer MSG33.
 */
export async function changeMerchantStatus(
  sql: Sql,
  input: { merchantId: string; to: 'ACTIVE' | 'SUSPENDED'; actorUserId: string },
): Promise<MerchantView> {
  if (!isUuid(input.merchantId)) throw new AppError('MSG33');

  await withTransaction(sql, async (tx) => {
    const rows = await tx`SELECT status FROM merchants WHERE id = ${input.merchantId} FOR UPDATE`;
    const current = rows[0]?.status as MerchantStatus | undefined;
    if (current === undefined || !TRANSITIONS[input.to].includes(current)) throw new AppError('MSG33');

    await tx`UPDATE merchants SET status = ${input.to}, updated_at = now() WHERE id = ${input.merchantId}`;
    if (input.to === 'SUSPENDED') {
      await tx`UPDATE api_keys SET status = 'SUSPENDED' WHERE merchant_id = ${input.merchantId} AND status = 'ACTIVE'`;
    } else {
      await tx`UPDATE api_keys SET status = 'ACTIVE' WHERE merchant_id = ${input.merchantId} AND status = 'SUSPENDED'`;
    }
    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: input.to === 'ACTIVE' ? 'MERCHANT_APPROVED' : 'MERCHANT_SUSPENDED',
      entityType: 'merchant',
      entityId: input.merchantId,
      details: { from: current, to: input.to },
    });
  });

  const rows = await sql`
    SELECT m.id, m.code, m.name, m.status, m.created_at, u.email AS owner_email
    FROM merchants m
    LEFT JOIN users u ON u.merchant_id = m.id AND u.role = 'MERCHANT_OWNER'
    WHERE m.id = ${input.merchantId}`;
  return toView(rows[0]!);
}
