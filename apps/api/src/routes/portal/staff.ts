import { Hono } from 'hono';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { parsePage } from '../../services/merchants.js';
import { createStaff, deactivateStaff, listStaff } from '../../services/staff.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

const createSchema = z.object({
  full_name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  initial_password: z.string().min(1),
});

/** Mounted at /api/v1/merchant/staff. Owner only, for the whole prefix. */
export function staffRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER'));

  r.get('/', async (c) => {
    return c.json(await listStaff(deps.sql, requireMerchantId(c), parsePage(c.req.query('page'))));
  });

  r.post('/', async (c) => {
    const body = await parseJsonBody(c, createSchema, 'MSG01');
    const staff = await createStaff(deps.sql, {
      merchantId: requireMerchantId(c),
      actorUserId: c.get('auth').userId,
      fullName: body.full_name,
      email: body.email,
      initialPassword: body.initial_password,
    });
    return c.json(staff, 201); // the toast text is MSG28
  });

  r.post('/:id/deactivate', async (c) => {
    const staff = await deactivateStaff(deps.sql, {
      merchantId: requireMerchantId(c),
      staffId: c.req.param('id'),
      actorUserId: c.get('auth').userId,
    });
    return c.json(staff);
  });

  return r;
}
