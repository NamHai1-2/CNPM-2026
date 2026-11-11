import type { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import type { AppEnv } from '../types.js';
import { adminMerchantRoutes } from './portal/admin-merchants.js';
import { adminLedgerRoutes, merchantLedgerRoutes } from './portal/ledger.js';
import { apiKeyRoutes } from './portal/api-keys.js';
import { authRoutes } from './portal/auth.js';
import { customerRoutes } from './portal/customers.js';
import { portalPointsRoutes } from './portal/points.js';
import { registrationRoutes } from './portal/registration.js';
import { ruleRoutes } from './portal/rules.js';
import { staffRoutes } from './portal/staff.js';
import { externalCustomerRoutes } from './external/customers.js';
import { externalPointsRoutes } from './external/points.js';
import { externalRulesRoutes } from './external/rules.js';
import { adminDashboardRoutes, merchantDashboardRoutes } from './portal/dashboard.js';

export interface RouteDeps {
  sql: Sql;
  config: Config;
}

/**
 * The one place where route modules are mounted (paths: docs/ai-prompts.md section 4).
 * Each task adds exactly ONE import line and ONE app.route(...) line here.
 * Convention for every route module: export function xxxRoutes(deps: RouteDeps): Hono<AppEnv>.
 */
export function registerRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  app.route('/api/v1/auth', authRoutes(deps));
  app.route('/api/v1/auth/register', registrationRoutes(deps));
  app.route('/api/v1/admin/merchants', adminMerchantRoutes(deps));
  app.route('/api/v1/admin/ledger', adminLedgerRoutes(deps));
  app.route('/api/v1/merchant/staff', staffRoutes(deps));
  app.route('/api/v1/merchant/api-keys', apiKeyRoutes(deps));
  app.route('/api/v1/merchant/customers', customerRoutes(deps));
  app.route('/api/v1/merchant/customers', portalPointsRoutes(deps));
  app.route('/api/v1/merchant/rules', ruleRoutes(deps));
  app.route('/api/v1/merchant/ledger', merchantLedgerRoutes(deps));
  app.route('/api/v1/points', externalPointsRoutes(deps));
  app.route('/api/v1/customers', externalCustomerRoutes(deps));
  app.route('/api/v1/loyalty-rules', externalRulesRoutes(deps));
  app.route('/api/v1/admin/dashboard', adminDashboardRoutes(deps));
  app.route('/api/v1/merchant/dashboard', merchantDashboardRoutes(deps));
}
