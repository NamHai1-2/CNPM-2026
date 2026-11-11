import { Hono } from 'hono';
import { requireCsrfHeader, requireRole, requireSession } from '../../middleware/auth.js';
import { changeMerchantStatus, listMerchants, parsePage } from '../../services/merchants.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

/**
 * Mounted at /api/v1/admin/merchants. Every route here is for the Admin only, so the guards apply to the
 * whole prefix (nothing else is mounted under it).
 */
export function adminMerchantRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('ADMIN'));

  r.get('/', async (c) => {
    const page = await listMerchants(deps.sql, { status: c.req.query('status'), page: parsePage(c.req.query('page')) });
    return c.json(page);
  });

  r.post('/:id/approve', async (c) => {
    const merchant = await changeMerchantStatus(deps.sql, {
      merchantId: c.req.param('id'),
      to: 'ACTIVE',
      actorUserId: c.get('auth').userId,
    });
    return c.json(merchant); // the toast text is MSG13
  });

  r.post('/:id/suspend', async (c) => {
    const merchant = await changeMerchantStatus(deps.sql, {
      merchantId: c.req.param('id'),
      to: 'SUSPENDED',
      actorUserId: c.get('auth').userId,
    });
    return c.json(merchant); // the toast text is MSG14
  });

  return r;
}
