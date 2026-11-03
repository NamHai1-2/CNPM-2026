import { Hono } from 'hono';
import { RouteDeps } from '../index.js';
import { adminDashboard, merchantDashboard } from '../../services/dashboard.js';

export function adminDashboardRoutes(deps: RouteDeps): Hono {
  const router = new Hono();

  router.get('/', async (c) => {
    const data = await adminDashboard(deps.sql);
    return c.json(data);
  });

  return router;
}

export function merchantDashboardRoutes(deps: RouteDeps): Hono {
  const router = new Hono();

  router.get('/', async (c) => {
    const merchantId = c.req.query('merchant_id') || c.req.header('x-merchant-id') || '';
    const data = await merchantDashboard(deps.sql, merchantId);
    return c.json(data);
  });

  return router;
}