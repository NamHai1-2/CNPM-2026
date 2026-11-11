import type { Sql } from '../db/client.js';

/** JSON of api-spec.md B.3 (GET /admin/dashboard, UC-03). */
export interface AdminDashboardView {
  merchants: { total: number; pending: number; active: number; suspended: number };
  /** Customers of ALL merchants, whatever the status of the merchant or of the customer. */
  total_customers: number;
  /** ISSUE minus REVERSAL of an ISSUE. */
  points_issued: number;
  /** REDEEM minus REVERSAL of a REDEEM. */
  points_redeemed: number;
}

/** JSON of api-spec.md B.4 (GET /merchant/dashboard, UC-05). */
export interface MerchantDashboardView {
  total_customers: number;
  /** Sum of the balances of the merchant's customers. */
  circulating_points: number;
  /** Transactions of ALL types and statuses created since 00:00 today in Asia/Ho_Chi_Minh (UTC+7). */
  today_transactions: number;
}

/**
 * Numbers for the Admin dashboard (UC-03, SRS 3.2.6.1), from db-schema.md section 6. One statement, so every number
 * comes from the same snapshot. Counts and sums are bigint in PostgreSQL and plain integers here; an empty database
 * gives zeros.
 */
export async function adminDashboard(db: Sql): Promise<AdminDashboardView> {
  const [row] = await db`
    SELECT
      (SELECT count(*)                                       FROM merchants)                         AS merchants_total,
      (SELECT count(*) FILTER (WHERE status = 'PENDING')     FROM merchants)                         AS merchants_pending,
      (SELECT count(*) FILTER (WHERE status = 'ACTIVE')      FROM merchants)                         AS merchants_active,
      (SELECT count(*) FILTER (WHERE status = 'SUSPENDED')   FROM merchants)                         AS merchants_suspended,
      (SELECT count(*)                                       FROM customers)                         AS total_customers,
      (SELECT coalesce(sum(CASE WHEN t.type = 'ISSUE' THEN t.points END), 0)
            - coalesce(sum(CASE WHEN t.type = 'REVERSAL' AND o.type = 'ISSUE' THEN t.points END), 0)
         FROM transactions t LEFT JOIN transactions o ON o.id = t.reverses_transaction_id)           AS points_issued,
      (SELECT coalesce(sum(CASE WHEN t.type = 'REDEEM' THEN t.points END), 0)
            - coalesce(sum(CASE WHEN t.type = 'REVERSAL' AND o.type = 'REDEEM' THEN t.points END), 0)
         FROM transactions t LEFT JOIN transactions o ON o.id = t.reverses_transaction_id)           AS points_redeemed`;
  return {
    merchants: {
      total: Number(row.merchants_total),
      pending: Number(row.merchants_pending),
      active: Number(row.merchants_active),
      suspended: Number(row.merchants_suspended),
    },
    total_customers: Number(row.total_customers),
    points_issued: Number(row.points_issued),
    points_redeemed: Number(row.points_redeemed),
  };
}

/**
 * Numbers for one merchant's dashboard (UC-05, SRS 3.2.6.2), from db-schema.md section 6. Every query filters by
 * `merchantId` (BR-01), which comes from the session and never from the request. "Today" starts at 00:00 in
 * Asia/Ho_Chi_Minh; a transaction one millisecond before that instant belongs to yesterday.
 */
export async function merchantDashboard(db: Sql, merchantId: string): Promise<MerchantDashboardView> {
  const [row] = await db`
    SELECT
      (SELECT count(*) FROM customers WHERE merchant_id = ${merchantId})                          AS total_customers,
      (SELECT coalesce(sum(balance), 0) FROM customers WHERE merchant_id = ${merchantId})         AS circulating_points,
      (SELECT count(*) FROM transactions
        WHERE merchant_id = ${merchantId}
          AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'))
                                                                                                  AS today_transactions`;
  return {
    total_customers: Number(row.total_customers),
    circulating_points: Number(row.circulating_points),
    today_transactions: Number(row.today_transactions),
  };
}