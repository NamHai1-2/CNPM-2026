import { Sql } from '../db/client.js';

export interface AdminDashboardView {
  merchants: {
    total: number;
    pending: number;
    active: number;
    suspended: number;
  };
  total_customers: number;
  points_issued: number;
  points_redeemed: number;
}

export interface MerchantDashboardView {
  total_customers: number;
  circulating_points: number;
  today_transactions: number;
}

export async function adminDashboard(db: Sql): Promise<AdminDashboardView> {
  const merchantCounts = await db<{ status: string; count: string }[]>`
    SELECT status, COUNT(*)::text as count
    FROM merchants
    GROUP BY status
  `;

  let totalMerchants = 0;
  let pending = 0;
  let active = 0;
  let suspended = 0;

  for (const row of merchantCounts) {
    const cnt = parseInt(row.count, 10);
    totalMerchants += cnt;
    if (row.status === 'PENDING') pending = cnt;
    if (row.status === 'ACTIVE') active = cnt;
    if (row.status === 'SUSPENDED') suspended = cnt;
  }

  const [custRow] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text as count FROM customers
  `;
  const totalCustomers = parseInt(custRow?.count || '0', 10);

  const [ptsRow] = await db<{
    issued: string | null;
    issued_reversed: string | null;
    redeemed: string | null;
    redeemed_reversed: string | null;
  }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'ISSUE' THEN t.points ELSE 0 END), 0)::text as issued,
      COALESCE(SUM(CASE WHEN t.type = 'REVERSAL' AND orig.type = 'ISSUE' THEN t.points ELSE 0 END), 0)::text as issued_reversed,
      COALESCE(SUM(CASE WHEN t.type = 'REDEEM' THEN t.points ELSE 0 END), 0)::text as redeemed,
      COALESCE(SUM(CASE WHEN t.type = 'REVERSAL' AND orig.type = 'REDEEM' THEN t.points ELSE 0 END), 0)::text as redeemed_reversed
    FROM transactions t
    LEFT JOIN transactions orig ON t.reverses_transaction_id = orig.id
  `;

  const grossIssued = parseInt(ptsRow?.issued || '0', 10);
  const issuedReversed = parseInt(ptsRow?.issued_reversed || '0', 10);
  const grossRedeemed = parseInt(ptsRow?.redeemed || '0', 10);
  const redeemedReversed = parseInt(ptsRow?.redeemed_reversed || '0', 10);

  return {
    merchants: {
      total: totalMerchants,
      pending,
      active,
      suspended,
    },
    total_customers: totalCustomers,
    points_issued: Math.max(0, grossIssued - issuedReversed),
    points_redeemed: Math.max(0, grossRedeemed - redeemedReversed),
  };
}

export async function merchantDashboard(db: Sql, merchantId: string): Promise<MerchantDashboardView> {
  const [custRow] = await db<{ count: string; circulating: string | null }[]>`
    SELECT 
      COUNT(*)::text as count,
      COALESCE(SUM(balance), 0)::text as circulating
    FROM customers
    WHERE merchant_id = ${merchantId}
  `;

  const totalCustomers = parseInt(custRow?.count || '0', 10);
  const circulatingPoints = parseInt(custRow?.circulating || '0', 10);

  const [txRow] = await db<{ count: string }[]>`
    SELECT COUNT(*)::text as count
    FROM transactions
    WHERE merchant_id = ${merchantId}
      AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  `;

  const todayTransactions = parseInt(txRow?.count || '0', 10);

  return {
    total_customers: totalCustomers,
    circulating_points: circulatingPoints,
    today_transactions: todayTransactions,
  };
}