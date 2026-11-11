import type { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { adminDashboard, merchantDashboard } from '../../src/services/dashboard.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertIssue, insertRedeem, insertReversal, nextTxCode, seedMerchant } from '../helpers/seed.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T10 acceptance criteria: the dashboard numbers equal the queries of db-schema.md section 6 on seeded data,
// including reversals; "today" uses UTC+7 around midnight.

type Json = Record<string, unknown>;

const PROOF_HASH = 'a'.repeat(64);

async function get(app: Hono<AppEnv>, path: string, opts: { cookie?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = opts.cookie ? portalHeaders(opts.cookie) : { 'X-Requested-With': 'octapoint-portal' };
  return await app.request(path, { method: 'GET', headers });
}

const codeOf = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;

async function addCustomer(
  sql: Sql,
  merchantId: string,
  code: string,
  balance: number,
  isActive = true,
): Promise<string> {
  const [row] = await sql`
    INSERT INTO customers (merchant_id, customer_code, name, balance, is_active)
    VALUES (${merchantId}, ${code}, ${'Customer ' + code}, ${balance}, ${isActive}) RETURNING id`;
  return String(row.id);
}

interface TxOptions {
  merchantId: string;
  customerId: string;
  userId: string;
  type: 'ISSUE' | 'REDEEM';
  points?: number;
  createdAt?: Date;
  status?: 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';
}

/** Inserts a transaction with an explicit created_at, so that the tests control which day it falls on. */
async function addTx(sql: Sql, o: TxOptions): Promise<string> {
  const points = o.points ?? 1;
  const status = o.status ?? 'PENDING_ANCHOR';
  const digest = status === 'ANCHORED' ? 'DIGEST' : null;
  const createdAt = o.createdAt ?? new Date();
  const [row] =
    o.type === 'ISSUE'
      ? await sql`
          INSERT INTO transactions (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after,
                                    performed_by_user_id, proof_hash, status, sui_digest, created_at)
          VALUES (${nextTxCode()}, ${o.merchantId}, ${o.customerId}, 'ISSUE', ${points}, ${points * 10000}, 10000, ${points},
                  ${o.userId}, ${PROOF_HASH}, ${status}, ${digest}, ${createdAt}) RETURNING id`
      : await sql`
          INSERT INTO transactions (code, merchant_id, customer_id, type, points, balance_after,
                                    performed_by_user_id, proof_hash, status, sui_digest, created_at)
          VALUES (${nextTxCode()}, ${o.merchantId}, ${o.customerId}, 'REDEEM', ${points}, 0,
                  ${o.userId}, ${PROOF_HASH}, ${status}, ${digest}, ${createdAt}) RETURNING id`;
  return String(row.id);
}

/** The instant at which "today" starts: 00:00 in Asia/Ho_Chi_Minh (UTC+7), the same expression as db-schema.md section 6. */
async function startOfToday(sql: Sql): Promise<Date> {
  const [row] = await sql`SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh') AS start`;
  return row.start as Date;
}

describe('admin dashboard', () => {
  let db: TestDatabase;
  let sql: Sql;
  let app: Hono<AppEnv>;
  let adminCookie: string;

  // The Admin numbers cover EVERY merchant, so each test gets its own empty database (the ledger forbids DELETE).
  beforeEach(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    app = createTestApp(sql);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    adminCookie = await loginCookie(app, admin.email, admin.password);
  });
  afterEach(async () => {
    await db.drop();
  });

  it('returns zeros on an empty database', async () => {
    const res = await get(app, '/api/v1/admin/dashboard', { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      merchants: { total: 0, pending: 0, active: 0, suspended: 0 },
      total_customers: 0,
      points_issued: 0,
      points_redeemed: 0,
    });
    expect(await adminDashboard(sql)).toEqual({
      merchants: { total: 0, pending: 0, active: 0, suspended: 0 },
      total_customers: 0,
      points_issued: 0,
      points_redeemed: 0,
    });
  });

  it('counts merchants by status and the customers of ALL merchants, whatever their status', async () => {
    const active = await seedMerchant(sql); // 1 customer (CUS001)
    const pending = await seedMerchant(sql);
    const suspended = await seedMerchant(sql);
    await sql`UPDATE merchants SET status = 'PENDING' WHERE id = ${pending.merchantId}`;
    await sql`UPDATE merchants SET status = 'SUSPENDED' WHERE id = ${suspended.merchantId}`;
    await addCustomer(sql, active.merchantId, 'CUS002', 5);
    await addCustomer(sql, active.merchantId, 'CUS003', 5, false); // an inactive customer still counts

    const res = await get(app, '/api/v1/admin/dashboard', { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.merchants).toEqual({ total: 3, pending: 1, active: 1, suspended: 1 });
    expect(body.total_customers).toBe(5); // 3 + 1 + 1, including the PENDING and SUSPENDED merchants
  });

  it('points issued = ISSUE minus REVERSAL of ISSUE; points redeemed = REDEEM minus REVERSAL of REDEEM', async () => {
    const a = await seedMerchant(sql);
    const b = await seedMerchant(sql);

    const issue100 = await insertIssue(sql, a, 100);
    await insertIssue(sql, a, 50);
    await insertIssue(sql, b, 70);
    const redeem30 = await insertRedeem(sql, a, 30);
    await insertRedeem(sql, b, 20);
    await insertReversal(sql, a, issue100, 100); // takes back an ISSUE: lowers the issued total only
    await insertReversal(sql, a, redeem30, 30); // takes back a REDEEM: lowers the redeemed total only

    // issued: 100 + 50 + 70 - 100 = 120; redeemed: 30 + 20 - 30 = 20
    const res = await get(app, '/api/v1/admin/dashboard', { cookie: adminCookie });
    const body = (await res.json()) as Json;
    expect(body.points_issued).toBe(120);
    expect(body.points_redeemed).toBe(20);
    expect(typeof body.points_issued).toBe('number');

    // the service gives the same numbers
    const view = await adminDashboard(sql);
    expect(view.points_issued).toBe(120);
    expect(view.points_redeemed).toBe(20);
  });

  it('matches the queries of db-schema.md section 6 run by hand', async () => {
    const a = await seedMerchant(sql);
    const issue = await insertIssue(sql, a, 40);
    await insertIssue(sql, a, 60);
    const redeem = await insertRedeem(sql, a, 25);
    await insertReversal(sql, a, issue, 40);
    await insertReversal(sql, a, redeem, 25);

    const [expected] = await sql`
      SELECT
        coalesce(sum(CASE WHEN t.type = 'ISSUE'  THEN t.points END), 0)
      - coalesce(sum(CASE WHEN t.type = 'REVERSAL' AND o.type = 'ISSUE'  THEN t.points END), 0) AS points_issued,
        coalesce(sum(CASE WHEN t.type = 'REDEEM' THEN t.points END), 0)
      - coalesce(sum(CASE WHEN t.type = 'REVERSAL' AND o.type = 'REDEEM' THEN t.points END), 0) AS points_redeemed
      FROM transactions t LEFT JOIN transactions o ON o.id = t.reverses_transaction_id`;
    const view = await adminDashboard(sql);
    expect(view.points_issued).toBe(Number(expected.points_issued));
    expect(view.points_redeemed).toBe(Number(expected.points_redeemed));
    expect(view.points_issued).toBe(60);
    expect(view.points_redeemed).toBe(0);
  });

  it('refuses a merchant Owner and staff (MSG04) and anonymous users (MSG35)', async () => {
    const { a } = await createTwoMerchants(sql, app);
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);

    for (const cookie of [a.cookie, staffCookie]) {
      const res = await get(app, '/api/v1/admin/dashboard', { cookie });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('MSG04');
    }
    const anonymous = await get(app, '/api/v1/admin/dashboard');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');
  });
});

describe('merchant dashboard', () => {
  let db: TestDatabase;
  let sql: Sql;
  let app: Hono<AppEnv>;

  beforeAll(async () => {
    db = await createTestDatabase();
    sql = db.sql;
    app = createTestApp(sql);
  });
  afterAll(async () => {
    await db.drop();
  });

  // Every number is per merchant, so one database is enough; each test uses a fresh pair of merchants.
  const tenants = () => createTwoMerchants(sql, app);
  const read = (tenant: Tenant) => get(app, '/api/v1/merchant/dashboard', { cookie: tenant.cookie });

  it('returns zeros for a merchant without customers or transactions', async () => {
    const { a } = await tenants();
    const res = await read(a);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total_customers: 0, circulating_points: 0, today_transactions: 0 });
  });

  it('counts the customers (active or not), sums their balances and counts today\'s transactions of every type and status', async () => {
    const { a } = await tenants();
    const c1 = await addCustomer(sql, a.merchantId, 'CUS001', 10);
    const c2 = await addCustomer(sql, a.merchantId, 'CUS002', 20);
    await addCustomer(sql, a.merchantId, 'CUS003', 30, false); // inactive: still counted, balance still circulates

    await addTx(sql, { merchantId: a.merchantId, customerId: c1, userId: a.ownerId, type: 'ISSUE', status: 'PENDING_ANCHOR' });
    const redeem = await addTx(sql, { merchantId: a.merchantId, customerId: c1, userId: a.ownerId, type: 'REDEEM', status: 'ANCHORED' });
    await addTx(sql, { merchantId: a.merchantId, customerId: c2, userId: a.ownerId, type: 'ISSUE', status: 'FAILED' });
    await insertReversal(sql, { merchantId: a.merchantId, ownerId: a.ownerId, customerId: c1 }, redeem, 1); // a REVERSAL counts too (same points as the REDEEM, BR-21)

    const res = await read(a);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body).toEqual({ total_customers: 3, circulating_points: 60, today_transactions: 4 });
    expect(typeof body.circulating_points).toBe('number');
    expect(await merchantDashboard(sql, a.merchantId)).toEqual(body);
  });

  it('counts a transaction made one millisecond before 00:00 UTC+7 as yesterday and one made AT 00:00 UTC+7 as today', async () => {
    const { a } = await tenants();
    const c = await addCustomer(sql, a.merchantId, 'CUS001', 0);
    const start = await startOfToday(sql);
    const base = { merchantId: a.merchantId, customerId: c, userId: a.ownerId, type: 'ISSUE' as const };

    // just before midnight UTC+7: yesterday
    await addTx(sql, { ...base, createdAt: new Date(start.getTime() - 1) });
    expect((await merchantDashboard(sql, a.merchantId)).today_transactions).toBe(0);
    // an earlier transaction of yesterday is not counted either
    await addTx(sql, { ...base, createdAt: new Date(start.getTime() - 7 * 3600_000) });
    expect((await merchantDashboard(sql, a.merchantId)).today_transactions).toBe(0);

    // exactly at midnight UTC+7: today
    await addTx(sql, { ...base, createdAt: start });
    expect((await merchantDashboard(sql, a.merchantId)).today_transactions).toBe(1);
    expect(((await (await read(a)).json()) as Json).today_transactions).toBe(1);
  });

  it('uses the date in UTC+7, not in UTC: the start of today is 17:00 UTC of the previous UTC day', async () => {
    const start = await startOfToday(sql);
    // 00:00 UTC+7 is 17:00 UTC, so the instant is always at 17:00:00.000 UTC
    expect(start.getUTCHours()).toBe(17);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);
  });

  it('shows each merchant only its own numbers', async () => {
    const { a, b } = await tenants();
    const ca = await addCustomer(sql, a.merchantId, 'CUS001', 15);
    const cb1 = await addCustomer(sql, b.merchantId, 'CUS001', 500); // the same code in another merchant is allowed
    await addCustomer(sql, b.merchantId, 'CUS002', 250);
    await addTx(sql, { merchantId: a.merchantId, customerId: ca, userId: a.ownerId, type: 'ISSUE' });
    await addTx(sql, { merchantId: b.merchantId, customerId: cb1, userId: b.ownerId, type: 'ISSUE' });
    await addTx(sql, { merchantId: b.merchantId, customerId: cb1, userId: b.ownerId, type: 'REDEEM' });

    expect(await (await read(a)).json()).toEqual({ total_customers: 1, circulating_points: 15, today_transactions: 1 });
    expect(await (await read(b)).json()).toEqual({ total_customers: 2, circulating_points: 750, today_transactions: 2 });
  });

  it('refuses staff and Admins (MSG04) and anonymous users (MSG35)', async () => {
    const { a } = await tenants();
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    for (const cookie of [staffCookie, adminCookie]) {
      const res = await get(app, '/api/v1/merchant/dashboard', { cookie });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('MSG04');
    }
    const anonymous = await get(app, '/api/v1/merchant/dashboard');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');
  });
});