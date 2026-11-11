import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import type { Page, TransactionRow, TransactionView, TxStatus, TxType } from '../types.js';
import { maskKeyId } from './apikeys.js';
import { writeAudit } from './audit.js';
import { assertCustomerCode, getCustomerForUpdate } from './customers.js';
import { PAGE_SIZE } from './merchants.js';
import { MAX_BALANCE } from './points.js';
import { explorerUrl, insertTransaction } from './transactions.js';

const TX_TYPES: readonly TxType[] = ['ISSUE', 'REDEEM', 'REVERSAL'];
const TX_STATUSES: readonly TxStatus[] = ['PENDING_ANCHOR', 'ANCHORED', 'FAILED'];
const TX_CODE = /^TXN-[0-9]{8}-[A-Z0-9]{8}$/;
const MERCHANT_CODE = /^MCH-[A-Z0-9]{6}$/;
/** The business day of dates in filters and dashboards is Vietnam time (UTC+7, CR-02). */
const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface LedgerFilter {
  type?: string;
  status?: string;
  /** YYYY-MM-DD in UTC+7, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  customerCode?: string;
  /** Admin only: ignored for a merchant scope. */
  merchantCode?: string;
  page: number;
}

export interface LedgerItem extends TransactionView {
  bill_amount: number | null;
  performed_by: { kind: 'USER' | 'API_KEY'; label: string };
  reversible: boolean;
  merchant_code?: string;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The ledger (UC-13), newest first (records with the same time ordered by id), 20 per page.
 * - scope.merchantId = a merchant: only its rows. null = Admin: every merchant, with merchant_code on each item.
 * - Every filter value is checked: a wrong type, status, date (not a real YYYY-MM-DD day), customer code or merchant code
 *   answers MSG33. Dates are days in UTC+7 and both ends are included. dateFrom after dateTo simply matches nothing.
 * - reversible is true only when opts.includeReversible is set (the Owner), the row is an ISSUE or REDEEM, and it has not been reversed.
 * - explorer_url exists only for ANCHORED rows.
 */
export async function listLedger(
  db: Sql,
  scope: { merchantId: string | null },
  filter: LedgerFilter,
  opts: { explorerUrlTemplate: string; includeReversible: boolean },
): Promise<Page<LedgerItem>> {
  if (filter.type !== undefined && !TX_TYPES.includes(filter.type as TxType)) throw new AppError('MSG33');
  if (filter.status !== undefined && !TX_STATUSES.includes(filter.status as TxStatus)) throw new AppError('MSG33');
  for (const date of [filter.dateFrom, filter.dateTo]) {
    if (date !== undefined && !isRealDate(date)) throw new AppError('MSG33');
  }
  if (filter.customerCode !== undefined) assertCustomerCode(filter.customerCode);
  if (scope.merchantId === null && filter.merchantCode !== undefined && !MERCHANT_CODE.test(filter.merchantCode)) {
    throw new AppError('MSG33');
  }

  const { merchantId, type, status, dateFrom, dateTo, customerCode } = { ...scope, ...filter };
  const merchantCode = scope.merchantId === null ? filter.merchantCode : undefined;
  const filters = () => db`
    ${merchantId ? db`AND t.merchant_id = ${merchantId}` : db``}
    ${merchantCode ? db`AND m.code = ${merchantCode}` : db``}
    ${type ? db`AND t.type = ${type}` : db``}
    ${status ? db`AND t.status = ${status}` : db``}
    ${customerCode ? db`AND c.customer_code = ${customerCode}` : db``}
    ${dateFrom ? db`AND t.created_at >= (${dateFrom}::date)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE}` : db``}
    ${dateTo ? db`AND t.created_at < ((${dateTo}::date + 1)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE})` : db``}`;

  const rows = await db`
    SELECT t.code, t.type, t.points, t.bill_amount, t.balance_after, t.status, t.sui_digest, t.created_at,
           c.customer_code, m.code AS merchant_code, o.code AS reverses_code,
           u.full_name AS user_name, k.key_id AS api_key_public_id,
           (t.type IN ('ISSUE', 'REDEEM') AND r.id IS NULL) AS reversible
    FROM transactions t
    JOIN customers c ON c.id = t.customer_id
    JOIN merchants m ON m.id = t.merchant_id
    LEFT JOIN transactions o ON o.id = t.reverses_transaction_id
    LEFT JOIN transactions r ON r.reverses_transaction_id = t.id
    LEFT JOIN users u ON u.id = t.performed_by_user_id
    LEFT JOIN api_keys k ON k.id = t.performed_by_api_key_id
    WHERE true ${filters()}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(filter.page - 1) * PAGE_SIZE}`;
  const [count] = await db`
    SELECT count(*)::int AS total
    FROM transactions t
    JOIN customers c ON c.id = t.customer_id
    JOIN merchants m ON m.id = t.merchant_id
    WHERE true ${filters()}`;

  const items = rows.map((row): LedgerItem => {
    const byUser = row.user_name !== null && row.user_name !== undefined;
    const item: LedgerItem = {
      transaction_id: String(row.code),
      type: row.type as TxType,
      customer_code: String(row.customer_code),
      points: Number(row.points),
      balance_after: Number(row.balance_after),
      status: row.status as TxStatus,
      sui_digest: row.sui_digest === null ? null : String(row.sui_digest),
      explorer_url:
        row.status === 'ANCHORED' && row.sui_digest ? explorerUrl(opts.explorerUrlTemplate, String(row.sui_digest)) : null,
      reverses_transaction_id: row.reverses_code === null ? null : String(row.reverses_code),
      created_at: new Date(row.created_at as Date).toISOString(), // not String(...): that would drop the milliseconds
      bill_amount: row.bill_amount === null ? null : Number(row.bill_amount),
      performed_by: byUser
        ? { kind: 'USER', label: String(row.user_name) }
        : { kind: 'API_KEY', label: maskKeyId(String(row.api_key_public_id)) },
      reversible: opts.includeReversible && Boolean(row.reversible),
    };
    if (scope.merchantId === null) item.merchant_code = String(row.merchant_code);
    return item;
  });
  return { items, page: filter.page, page_size: PAGE_SIZE, total: Number(count.total) };
}

/**
 * Reverses an ISSUE or REDEEM by writing a REVERSAL of the same points (UC-14). The original is never changed (BR-03).
 * One database transaction, in this order (db-schema.md section 5):
 * 1. find the original by code in this merchant (unknown: MSG22; malformed code: MSG33);
 * 2. lock the customer row (BR-06);
 * 3. check AFTER the lock: it is an ISSUE or REDEEM and has no reversal yet (else MSG26), so two simultaneous reversals cannot both pass;
 * 4. reversing an ISSUE takes the points back: a balance that would go below 0 is MSG25; reversing a REDEEM gives them back: a
 *    balance above 1,000,000,000 is MSG41. An inactive customer is allowed; the anchoring status of the original does not matter;
 * 5. update the balance, write the REVERSAL (linked to the original, with who did it), write the audit row REVERSAL_CREATED.
 */
export async function reverseTransaction(
  sql: Sql,
  input: { merchantId: string; transactionCode: string; actor: { kind: 'USER'; userId: string } },
): Promise<TransactionRow> {
  if (!TX_CODE.test(input.transactionCode)) throw new AppError('MSG33');

  try {
    return await withTransaction(sql, async (tx) => {
      const found = await tx`
        SELECT t.id, t.type, t.points, c.customer_code
        FROM transactions t JOIN customers c ON c.id = t.customer_id
        WHERE t.code = ${input.transactionCode} AND t.merchant_id = ${input.merchantId}`;
      const original = found[0];
      if (!original) throw new AppError('MSG22');

      const customer = await getCustomerForUpdate(tx, input.merchantId, String(original.customer_code));
      if (!customer) throw new AppError('MSG22'); // cannot happen: the transaction row references this customer

      if (original.type === 'REVERSAL') throw new AppError('MSG26');
      const already = await tx`SELECT 1 FROM transactions WHERE reverses_transaction_id = ${original.id} LIMIT 1`;
      if (already.length > 0) throw new AppError('MSG26');

      const points = Number(original.points);
      let newBalance: number;
      if (original.type === 'ISSUE') {
        newBalance = customer.balance - points;
        if (newBalance < 0) throw new AppError('MSG25');
      } else {
        newBalance = customer.balance + points;
        if (newBalance > MAX_BALANCE) throw new AppError('MSG41');
      }

      await tx`UPDATE customers SET balance = ${newBalance}, updated_at = now() WHERE id = ${customer.id}`;
      const reversal = await insertTransaction(tx, {
        type: 'REVERSAL',
        merchantId: input.merchantId,
        customerId: customer.id,
        customerCode: customer.customerCode,
        points,
        billAmount: null,
        earnRatio: null,
        balanceAfter: newBalance,
        reverses: { id: String(original.id), code: input.transactionCode },
        actor: input.actor,
      });
      await writeAudit(tx, {
        merchantId: input.merchantId,
        actorUserId: input.actor.userId,
        action: 'REVERSAL_CREATED',
        entityType: 'transaction',
        entityId: reversal.id,
        details: { original: input.transactionCode, reversal: reversal.code, points },
      });
      return reversal;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'uq_one_reversal')) throw new AppError('MSG26'); // the database is the last guard
    throw error;
  }
}