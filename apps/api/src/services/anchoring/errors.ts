/**
 * T12 – Phân loại lỗi khi ghi nhận lên Sui (docs/anchoring.md §3, bước 4 / 4b / 4c).
 * File này KHÔNG import SDK Sui để test unit không cần cài/ chạy mạng.
 *
 *  - temporary : lỗi hạ tầng (mạng, RPC, hết gas, xung đột phiên bản object) → KHÔNG tính attempt
 *  - duplicate : contract abort E_DUPLICATE (1) → lần trước đã thành công, cần tìm lại digest
 *  - permanent : mọi lỗi còn lại → tính attempt (retry 1,2,4,8,16 phút rồi FAILED)
 */

export type ChainErrorKind = 'temporary' | 'duplicate' | 'permanent';
export type ChainErrorReason = 'gas' | 'network' | 'other';

/** Mã abort của contract (contracts/anchor/sources/anchor.move). */
export const E_DUPLICATE = 1;

export class ChainError extends Error {
  readonly kind: ChainErrorKind;
  readonly reason: ChainErrorReason;

  constructor(kind: ChainErrorKind, message: string, reason: ChainErrorReason = 'other', cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ChainError';
    this.kind = kind;
    this.reason = reason;
  }
}

const SECRET_LIKE = /suiprivkey[0-9a-z]+/gi;

/** Chuyển bất kỳ giá trị bị throw nào thành chuỗi (có giới hạn độ sâu của `cause`). */
export function errorText(input: unknown, depth = 0): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) {
    const code = (input as { code?: unknown }).code;
    const prefix = code === undefined ? '' : `[${String(code)}] `;
    const cause = input.cause !== undefined && depth < 3 ? ` (cause: ${errorText(input.cause, depth + 1)})` : '';
    return `${prefix}${input.name}: ${input.message}${cause}`;
  }
  try {
    return JSON.stringify(input, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? String(input);
  } catch {
    return String(input);
  }
}

/** Chuỗi ngắn để lưu vào `last_error` và log. Không bao giờ chứa khoá riêng. */
export function shortError(input: unknown, max = 300): string {
  const text = errorText(input).replace(SECRET_LIKE, '[redacted]').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const GAS_PATTERN =
  /insufficient\s*gas|InsufficientGas|GasBalanceTooLow|not enough gas|no\s+(?:valid\s+)?gas\s+coins?|insufficient\s+(?:sui\s+)?balance/i;

const TEMPORARY_PATTERN = new RegExp(
  [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'fetch failed',
    'network',
    'timeout',
    'timed out',
    'socket hang up',
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED',
    'RESOURCE_EXHAUSTED',
    'too many requests',
    'rate limit',
    '\\b429\\b',
    '\\b50[0-4]\\b',
    'ObjectVersionUnavailableForConsumption',
    'not available for consumption',
    'ObjectLockConflict',
    'already locked',
    'equivocat',
    'AbortError',
  ].join('|'),
  'i',
);

/** Lỗi bị throw (mạng, RPC, SDK): temporary nếu giống lỗi hạ tầng, ngược lại permanent. */
export function classifyThrown(err: unknown): ChainError {
  if (err instanceof ChainError) return err;
  const full = errorText(err);
  const text = shortError(err);
  if (GAS_PATTERN.test(full)) return new ChainError('temporary', text, 'gas', err);
  if (TEMPORARY_PATTERN.test(full)) return new ChainError('temporary', text, 'network', err);
  return new ChainError('permanent', text, 'other', err);
}

/**
 * Lấy mã abort từ thông báo lỗi thực thi. Hỗ trợ hai dạng:
 *  - chuỗi:  MoveAbort(MoveLocation { ... name: Identifier("anchor") ... }, 1) in command 0
 *  - object: { MoveAbort: { abortCode: "1", ... } }  (sau khi JSON.stringify)
 */
export function extractAbortCode(text: string): number | null {
  const m =
    /MoveAbort\(MoveLocation[\s\S]*\},\s*(\d+)\)/.exec(text) ??
    /abortCode"?\s*[:=]\s*"?(\d+)/i.exec(text) ??
    /abort code:?\s*(\d+)/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** Lỗi do giao dịch đã gửi nhưng effects báo thất bại. */
export function classifyExecutionFailure(err: unknown): ChainError {
  const full = errorText(err);
  const code = extractAbortCode(full);
  if (code !== null && /anchor/i.test(full)) {
    const text = shortError(err);
    return code === E_DUPLICATE
      ? new ChainError('duplicate', text, 'other', err)
      : new ChainError('permanent', text, 'other', err);
  }
  return classifyThrown(err);
  
}
