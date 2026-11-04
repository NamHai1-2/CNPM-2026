import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { adminDashboard, merchantDashboard } from '../../src/services/dashboard.js';

describe('T10 - Dashboard API Services', () => {
  let db: TestDatabase;
  let sql: Sql;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
  });

  afterAll(async () => {
    if (sql) {
      try {
        await sql.end();
      } catch {}
    }
    if (db) {
      try {
        await db.drop();
      } catch {}
    }
  });

  it('th?ng kê dúng khi co s? d? li?u tr?ng', async () => {
    const adminRes = await adminDashboard(sql);
    expect(adminRes.merchants.total).toBe(0);
    expect(adminRes.total_customers).toBe(0);
    expect(adminRes.points_issued).toBe(0);
    expect(adminRes.points_redeemed).toBe(0);
  });

  it('th?ng kê dúng s? lu?ng merchant và khách hàng cho Admin', async () => {
    const [m1] = await sql`
      INSERT INTO merchants (code, name, status) VALUES ('MCH-000001', 'Shop A', 'ACTIVE') RETURNING id
    `;
    await sql`
      INSERT INTO merchants (code, name, status) VALUES ('MCH-000002', 'Shop B', 'PENDING') RETURNING id
    `;
    await sql`
      INSERT INTO customers (merchant_id, customer_code, name, balance) VALUES (${m1.id}, 'CUST01', 'Nguyen A', 100)
    `;

    const res = await adminDashboard(sql);
    expect(res.merchants.total).toBe(2);
    expect(res.merchants.active).toBe(1);
    expect(res.merchants.pending).toBe(1);
    expect(res.total_customers).toBe(1);
  });

  it('th?ng kê d? li?u merchant dashboard', async () => {
    const [m1] = await sql`
      INSERT INTO merchants (code, name, status) VALUES ('MCH-000003', 'Shop C', 'ACTIVE') RETURNING id
    `;
    const res = await merchantDashboard(sql, m1.id);
    expect(res.total_customers).toBe(0);
    expect(res.circulating_points).toBe(0);
    expect(res.today_transactions).toBe(0);
  });
});
