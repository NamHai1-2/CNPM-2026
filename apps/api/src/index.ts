import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSql } from './db/client.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';
import { registerRoutes } from './routes/index.js';
import { cleanupExpired } from './services/maintenance.js';
import { createSuiChain, startAnchorWorker, toAnchorDb } from './services/anchoring/index.js';

loadEnv();
const config = loadConfig();
const sql = createSql(config.DATABASE_URL);

const app = createApp({
  checkDb: async () => {
    await sql`SELECT 1`;
  },
  routes: (api) => registerRoutes(api, { sql, config }),
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info('api listening', { port: info.port, env: config.NODE_ENV });
});

let anchorWorker: ReturnType<typeof startAnchorWorker> | undefined;
if (config.ENABLE_ANCHOR_WORKER) {
  anchorWorker = startAnchorWorker(
    {
      db: toAnchorDb(sql),
      chain: createSuiChain({
        rpcUrl: config.SUI_RPC_URL,
        graphqlUrl: config.SUI_GRAPHQL_URL,
        privateKey: config.SUI_PRIVATE_KEY!,
        packageId: config.SUI_PACKAGE_ID!,
        registryId: config.SUI_REGISTRY_ID!,
      }),
      logger, // cần info/warn/error(message, context?) – nếu logger của bạn khác chữ ký, bọc lại 1 dòng
    },
    config.ANCHOR_INTERVAL_SECONDS,
    { batchSize: config.ANCHOR_BATCH_SIZE },
  );
}

// Daily cleanup of idempotency keys and sessions (docs/config-and-deploy.md section 4). Runs once at start-up, then every 24 hours.
async function runCleanup(): Promise<void> {
  try {
    logger.info('cleanup', await cleanupExpired(sql));
  } catch (error) {
    logger.error('cleanup failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
void runCleanup();
const cleanupTimer = setInterval(() => void runCleanup(), 24 * 60 * 60 * 1000);
cleanupTimer.unref(); // the timer alone must not keep the process alive

async function shutdown(signal: string): Promise<void> {
  logger.info('shutting down', { signal });
  clearInterval(cleanupTimer);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
