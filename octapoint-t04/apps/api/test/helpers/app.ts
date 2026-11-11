import type { Hono } from 'hono';
import { createApp } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config.js';
import type { Sql } from '../../src/db/client.js';
import { registerRoutes } from '../../src/routes/index.js';
import type { AppEnv } from '../../src/types.js';

/** A valid configuration for tests. NODE_ENV is 'test', so the session cookie has no Secure flag. */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://octapoint:octapoint@localhost:5433/octapoint',
    SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  });
}

/** The real app (all registered routes) on top of a test database. */
export function createTestApp(sql: Sql, config: Config = testConfig()): Hono<AppEnv> {
  return createApp({
    checkDb: async () => {
      await sql`SELECT 1`;
    },
    routes: (app) => registerRoutes(app, { sql, config }),
  });
}
