import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { masterKeyFromConfig } from '../../lib/crypto.js';
import { parseJsonBody } from '../../lib/http.js';
import { IDEMPOTENCY_HEADER, getRequestTarget, requireApiKey } from '../../middleware/api-key.js';
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

// Real JSON integers only (CR-02). customer_code is a string here; its format is checked by the points service (MSG33).
// Unknown fields, for example a merchant_id, are dropped: the merchant comes from the API key only (BR-01).
const issueSchema = z.object({
  customer_code: z.string(),
  amount: z.number().int().min(1).max(MAX_AMOUNT),
});
const redeemSchema = z.object({
  customer_code: z.string(),
  points: z.number().int().min(1).max(MAX_POINTS_PER_REQUEST),
});

/**
 * Mounted at /api/v1/points. POST /issue (UC-10) and POST /redeem (UC-11) for the Client System / SDK.
 * Order after the gateway (api-spec A.2): body validation (MSG33), idempotency key (MSG33), then ONE database transaction
 * that holds the idempotency record and the ledger row together (BR-10): a failed request leaves nothing behind.
 */
export function externalPointsRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireApiKey({ sql: deps.sql, masterKey: masterKeyFromConfig(deps.config) }));
  const template = deps.config.SUI_EXPLORER_TX_URL;

  r.post('/issue', async (c) => {
    const body = await parseJsonBody(c, issueSchema, 'MSG33');
    const key = readIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
    const { apiKeyId, merchantId } = c.get('apiKey');

    const result = await withIdempotency(
      deps.sql,
      {
        scope: { kind: 'API_KEY', apiKeyId },
        key,
        requestHash: hashRequest(c.req.method, getRequestTarget(c), c.get('rawBody')),
      },
      async (tx) => {
        const row = await issuePointsInTx(tx, {
          merchantId,
          customerCode: body.customer_code,
          amount: body.amount,
          actor: { kind: 'API_KEY', apiKeyId },
        });
        return { status: 201, body: toTransactionView(row, template) };
      },
    );
    return c.json(result.body, result.status as ContentfulStatusCode);
  });

  r.post('/redeem', async (c) => {
    const body = await parseJsonBody(c, redeemSchema, 'MSG33');
    const key = readIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
    const { apiKeyId, merchantId } = c.get('apiKey');

    const result = await withIdempotency(
      deps.sql,
      {
        scope: { kind: 'API_KEY', apiKeyId },
        key,
        requestHash: hashRequest(c.req.method, getRequestTarget(c), c.get('rawBody')),
      },
      async (tx) => {
        const row = await redeemPointsInTx(tx, {
          merchantId,
          customerCode: body.customer_code,
          points: body.points,
          actor: { kind: 'API_KEY', apiKeyId },
        });
        return { status: 201, body: toTransactionView(row, template) };
      },
    );
    return c.json(result.body, result.status as ContentfulStatusCode);
  });

  return r;
}
