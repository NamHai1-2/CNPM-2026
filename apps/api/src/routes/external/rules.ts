import { Hono } from 'hono';
import { masterKeyFromConfig } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { requireApiKey } from '../../middleware/api-key.js';
import { getLoyaltyRules, toRulesView } from '../../services/rules.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

/** Mounted at /api/v1/loyalty-rules (Should, used by the MCP tool get_loyalty_rules). MSG32 when the Owner has not saved rules yet. */
export function externalRulesRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireApiKey({ sql: deps.sql, masterKey: masterKeyFromConfig(deps.config) }));

  r.get('/', async (c) => {
    const rules = await getLoyaltyRules(deps.sql, c.get('apiKey').merchantId);
    if (!rules) throw new AppError('MSG32');
    return c.json(toRulesView(rules));
  });

  return r;
}
