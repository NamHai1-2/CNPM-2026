import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { sha256Hex } from '../lib/hmac.js';
import type { IdempotencyScope } from '../types.js';

/** Length limits of the X-Idempotency-Key header (api-spec.md A.1). */
export const IDEMPOTENCY_KEY_MIN = 1;
export const IDEMPOTENCY_KEY_MAX = 128;

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

/**
 * The key from the X-Idempotency-Key header. Missing, blank, or not 1-128 characters: AppError('MSG33').
 * The value is returned exactly as sent (it is also part of the HMAC signature on the external API).
 */
export function readIdempotencyKey(headerValue: string | undefined): string {
  if (
    headerValue === undefined ||
    headerValue.trim() === '' ||
    headerValue.length < IDEMPOTENCY_KEY_MIN ||
    headerValue.length > IDEMPOTENCY_KEY_MAX
  ) {
    throw new AppError('MSG33');
  }
  return headerValue;
}

/**
 * Fingerprint of a request (BR-10): the same key may only be reused for the same method, path (with query) and body.
 * = sha256hex(METHOD + '.' + target + '.' + sha256hex(body)), matching db-schema.md (idempotency_keys.request_hash).
 */
export function hashRequest(method: string, target: string, body: Uint8Array | string): string {
  return sha256Hex(`${method.toUpperCase()}.${target}.${sha256Hex(body)}`);
}

/**
 * Runs `execute` at most once for a given scope and key within 24 hours (BR-10), in ONE database transaction:
 * 1. wait for the advisory lock of (scope, key), so a duplicate that arrives while the first request is still running waits for it;
 * 2. a saved row younger than 24 hours: same request_hash returns the saved response (replayed = true) WITHOUT running
 *    `execute`; a different request_hash answers MSG34. A saved row older than 24 hours is deleted and ignored;
 * 3. run `execute(tx)` (it does the real work with the same transaction); 4. save the response; 5. commit.
 * If `execute` throws, everything rolls back: nothing is saved, so the same key can be retried (BR-10).
 */
export async function withIdempotency<T>(
  sql: Sql,
  params: { scope: IdempotencyScope; key: string; requestHash: string },
  execute: (tx: Sql) => Promise<IdempotentResult<T>>,
): Promise<IdempotentResult<T> & { replayed: boolean }> {
  const { scope, key, requestHash } = params;
  const apiKeyId = scope.kind === 'API_KEY' ? scope.apiKeyId : null;
  const userId = scope.kind === 'USER' ? scope.userId : null;
  const scopeId = apiKeyId ?? userId;

  return await withTransaction(sql, async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${scopeId}:${key}`}, 0))`;

    const rows =
      scope.kind === 'API_KEY'
        ? await tx`
            SELECT id, request_hash, response_status, response_body,
                   (created_at < now() - interval '24 hours') AS expired
            FROM idempotency_keys WHERE scope_api_key_id = ${scope.apiKeyId} AND idempotency_key = ${key}`
        : await tx`
            SELECT id, request_hash, response_status, response_body,
                   (created_at < now() - interval '24 hours') AS expired
            FROM idempotency_keys WHERE scope_user_id = ${scope.userId} AND idempotency_key = ${key}`;
    const saved = rows[0];
    if (saved) {
      if (saved.expired) {
        await tx`DELETE FROM idempotency_keys WHERE id = ${saved.id}`;
      } else if (saved.request_hash === requestHash) {
        return { status: Number(saved.response_status), body: saved.response_body as T, replayed: true };
      } else {
        throw new AppError('MSG34');
      }
    }

    const result = await execute(tx);
    await tx`
      INSERT INTO idempotency_keys
        (scope_api_key_id, scope_user_id, idempotency_key, request_hash, response_status, response_body)
      VALUES
        (${apiKeyId}, ${userId}, ${key}, ${requestHash}, ${result.status}, ${tx.json(result.body as never)})`;
    return { status: result.status, body: result.body, replayed: false };
  });
}
