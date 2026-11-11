import { Hono } from 'hono';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { adminDashboard, merchantDashboard } from '../../services/dashboard.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

/** Mounted at /api/v1/admin/dashboard. Admin only, for the whole prefix. */
export function adminDashboardRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('ADMIN'));

  r.get('/', async (c) => c.json(await adminDashboard(deps.sql)));

  return r;
}

/** Mounted at /api/v1/merchant/dashboard. Owner only (staff get MSG04), for the whole prefix. */
export function merchantDashboardRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER'));

  // The merchant comes from the session, never from the request (BR-01).
  r.get('/', async (c) => c.json(await merchantDashboard(deps.sql, requireMerchantId(c))));

  return r;
}