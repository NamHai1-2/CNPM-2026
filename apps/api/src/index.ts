import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createSql } from './db/client.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';
import { registerRoutes } from './routes/index.js';
import { cleanupExpired, createSuiChain, anchorWorker as startAnchorWorker, toAnchorDb } from './services/maintenance.js';

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
  anchorWorker = startAnchorWorker({
    db: toAnchorDb(sql),
    chain: createSuiChain({
      rpcUrl: config.SUI_RPC_URL,
      graphqlUrl: config.SUI_GRAPHQL_URL,
      privateKey: config.SUI_PRIVATE_KEY!,
      packageId: config.SUI_PACKAGE_ID!,
    }),
  });
}
