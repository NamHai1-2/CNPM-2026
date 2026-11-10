import type { Hono } from 'hono';
import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import type { AppEnv } from '../types.js';
import { authRoutes } from './portal/auth.js';

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
}
