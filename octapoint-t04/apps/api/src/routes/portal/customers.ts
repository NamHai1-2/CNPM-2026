import { Hono } from 'hono';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import {
  createCustomer,
  listCustomers,
  setCustomerActive,
  toCustomerView,
  updateCustomer,
} from '../../services/customers.js';
import { parsePage } from '../../services/merchants.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

const createSchema = z.object({
  customer_code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullable().optional(),
});

/**
 * Mounted at /api/v1/merchant/customers (T07b mounts the issue and redeem routes under the same prefix).
 * Owner and Staff for the whole prefix; deactivate and reactivate are narrowed to the Owner per route.
 */
export function customerRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER', 'MERCHANT_STAFF'));

  r.get('/', async (c) => {
    const page = await listCustomers(deps.sql, requireMerchantId(c), {
      q: c.req.query('q'),
      page: parsePage(c.req.query('page')),
    });
    return c.json(page);
  });

  r.post('/', async (c) => {
    const body = await parseJsonBody(c, createSchema, 'MSG01');
    const customer = await createCustomer(deps.sql, {
      merchantId: requireMerchantId(c),
      customerCode: body.customer_code,
      name: body.name,
      phone: body.phone,
    });
    return c.json(toCustomerView(customer), 201); // the toast text is MSG28
  });

  r.patch('/:code', async (c) => {
    // Only name and phone can change; a customer_code in the body is ignored (the code never changes).
    const body = await parseJsonBody(c, updateSchema, 'MSG33');
    const customer = await updateCustomer(deps.sql, {
      merchantId: requireMerchantId(c),
      customerCode: c.req.param('code'),
      changes: { name: body.name, phone: body.phone },
    });
    return c.json(toCustomerView(customer)); // the toast text is MSG29
  });

  r.post('/:code/deactivate', requireRole('MERCHANT_OWNER'), async (c) => {
    const customer = await setCustomerActive(deps.sql, {
      merchantId: requireMerchantId(c),
      customerCode: c.req.param('code'),
      active: false,
      actorUserId: c.get('auth').userId,
    });
    return c.json(toCustomerView(customer));
  });

  r.post('/:code/reactivate', requireRole('MERCHANT_OWNER'), async (c) => {
    const customer = await setCustomerActive(deps.sql, {
      merchantId: requireMerchantId(c),
      customerCode: c.req.param('code'),
      active: true,
      actorUserId: c.get('auth').userId,
    });
    return c.json(toCustomerView(customer));
  });

  return r;
}
