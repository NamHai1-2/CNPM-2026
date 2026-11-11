import { Hono, type Context } from 'hono';
import { requireCsrfHeader, requireMerchantId, requireRole, requireSession } from '../../middleware/auth.js';
import { listLedger, reverseTransaction, type LedgerFilter } from '../../services/ledger.js';
import { parsePage } from '../../services/merchants.js';
import { toTransactionView } from '../../services/transactions.js';
import type { AppEnv } from '../../types.js';
import type { RouteDeps } from '../index.js';

/** Reads the filters from the query string. merchant_code is read for the Admin only. */
function readFilter(c: Context<AppEnv>, admin: boolean): LedgerFilter {
  const query = (name: string) => c.req.query(name);
  return {
    type: query('type'),
    status: query('status'),
    dateFrom: query('date_from'),
    dateTo: query('date_to'),
    customerCode: query('customer_code'),
    merchantCode: admin ? query('merchant_code') : undefined,
    page: parsePage(query('page')),
  };
}

/**
 * Mounted at /api/v1/merchant/ledger. Owner and Staff see the ledger of their merchant; only the Owner can reverse a transaction.
 * The Owner's rows say whether they can be reversed; the Staff's rows never do.
 */
export function merchantLedgerRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('MERCHANT_OWNER', 'MERCHANT_STAFF'));
  const explorerUrlTemplate = deps.config.SUI_EXPLORER_TX_URL;

  r.get('/', async (c) => {
    const page = await listLedger(
      deps.sql,
      { merchantId: requireMerchantId(c) },
      readFilter(c, false),
      { explorerUrlTemplate, includeReversible: c.get('auth').role === 'MERCHANT_OWNER' },
    );
    return c.json(page);
  });

  r.post('/:code/reverse', requireRole('MERCHANT_OWNER'), async (c) => {
    const reversal = await reverseTransaction(deps.sql, {
      merchantId: requireMerchantId(c),
      transactionCode: c.req.param('code'),
      actor: { kind: 'USER', userId: c.get('auth').userId },
    });
    return c.json({ reversal: toTransactionView(reversal, explorerUrlTemplate) }, 201); // the toast text is MSG19
  });

  return r;
}

/** Mounted at /api/v1/admin/ledger. The Admin sees every merchant, read only. */
export function adminLedgerRoutes(deps: RouteDeps): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps.sql), requireCsrfHeader(), requireRole('ADMIN'));

  r.get('/', async (c) => {
    const page = await listLedger(
      deps.sql,
      { merchantId: null },
      readFilter(c, true),
      { explorerUrlTemplate: deps.config.SUI_EXPLORER_TX_URL, includeReversible: false },
    );
    return c.json(page);
  });

  return r;
}
