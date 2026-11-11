import { randomBytes } from 'node:crypto';
import { withTransaction, type Sql } from '../db/client.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { isUuid } from '../lib/validation.js';
import type { ApiKeyAuthRecord, ApiKeyStatus, MerchantStatus, Page } from '../types.js';
import { writeAudit } from './audit.js';
import { PAGE_SIZE } from './merchants.js';

/** At most this many keys per merchant may be ACTIVE or SUSPENDED (SRS 3.2.3.3). Revoked keys do not count. */
export const MAX_ACTIVE_KEYS = 5;

export interface ApiKeyView {
  id: string;
  masked_key_id: string;
  status: ApiKeyStatus;
  created_at: string;
}

/** First 8 and last 4 characters ("oct_3f9a...c01d"): enough to recognise a key, never enough to use it. */
export function maskKeyId(keyId: string): string {
  return `${keyId.slice(0, 8)}...${keyId.slice(-4)}`;
}

function toView(row: Record<string, unknown>): ApiKeyView {
  return {
    id: String(row.id),
    masked_key_id: maskKeyId(String(row.key_id)),
    status: row.status as ApiKeyStatus,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

/**
 * Creates a key for the merchant (UC-07). key_id = 'oct_' + 16 random bytes in hex; secret = 32 random bytes in
 * base64url. Only the encrypted secret is stored. The merchant row is locked before counting, so simultaneous
 * requests cannot go over the limit (MSG40). The plain secret is returned here and nowhere else.
 */
export async function createApiKey(
  sql: Sql,
  input: { merchantId: string; userId: string },
  masterKey: Buffer,
): Promise<{ id: string; key_id: string; secret: string }> {
  const keyId = `oct_${randomBytes(16).toString('hex')}`;
  const secret = randomBytes(32).toString('base64url');
  const encrypted = encryptSecret(secret, masterKey);

  const id = await withTransaction(sql, async (tx) => {
    await tx`SELECT id FROM merchants WHERE id = ${input.merchantId} FOR UPDATE`;
    const [count] = await tx`
      SELECT count(*)::int AS n FROM api_keys
      WHERE merchant_id = ${input.merchantId} AND status IN ('ACTIVE', 'SUSPENDED')`;
    if (Number(count.n) >= MAX_ACTIVE_KEYS) throw new AppError('MSG40');

    const [row] = await tx`
      INSERT INTO api_keys (merchant_id, key_id, secret_encrypted, created_by)
      VALUES (${input.merchantId}, ${keyId}, ${encrypted}, ${input.userId})
      RETURNING id`;
    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.userId,
      action: 'API_KEY_CREATED',
      entityType: 'api_key',
      entityId: String(row.id),
      details: { key: maskKeyId(keyId) },
    });
    return String(row.id);
  });
  return { id, key_id: keyId, secret };
}

/** The merchant's keys, newest first, 20 per page. Never returns the secret or the full key id. */
export async function listApiKeys(db: Sql, merchantId: string, page: number): Promise<Page<ApiKeyView>> {
  const rows = await db`
    SELECT id, key_id, status, created_at FROM api_keys
    WHERE merchant_id = ${merchantId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`;
  const [count] = await db`SELECT count(*)::int AS total FROM api_keys WHERE merchant_id = ${merchantId}`;
  return { items: rows.map(toView), page, page_size: PAGE_SIZE, total: Number(count.total) };
}

/**
 * Revokes a key for good (UC-07, MSG12). A key of another merchant or an unknown id answers MSG33, so the
 * response does not reveal that the key exists. Revoking a key that is already revoked changes nothing and
 * writes no second audit row.
 */
export async function revokeApiKey(
  sql: Sql,
  input: { merchantId: string; keyRowId: string; actorUserId: string },
): Promise<ApiKeyView> {
  if (!isUuid(input.keyRowId)) throw new AppError('MSG33');

  return await withTransaction(sql, async (tx) => {
    const rows = await tx`
      SELECT id, key_id, status, created_at FROM api_keys
      WHERE id = ${input.keyRowId} AND merchant_id = ${input.merchantId} FOR UPDATE`;
    const key = rows[0];
    if (!key) throw new AppError('MSG33');
    if (key.status === 'REVOKED') return toView(key);

    await tx`UPDATE api_keys SET status = 'REVOKED', revoked_at = now() WHERE id = ${input.keyRowId}`;
    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: 'API_KEY_REVOKED',
      entityType: 'api_key',
      entityId: input.keyRowId,
      details: { key: maskKeyId(String(key.key_id)) },
    });
    return toView({ ...key, status: 'REVOKED' });
  });
}

/**
 * For the gateway (T09): finds a key by its public id and returns the decrypted secret with the key status and
 * the merchant status. It does NOT decide whether the key may be used; the gateway does. null = unknown key.
 */
export async function findApiKeyForAuth(
  db: Sql,
  keyId: string,
  masterKey: Buffer,
): Promise<ApiKeyAuthRecord | null> {
  const rows = await db`
    SELECT k.id, k.merchant_id, k.key_id, k.status, k.secret_encrypted, m.status AS merchant_status
    FROM api_keys k
    JOIN merchants m ON m.id = k.merchant_id
    WHERE k.key_id = ${keyId}`;
  const row = rows[0];
  if (!row) return null;
  return {
    apiKeyId: String(row.id),
    merchantId: String(row.merchant_id),
    keyId: String(row.key_id),
    status: row.status as ApiKeyStatus,
    merchantStatus: row.merchant_status as MerchantStatus,
    secret: decryptSecret(row.secret_encrypted as Buffer, masterKey),
  };
}
