import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSql } from './db/client.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';

loadEnv();
const config = loadConfig();
const sql = createSql(config.DATABASE_URL);

const app = createApp({
  checkDb: async () => {
    await sql`SELECT 1`;
  },
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info('api listening', { port: info.port, env: config.NODE_ENV });
});

if (config.ENABLE_ANCHOR_WORKER) {
  // The worker itself is task T12 (docs/anchoring.md section 3).
  logger.warn('ENABLE_ANCHOR_WORKER=true but the anchoring worker is not implemented yet (task T12)');
}

async function shutdown(signal: string): Promise<void> {
  logger.info('shutting down', { signal });
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
