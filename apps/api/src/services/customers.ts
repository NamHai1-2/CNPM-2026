import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { isUniqueViolation } from '../lib/pg-errors.js';
import type { CustomerRow, CustomerView, Page } from '../types.js';
import { writeAudit } from './audit.js';
import { PAGE_SIZE } from './merchants.js';

const CODE_PATTERN = /^[A-Z0-9]{1,32}$/;
const PHONE_PATTERN = /^0[0-9]{9}$/;
const MAX_NAME = 200;
const MAX_SEARCH = 100;
const CODE_CONSTRAINT = 'customers_merchant_id_customer_code_key';
const PHONE_CONSTRAINT = 'uq_customer_phone';

function toRow(row: Record<string, unknown>): CustomerRow {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id),
    customerCode: String(row.customer_code),
    name: String(row.name),
    phone: row.phone === null || row.phone === undefined ? null : String(row.phone),
    balance: Number(row.balance),
    isActive: Boolean(row.is_active),
  };
}

export function toCustomerView(row: CustomerRow): CustomerView {
  return {
    id: row.id,
    customer_code: row.customerCode,
    name: row.name,
    phone: row.phone,
    balance: row.balance,
    is_active: row.isActive,
  };
}

/** A customer code is 1-32 upper-case letters or digits. It is never upper-cased for the caller (CR-02): lowercase is MSG33. */
export function assertCustomerCode(code: string): void {
  if (!CODE_PATTERN.test(code)) throw new AppError('MSG33');
}

/** Empty or blank means "no phone". A phone must be 10 digits starting with 0, otherwise MSG33. */
function normalizePhone(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;
  const trimmed = phone.trim();
  if (trimmed === '') return null;
  if (!PHONE_PATTERN.test(trimmed)) throw new AppError('MSG33');
  return trimmed;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > MAX_NAME) throw new AppError('MSG33');
  return trimmed;
}

/** The customer row, locked until the end of the transaction. null = no such customer in this merchant. Does NOT check is_active. */
export async function getCustomerForUpdate(
  tx: Sql,
  merchantId: string,
  customerCode: string,
): Promise<CustomerRow | null> {
  // Only call this inside a transaction (withTransaction): the lock is released at COMMIT or ROLLBACK.
  const rows = await tx`
    SELECT id, merchant_id, customer_code, name, phone, balance, is_active FROM customers
    WHERE merchant_id = ${merchantId} AND customer_code = ${customerCode}
    FOR UPDATE`;
  return rows[0] ? toRow(rows[0]) : null;
}

/** The customer row without a lock. null = no such customer in this merchant. */
export async function findCustomer(
  db: Sql,
  merchantId: string,
  customerCode: string,
): Promise<CustomerRow | null> {
  const rows = await db`
    SELECT id, merchant_id, customer_code, name, phone, balance, is_active FROM customers
    WHERE merchant_id = ${merchantId} AND customer_code = ${customerCode}`;
  return rows[0] ? toRow(rows[0]) : null;
}

/** Escapes % _ \ so a search text is matched literally by ILIKE. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The merchant's customers, newest first, 20 per page. `q` matches the code, name or phone anywhere in the text, ignoring case. */
export async function listCustomers(
  db: Sql,
  merchantId: string,
  filter: { q?: string; page: number },
): Promise<Page<CustomerView>> {
  const q = filter.q?.trim() ?? '';
  if (q.length > MAX_SEARCH) throw new AppError('MSG33');
  const pattern = likePattern(q);
  const search = () =>
    q === ''
      ? db``
      : db`AND (customer_code ILIKE ${pattern} OR name ILIKE ${pattern} OR phone ILIKE ${pattern})`;

  const rows = await db`
    SELECT id, merchant_id, customer_code, name, phone, balance, is_active FROM customers
    WHERE merchant_id = ${merchantId} ${search()}
    ORDER BY created_at DESC, id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(filter.page - 1) * PAGE_SIZE}`;
  const [count] = await db`
    SELECT count(*)::int AS total FROM customers WHERE merchant_id = ${merchantId} ${search()}`;

  return {
    items: rows.map((row) => toCustomerView(toRow(row))),
    page: filter.page,
    page_size: PAGE_SIZE,
    total: Number(count.total),
  };
}

/**
 * Creates a customer (UC-09) with balance 0. The code must be unique in the merchant (MSG27) and a phone, when
 * given, too (MSG38). Duplicates are detected by the database constraints, so two simultaneous requests cannot both succeed.
 */
export async function createCustomer(
  sql: Sql,
  input: { merchantId: string; customerCode: string; name: string; phone?: string | null },
): Promise<CustomerRow> {
  assertCustomerCode(input.customerCode);
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);

  try {
    const [row] = await sql`
      INSERT INTO customers (merchant_id, customer_code, name, phone)
      VALUES (${input.merchantId}, ${input.customerCode}, ${name}, ${phone})
      RETURNING id, merchant_id, customer_code, name, phone, balance, is_active`;
    return toRow(row);
  } catch (error) {
    if (isUniqueViolation(error, CODE_CONSTRAINT)) throw new AppError('MSG27');
    if (isUniqueViolation(error, PHONE_CONSTRAINT)) throw new AppError('MSG38');
    throw error;
  }
}

/**
 * Changes the name and/or the phone (MSG29). The code never changes. `phone: null` (or blank) removes the phone.
 * A field that is not in `changes` stays as it is. An unknown customer answers MSG22; nothing to change answers MSG33.
 */
export async function updateCustomer(
  sql: Sql,
  input: { merchantId: string; customerCode: string; changes: { name?: string; phone?: string | null } },
): Promise<CustomerRow> {
  assertCustomerCode(input.customerCode);
  const { name, phone } = input.changes;
  if (name === undefined && phone === undefined) throw new AppError('MSG33');
  const newName = name === undefined ? undefined : normalizeName(name);
  const newPhone = phone === undefined ? undefined : normalizePhone(phone);

  try {
    return await withTransaction(sql, async (tx) => {
      const current = await getCustomerForUpdate(tx, input.merchantId, input.customerCode);
      if (!current) throw new AppError('MSG22');
      const [row] = await tx`
        UPDATE customers
        SET name = ${newName ?? current.name},
            phone = ${newPhone === undefined ? current.phone : newPhone},
            updated_at = now()
        WHERE id = ${current.id}
        RETURNING id, merchant_id, customer_code, name, phone, balance, is_active`;
      return toRow(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, PHONE_CONSTRAINT)) throw new AppError('MSG38');
    throw error;
  }
}

/**
 * Deactivates or reactivates a customer (Owner only, audit-logged). Nothing is deleted: history, balance and the code
 * stay. Doing it twice is harmless (no second audit row). An unknown customer answers MSG22.
 */
export async function setCustomerActive(
  sql: Sql,
  input: { merchantId: string; customerCode: string; active: boolean; actorUserId: string },
): Promise<CustomerRow> {
  assertCustomerCode(input.customerCode);
  return await withTransaction(sql, async (tx) => {
    const current = await getCustomerForUpdate(tx, input.merchantId, input.customerCode);
    if (!current) throw new AppError('MSG22');
    if (current.isActive === input.active) return current;

    await tx`UPDATE customers SET is_active = ${input.active}, updated_at = now() WHERE id = ${current.id}`;
    await writeAudit(tx, {
      merchantId: input.merchantId,
      actorUserId: input.actorUserId,
      action: input.active ? 'CUSTOMER_REACTIVATED' : 'CUSTOMER_DEACTIVATED',
      entityType: 'customer',
      entityId: current.id,
    });
    return { ...current, isActive: input.active };
  });
}
