import { withTransaction, type Sql } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import type { Actor, TransactionRow } from '../types.js';
import { assertCustomerCode, getCustomerForUpdate } from './customers.js';
import { getLoyaltyRules } from './rules.js';
import { insertTransaction } from './transactions.js';

/** Ceilings of CR-02: a bill amount, the points of one request, and a customer balance. */
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_POINTS_PER_REQUEST = 1_000_000;
export const MAX_BALANCE = 1_000_000_000;

export interface IssueInput {
  merchantId: string;
  customerCode: string;
  /** The bill amount in VND. */
  amount: number;
  actor: Actor;
}

export interface RedeemInput {
  merchantId: string;
  customerCode: string;
  points: number;
  actor: Actor;
}

function isIntegerInRange(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

/**
 * Steps 1 and 2 of docs/db-schema.md section 5, shared by issue and redeem. The customer row is locked FIRST, before anything
 * that depends on the balance (BR-06). Order of failures: customer unknown (MSG22), customer inactive (MSG39), rules not saved
 * (MSG32). `tx` must be an open transaction.
 */
async function lockCustomerAndReadRules(tx: Sql, merchantId: string, customerCode: string) {
  assertCustomerCode(customerCode); // lowercase or malformed: MSG33, never changed silently
  const customer = await getCustomerForUpdate(tx, merchantId, customerCode);
  if (!customer) throw new AppError('MSG22');
  if (!customer.isActive) throw new AppError('MSG39');
  const rules = await getLoyaltyRules(tx, merchantId);
  if (!rules) throw new AppError('MSG32');
  return { customer, rules };
}

/**
 * Adds points for a bill (UC-10) inside the transaction `tx`.
 * points = floor(amount / earn_ratio): the remainder is lost, not carried over (BR-17). 0 points: MSG24; more than 1,000,000
 * points, or a balance above 1,000,000,000: MSG33. The earn_ratio used is stored in the ledger row (BR-22).
 */
export async function issuePointsInTx(tx: Sql, input: IssueInput): Promise<TransactionRow> {
  if (!isIntegerInRange(input.amount, MAX_AMOUNT)) throw new AppError('MSG33');
  const { customer, rules } = await lockCustomerAndReadRules(tx, input.merchantId, input.customerCode);

  const points = Math.floor(input.amount / rules.earnRatio);
  if (points === 0) throw new AppError('MSG24');
  if (points > MAX_POINTS_PER_REQUEST) throw new AppError('MSG33');
  const newBalance = customer.balance + points;
  if (newBalance > MAX_BALANCE) throw new AppError('MSG33');

  await tx`UPDATE customers SET balance = ${newBalance}, updated_at = now() WHERE id = ${customer.id}`;
  return await insertTransaction(tx, {
    type: 'ISSUE',
    merchantId: input.merchantId,
    customerId: customer.id,
    customerCode: customer.customerCode,
    points,
    billAmount: input.amount,
    earnRatio: rules.earnRatio,
    balanceAfter: newBalance,
    reverses: null,
    actor: input.actor,
  });
}

/**
 * Spends points (UC-11) inside the transaction `tx`. Fewer points than min_redemption_threshold: MSG09, checked FIRST (even when
 * the balance is also too low); then a balance that does not cover the points: MSG08. The balance never goes below 0 (BR-05).
 */
export async function redeemPointsInTx(tx: Sql, input: RedeemInput): Promise<TransactionRow> {
  if (!isIntegerInRange(input.points, MAX_POINTS_PER_REQUEST)) throw new AppError('MSG33');
  const { customer, rules } = await lockCustomerAndReadRules(tx, input.merchantId, input.customerCode);

  if (input.points < rules.minRedemptionThreshold) {
    throw new AppError('MSG09', { params: { min_points: rules.minRedemptionThreshold } });
  }
  if (customer.balance < input.points) throw new AppError('MSG08');
  const newBalance = customer.balance - input.points;

  await tx`UPDATE customers SET balance = ${newBalance}, updated_at = now() WHERE id = ${customer.id}`;
  return await insertTransaction(tx, {
    type: 'REDEEM',
    merchantId: input.merchantId,
    customerId: customer.id,
    customerCode: customer.customerCode,
    points: input.points,
    billAmount: null,
    earnRatio: null,
    balanceAfter: newBalance,
    reverses: null,
    actor: input.actor,
  });
}

/** Issue in its own transaction. When idempotency is needed (T07b), use issuePointsInTx inside withIdempotency instead. */
export async function issuePoints(sql: Sql, input: IssueInput): Promise<TransactionRow> {
  return await withTransaction(sql, (tx) => issuePointsInTx(tx, input));
}

/** Redeem in its own transaction. When idempotency is needed (T07b), use redeemPointsInTx inside withIdempotency instead. */
export async function redeemPoints(sql: Sql, input: RedeemInput): Promise<TransactionRow> {
  return await withTransaction(sql, (tx) => redeemPointsInTx(tx, input));
}
