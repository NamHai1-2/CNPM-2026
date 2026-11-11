import type { Context, MiddlewareHandler } from 'hono';
import type { Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { verifySignature } from '../lib/hmac.js';
import { requestTarget } from '../lib/request-target.js';
import { findApiKeyForAuth } from '../services/apikeys.js';
import type { AppEnv } from '../types.js';

/** BR-09: a request is accepted only when its timestamp is within this many seconds of the server time. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

export const API_KEY_HEADER = 'X-API-Key';
export const TIMESTAMP_HEADER = 'X-Timestamp';
export const SIGNATURE_HEADER = 'X-Signature';
export const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

/** A Unix time in seconds is at most 12 digits for any date this system will see. Keeps Number() exact. */
const TIMESTAMP_PATTERN = /^\d{1,12}$/;

/**
 * The request target exactly as the client sent it ("/api/v1/path?query"), which is what the client signed.
 * With @hono/node-server the original is `c.env.incoming.url`; a test or another runtime has no such object, so the
 * URL that Hono parsed is reduced to path and query instead. The query string is never rebuilt.
 */
export function getRequestTarget(c: Context): string {
  const incoming = (c.env as { incoming?: { url?: string } } | undefined)?.incoming;
  return requestTarget(incoming?.url ?? c.req.url);
}

export interface RequireApiKeyDeps {
  sql: Sql;
  /** The 32-byte master key that decrypts API secrets (masterKeyFromConfig). */
  masterKey: Buffer;
  /** Server clock in Unix seconds. Tests replace it so that the signature vectors of api-spec A.2 can be used. */
  nowSeconds?: () => number;
}

/**
 * The gateway of the external API (UC-15, BR-08, BR-09, api-spec A.2). Checks run in this order and the first failure stops
 * the request, so a caller never learns more than it should:
 *   1. X-API-Key present, key exists, key ACTIVE, merchant ACTIVE      -> 401 MSG18
 *   2. X-Timestamp an integer within +-300 seconds of the server time  -> 401 MSG17 (+ server_time)
 *   3. X-Signature present and equal to the recomputed HMAC            -> 401 MSG16
 * On success it sets c.var.apiKey ({ apiKeyId, merchantId }: the ONLY source of the merchant, BR-01) and c.var.rawBody
 * (the exact bytes of the body, read before any JSON parsing because the signature covers those bytes).
 * Body and query validation (MSG33) and idempotency (MSG34) belong to the route and come after this middleware.
 */
export function requireApiKey(deps: RequireApiKeyDeps): MiddlewareHandler<AppEnv> {
  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));

  return async (c, next) => {
    // 1. key
    const keyId = c.req.header(API_KEY_HEADER);
    const record = keyId ? await findApiKeyForAuth(deps.sql, keyId, deps.masterKey) : null;
    if (!record || record.status !== 'ACTIVE' || record.merchantStatus !== 'ACTIVE')
      throw new AppError('MSG18');

    // 2. timestamp
    const timestamp = c.req.header(TIMESTAMP_HEADER);
    const now = nowSeconds();
    if (
      timestamp === undefined ||
      !TIMESTAMP_PATTERN.test(timestamp) ||
      Math.abs(now - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS
    ) {
      throw new AppError('MSG17', { extra: { server_time: now } });
    }

    // 3. signature, over the raw bytes
    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const signature = c.req.header(SIGNATURE_HEADER);
    const valid =
      signature !== undefined &&
      verifySignature(
        record.secret,
        {
          timestamp,
          method: c.req.method,
          target: getRequestTarget(c),
          body: rawBody,
          idempotencyKey: c.req.header(IDEMPOTENCY_HEADER) ?? '',
        },
        signature,
      );
    if (!valid) throw new AppError('MSG16');

    c.set('apiKey', { apiKeyId: record.apiKeyId, merchantId: record.merchantId });
    c.set('rawBody', rawBody);
    await next();
  };
}
