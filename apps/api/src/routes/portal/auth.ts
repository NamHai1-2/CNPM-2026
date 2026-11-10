import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requireCsrfHeader, requireSession } from '../../middleware/auth.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  changePassword,
  getMe,
  login,
  revokeSession,
} from '../../services/auth.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(1),
});

/**
 * Mounted at /api/v1/auth. Login is public, so requireSession is applied PER ROUTE and never with
 * router.use('*'): T03 mounts /api/v1/auth/register under the same prefix and must not inherit it.
 */
export function authRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const secure = deps.config.NODE_ENV === 'production';

  r.post('/login', requireCsrfHeader(), async (c) => {
    const body = await parseJsonBody(c, loginSchema, 'MSG01');
    const result = await login(deps.sql, body.email, body.password);
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.json({ user: result.user, redirect: result.redirect });
  });

  r.post('/logout', requireCsrfHeader(), requireSession(deps.sql), async (c) => {
    await revokeSession(deps.sql, c.get('auth').sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  r.get('/me', requireSession(deps.sql), async (c) => {
    return c.json(await getMe(deps.sql, c.get('auth')));
  });

  r.post('/change-password', requireCsrfHeader(), requireSession(deps.sql), async (c) => {
    const body = await parseJsonBody(c, changePasswordSchema, 'MSG01');
    await changePassword(deps.sql, c.get('auth'), body.current_password, body.new_password);
    return c.json({});
  });

  return r;
}
