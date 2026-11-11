import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { parseJsonBody } from '../../lib/http.js';
import { requestTarget } from '../../lib/request-target.js';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { hashRequest, readIdempotencyKey, withIdempotency } from '../../services/idempotency.js';
import {
  MAX_AMOUNT,
  MAX_POINTS_PER_REQUEST,
  issuePointsInTx,
  redeemPointsInTx,
} from '../../services/points.js';
import { toTransactionView } from '../../services/transactions.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

// Real JSON integers only: 0, 1.5, "10", null and values above the ceilings answer MSG33 (CR-02).
const issueSchema = z.object({ amount: z.number().int().min(1).max(MAX_AMOUNT) });
const redeemSchema = z.object({ points: z.number().int().min(1).max(MAX_POINTS_PER_REQUEST) });

const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';

/**
 * Mounted at /api/v1/merchant/customers (next to the customer routes of T05, which use the same guards).
 * Issue and redeem from the portal: Owner and Staff. The idempotency scope is the logged-in user (BR-10).
 */
export function portalPointsRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER', 'MERCHANT_STAFF'));
  const template = deps.config.SUI_EXPLORER_TX_URL;

  r.post('/:code/issue', async (c) => {
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const body = await parseJsonBody(c, issueSchema, 'MSG33');
    const key = readIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
    const merchantId = requireMerchantId(c);
    const userId = c.get('auth').userId;
    const customerCode = c.req.param('code');

    const result = await withIdempotency(
      deps.sql,
      { scope: { kind: 'USER', userId }, key, requestHash: hashRequest(c.req.method, requestTarget(c.req.url), raw) },
      async (tx) => {
        const row = await issuePointsInTx(tx, { merchantId, customerCode, amount: body.amount, actor: { kind: 'USER', userId } });
        return { status: 201, body: toTransactionView(row, template) };
      },
    );
    return c.json(result.body, result.status as ContentfulStatusCode); // the toast texts are MSG06 and MSG20
  });

  r.post('/:code/redeem', async (c) => {
    const raw = new Uint8Array(await c.req.arrayBuffer());
    const body = await parseJsonBody(c, redeemSchema, 'MSG33');
    const key = readIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
    const merchantId = requireMerchantId(c);
    const userId = c.get('auth').userId;
    const customerCode = c.req.param('code');

    const result = await withIdempotency(
      deps.sql,
      { scope: { kind: 'USER', userId }, key, requestHash: hashRequest(c.req.method, requestTarget(c.req.url), raw) },
      async (tx) => {
        const row = await redeemPointsInTx(tx, { merchantId, customerCode, points: body.points, actor: { kind: 'USER', userId } });
        return { status: 201, body: toTransactionView(row, template) };
      },
    );
    return c.json(result.body, result.status as ContentfulStatusCode); // the toast texts are MSG07 and MSG20
  });

  return r;
}
