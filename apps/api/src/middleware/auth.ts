import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE, findSessionAuth } from '../services/auth.js';
import type { AppEnv, Role } from '../types.js';

/** Portal requests that change data must carry this header (api-spec.md B.1, cheap CSRF guard). */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'octapoint-portal';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 401 MSG35 unless the cookie holds a valid session; on success sets c.var.auth. */
export function requireSession(sql: Sql): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const auth = token ? await findSessionAuth(sql, token) : null;
    if (!auth) throw new AppError('MSG35');
    c.set('auth', auth);
    await next();
  };
}

/** 403 MSG04 unless the logged-in user has one of the roles. Use after requireSession. */
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new AppError('MSG35');
    if (!roles.includes(auth.role)) throw new AppError('MSG04');
    await next();
  };
}

/** POST/PUT/PATCH/DELETE without "X-Requested-With: octapoint-portal" are refused with 403 MSG04. */
export function requireCsrfHeader(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (STATE_CHANGING.has(c.req.method) && c.req.header(CSRF_HEADER) !== CSRF_VALUE) {
      throw new AppError('MSG04');
    }
    await next();
  };
}

/**
 * The merchant of the logged-in user. This is the ONLY place a portal route may take merchant_id from
 * (never from the body, query or path). An Admin has no merchant: AppError('MSG04').
 */
export function requireMerchantId(c: Context<AppEnv>): string {
  const auth = c.get('auth');
  if (!auth) throw new AppError('MSG35');
  if (auth.merchantId === null) throw new AppError('MSG04');
  return auth.merchantId;
}
