import { createHash, createHmac } from 'node:crypto';

/**
 * Request signing (docs/api-spec.md A.2). Same algorithm as apps/api/src/lib/hmac.ts; the test vectors of
 * A.2 are checked in test/signing.test.ts. The SDK is a separate package and does not import from the API.
 */

export interface SigningParts {
  /** X-Timestamp: Unix time in seconds, the exact string that is sent. */
  timestamp: string;
  /** Uppercase HTTP method. */
  method: string;
  /** Request target exactly as sent, including /api/v1 and the query string. */
  target: string;
  /** Exact bytes of the body (empty for requests without a body). */
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
