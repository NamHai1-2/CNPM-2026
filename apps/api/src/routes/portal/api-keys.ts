import { Hono } from 'hono';
import { masterKeyFromConfig } from '../../lib/crypto.js';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../../services/apikeys.js';
import { parsePage } from '../../services/merchants.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

/** Mounted at /api/v1/merchant/api-keys. Owner only, for the whole prefix. */
export function apiKeyRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const masterKey = masterKeyFromConfig(deps.config);
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER'));

  r.get('/', async (c) => {
    return c.json(await listApiKeys(deps.sql, requireMerchantId(c), parsePage(c.req.query('page'))));
  });

  r.post('/', async (c) => {
    // The secret is in this response and nowhere else (CR-07). The toast texts are MSG10 and MSG11.
    const key = await createApiKey(
      deps.sql,
      { merchantId: requireMerchantId(c), userId: c.get('auth').userId },
      masterKey,
    );
    return c.json(key, 201);
  });

  r.post('/:id/revoke', async (c) => {
    const key = await revokeApiKey(deps.sql, {
      merchantId: requireMerchantId(c),
      keyRowId: c.req.param('id'),
      actorUserId: c.get('auth').userId,
    });
    return c.json(key); // the toast text is MSG12
  });

  return r;
}
