/**
 * Error thrown by every SDK call that fails (docs/api-spec.md C.2, error format CR-06).
 *
 * - API error: `code` is the MSG code of the body (for example "MSG08"), `httpStatus` the HTTP status.
 * - `serverTime` (Unix seconds of the server clock) is set only for MSG17, so the caller can see how far
 *   its own clock is off.
 * - The request never reached the API, or the answer was not a CR-06 body (timeout, connection refused,
 *   proxy error page): `code` is "MSG23". `httpStatus` is 0 when there was no HTTP answer at all.
 *
 * The message never contains the API secret or the signature.
 */
export class OctaPointError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly serverTime?: number | undefined;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    options: { serverTime?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'OctaPointError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.serverTime = options.serverTime;
  }
}
