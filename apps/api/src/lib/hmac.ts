import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Request signing for the external API (docs/api-spec.md A.2). Used by the gateway and the SDK. */

export interface SigningParts {
  /** X-Timestamp: Unix time in seconds, as the exact string that is sent. */
  timestamp: string;
  /** Uppercase HTTP method. */
  method: string;
  /** Request target exactly as sent, including /api/v1 and the query string. */
  target: string;
  /** Exact raw bytes of the body (empty for requests without a body). */
  body: Uint8Array | string;
  /** X-Idempotency-Key value, or '' when the header is not sent (every GET). */
  idempotencyKey?: string;
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function buildSigningString(parts: SigningParts): string {
  return [
    parts.timestamp,
    parts.method.toUpperCase(),
    parts.target,
    sha256Hex(parts.body),
    parts.idempotencyKey ?? '',
  ].join('.');
}

/** Lowercase hex HMAC-SHA256 of the signing string. */
export function sign(secret: string, parts: SigningParts): string {
  return createHmac('sha256', secret).update(buildSigningString(parts), 'utf8').digest('hex');
}

/** Constant-time comparison. Returns false for any signature that is not 64 hex characters. */
export function verifySignature(secret: string, parts: SigningParts, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(sign(secret, parts), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
