import { MESSAGES, formatMessage, type MessageDef, type MsgCode } from './messages.js';

export interface AppErrorOptions {
  /** Values for {placeholders} in the message text. */
  params?: Record<string, string | number>;
  /** Extra JSON fields in the response body (for example `server_time` for MSG17). */
  extra?: Record<string, unknown>;
}

/** Throw this for every expected failure. The global handler turns it into the CR-06 JSON body. */
export class AppError extends Error {
  readonly code: MsgCode;
  readonly params: Record<string, string | number>;
  readonly extra: Record<string, unknown>;

  constructor(code: MsgCode, options: AppErrorOptions = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = options.params ?? {};
    this.extra = options.extra ?? {};
  }
}

export interface ErrorBody {
  code: MsgCode;
  message: string;
  [field: string]: unknown;
}

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

/**
 * Maps any thrown value to `{ status, body }` (CR-06). Unknown errors, and AppErrors whose code has
 * no HTTP status (success messages), become MSG23 with no detail: stack traces stay in the server log.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    const definition: MessageDef = MESSAGES[error.code];
    const status = definition.http;
    if (status !== undefined) {
      return {
        status,
        body: { ...error.extra, code: error.code, message: formatMessage(error.code, error.params) },
      };
    }
  }
  return { status: 500, body: { code: 'MSG23', message: formatMessage('MSG23') } };
}
