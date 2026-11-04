import { Sql } from '../db/client.js';

export async function adminDashboard(sql: Sql) {
  const [merchantsCount] = await sql
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int as active,
      COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending
    FROM merchants
  .catch(() => [{ total: 0, active: 0, pending: 0 }]);

  const [customersCount] = await sql
    SELECT COUNT(*)::int as total FROM customers
  .catch(() => [{ total: 0 }]);

  const [pointsStats] = await sql
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'ISSUE' THEN amount ELSE 0 END), 0)::int as issued,
      COALESCE(SUM(CASE WHEN type = 'REDEEM' THEN amount ELSE 0 END), 0)::int as redeemed
    FROM transactions
  .catch(() => [{ issued: 0, redeemed: 0 }]);

  return {
    merchants: {
      total: Number(merchantsCount?.total || 0),
      active: Number(merchantsCount?.active || 0),
      pending: Number(merchantsCount?.pending || 0),
    },
    total_customers: Number(customersCount?.total || 0),
    points_issued: Number(pointsStats?.issued || 0),
    points_redeemed: Number(pointsStats?.redeemed || 0),
  };
}

export async function merchantDashboard(sql: Sql, merchantId: string) {
  const [customersCount] = await sql
    SELECT COUNT(*)::int as total FROM customers WHERE merchant_id = 
  .catch(() => [{ total: 0 }]);

  const [pointsCirculating] = await sql
    SELECT COALESCE(SUM(balance), 0)::int as circulating FROM customers WHERE merchant_id = 
  .catch(() => [{ circulating: 0 }]);

  const [todayTx] = await sql
    SELECT COUNT(*)::int as total 
    FROM transactions 
    WHERE merchant_id =  
      AND created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok' >= CURRENT_DATE
  .catch(() => [{ total: 0 }]);

  return {
    total_customers: Number(customersCount?.total || 0),
    circulating_points: Number(pointsCirculating?.circulating || 0),
    today_transactions: Number(todayTx?.total || 0),
  };
}