import { randomBytes } from 'node:crypto';
import type { Hono } from 'hono';
import type { Sql } from '../../src/db/client.js';
import { masterKeyFromConfig, encryptSecret } from '../../src/lib/crypto.js';
import { sign } from '../../src/lib/hmac.js';
import type { ApiKeyStatus, AppEnv } from '../../src/types.js';
import { testConfig } from './app.js';

export interface GatewayKey {
  /** api_keys.id */
  id: string;
  /** The public key id sent in X-API-Key. */
  keyId: string;
  secret: string;
}

/** Inserts an API key whose secret is really encrypted with the test master key, so the gateway can decrypt it. */
export async function createGatewayKey(
  sql: Sql,
  merchantId: string,
  userId: string,
  opts: { status?: ApiKeyStatus; keyId?: string; secret?: string } = {},
): Promise<GatewayKey> {
  const keyId = opts.keyId ?? `oct_${randomBytes(16).toString('hex')}`;
  const secret = opts.secret ?? randomBytes(32).toString('base64url');
  const blob = encryptSecret(secret, masterKeyFromConfig(testConfig()));
  const [row] = await sql`
    INSERT INTO api_keys (merchant_id, key_id, secret_encrypted, status, created_by)
    VALUES (${merchantId}, ${keyId}, ${blob}, ${opts.status ?? 'ACTIVE'}, ${userId}) RETURNING id`;
  return { id: String(row.id), keyId, secret };
}

export interface Call {
  method: 'GET' | 'POST';
  /** Path with query, as it is signed and (unless `send.target` is set) as it is sent. */
  target: string;
  body?: string;
  /** X-Idempotency-Key; null or undefined = header not sent. */
  idempotencyKey?: string | null;
  /** Unix seconds; default is now. */
  timestamp?: number;
  /** Secret used to sign; default is the key's secret. */
  secret?: string;
  /** X-API-Key; null = not sent. Default is the key's id. */
  keyId?: string | null;
  /** X-Signature exactly as sent; null = not sent. Default is computed. */
  signature?: string | null;
  /** Values that differ from what was signed, to model tampering. */
  send?: { target?: string; body?: string; idempotencyKey?: string | null };
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Builds a signed external-API request (api-spec A.2) and sends it to the app. */
export async function signedRequest(
  app: Hono<AppEnv>,
  key: GatewayKey,
  call: Call,
): Promise<Response> {
  const timestamp = String(call.timestamp ?? nowSeconds());
  const body = call.body ?? '';
  const signature =
    call.signature === undefined
      ? sign(call.secret ?? key.secret, {
          timestamp,
          method: call.method,
          target: call.target,
          body,
          idempotencyKey: call.idempotencyKey ?? '',
        })
      : call.signature;

  const sentKey =
    call.send && 'idempotencyKey' in call.send ? call.send.idempotencyKey : call.idempotencyKey;
  const headers: Record<string, string> = { 'X-Timestamp': timestamp };
  const keyId = call.keyId === undefined ? key.keyId : call.keyId;
  if (keyId !== null) headers['X-API-Key'] = keyId;
  if (signature !== null) headers['X-Signature'] = signature;
  if (sentKey !== null && sentKey !== undefined) headers['X-Idempotency-Key'] = sentKey;
  const sentBody = call.send?.body ?? body;
  if (call.method === 'POST') headers['Content-Type'] = 'application/json';

  return await app.request(call.send?.target ?? call.target, {
    method: call.method,
    headers,
    body: call.method === 'POST' ? sentBody : undefined,
  });
}
