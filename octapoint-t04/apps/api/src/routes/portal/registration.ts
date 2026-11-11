import { Hono } from 'hono';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requireCsrfHeader } from '../../middleware/auth.js';
import { registerMerchant } from '../../services/merchants.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

const registerSchema = z.object({
  business_name: z.string().trim().min(1),
  owner_name: z.string().trim().min(1),
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

/** Mounted at /api/v1/auth/register. Public (no session), but it still needs the X-Requested-With header. */
export function registrationRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/', requireCsrfHeader(), async (c) => {
    const body = await parseJsonBody(c, registerSchema, 'MSG01');
    await registerMerchant(deps.sql, {
      businessName: body.business_name,
      ownerName: body.owner_name,
      email: body.email,
      password: body.password,
    });
    return c.json({}, 201);
  });

  return r;
}
