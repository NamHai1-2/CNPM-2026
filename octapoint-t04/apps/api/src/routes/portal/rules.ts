import { Hono } from 'hono';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { RULE_MAX, getLoyaltyRules, saveLoyaltyRules, toRulesView } from '../../services/rules.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

// Real JSON numbers only: "10", null, 1.5, 0 and values above 1,000,000 all fail and answer MSG33.
const ruleValue = z.number().int().min(1).max(RULE_MAX);
const saveSchema = z.object({ earn_ratio: ruleValue, min_redemption_threshold: ruleValue });

/** Mounted at /api/v1/merchant/rules. Owner only, for the whole prefix. */
export function ruleRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER'));

  r.get('/', async (c) => {
    const rules = await getLoyaltyRules(deps.sql, requireMerchantId(c));
    return c.json(rules ? toRulesView(rules) : {}); // {} = never saved
  });

  r.put('/', async (c) => {
    const body = await parseJsonBody(c, saveSchema, 'MSG33');
    const saved = await saveLoyaltyRules(deps.sql, {
      merchantId: requireMerchantId(c),
      userId: c.get('auth').userId,
      rules: { earnRatio: body.earn_ratio, minRedemptionThreshold: body.min_redemption_threshold },
    });
    return c.json(toRulesView(saved)); // the toast text is MSG05
  });

  return r;
}
