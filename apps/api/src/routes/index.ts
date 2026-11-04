import { Hono } from 'hono';
import { Sql } from '../db/client.js';
import { adminDashboardRoutes, merchantDashboardRoutes } from './portal/dashboard.js';

export interface RouteDeps {
  sql: Sql;
}

export function registerRoutes(app: Hono, deps: RouteDeps) {
  app.route('/api/v1/admin/dashboard', adminDashboardRoutes(deps));
  app.route('/api/v1/merchant/dashboard', merchantDashboardRoutes(deps));
}