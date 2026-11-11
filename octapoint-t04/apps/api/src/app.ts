import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError, toErrorResponse } from './lib/errors.js';
import { formatMessage } from './lib/messages.js';
import { logger } from './lib/logger.js';
import type { AppEnv } from './types.js';

export interface AppDeps {
  /** Resolves when the database answers; rejects otherwise. */
  checkDb: () => Promise<void>;
  /** Adds the API routes (src/routes/index.ts registerRoutes). Optional so tests can build a bare app. */
  routes?: (app: Hono<AppEnv>) => void;
}

/**
 * Builds the Hono application. Routes of the two API surfaces (docs/api-spec.md) are added here
 * by the later tasks: external/ (HMAC) and portal/ (session cookie), both under /api/v1.
 */
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    await next();
    logger.request({
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  app.get('/health', async (c) => {
    await deps.checkDb();
    return c.json({ status: 'ok' });
  });

  deps.routes?.(app);

  app.notFound((c) =>
    // Unknown routes use MSG33 with HTTP 404 (documented in api-spec.md, "Common rules").
    c.json({ code: 'MSG33', message: formatMessage('MSG33') }, 404),
  );

  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error);
    if (!(error instanceof AppError) || status >= 500) {
      logger.error('unhandled error', {
        requestId: c.get('requestId'),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    c.header('X-Request-Id', c.get('requestId'));
    return c.json(body, status as ContentfulStatusCode);
  });

  return app;
}
