import { Hono } from 'hono';
import { masterKeyFromConfig } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { requireApiKey } from '../../middleware/api-key.js';
import { assertCustomerCode, findCustomer } from '../../services/customers.js';
import { listLedger } from '../../services/ledger.js';
import { parsePage } from '../../services/merchants.js';
import type { AppEnv, TransactionView } from '../../types.js';
import type { RouteDeps } from '../index.js';

/** The external "Transaction object" (api-spec section 0) has exactly these fields; the ledger view of the portal has more. */
function toExternalTransaction(item: TransactionView): TransactionView {
  return {
    transaction_id: item.transaction_id,
    type: item.type,
    customer_code: item.customer_code,
    points: item.points,
    balance_after: item.balance_after,
    status: item.status,
    sui_digest: item.sui_digest,
    explorer_url: item.explorer_url,
    reverses_transaction_id: item.reverses_transaction_id,
    created_at: item.created_at,
  };
}

/**
 * Mounted at /api/v1/customers. Read-only endpoints for the Client System / SDK / MCP Server.
 * A customer code is never changed for the caller (CR-02): a lower-case or malformed code is MSG33; a code that
 * belongs to another merchant looks exactly like an unknown one (MSG22).
 */
export function externalCustomerRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireApiKey({ sql: deps.sql, masterKey: masterKeyFromConfig(deps.config) }));
  const template = deps.config.SUI_EXPLORER_TX_URL;

  // UC-12. An inactive customer still returns the balance.
  r.get('/:code/balance', async (c) => {
    const code = c.req.param('code');
    assertCustomerCode(code);
    const customer = await findCustomer(deps.sql, c.get('apiKey').merchantId, code);
    if (!customer) throw new AppError('MSG22');
    return c.json({ customer_code: customer.customerCode, balance: customer.balance });
  });

  // UC-13. 20 per page, newest first (created_at, then id). The filter values are checked by the ledger service (MSG33).
  r.get('/:code/transactions', async (c) => {
    const { merchantId } = c.get('apiKey');
    const code = c.req.param('code');
    assertCustomerCode(code);
    const page = parsePage(c.req.query('page'));
    if (!(await findCustomer(deps.sql, merchantId, code))) throw new AppError('MSG22');

    const result = await listLedger(
      deps.sql,
      { merchantId },
      {
        customerCode: code,
        type: c.req.query('type'),
        status: c.req.query('status'),
        dateFrom: c.req.query('date_from'),
        dateTo: c.req.query('date_to'),
        page,
      },
      { explorerUrlTemplate: template, includeReversible: false },
    );
    return c.json({ ...result, items: result.items.map(toExternalTransaction) });
  });

  return r;
}
