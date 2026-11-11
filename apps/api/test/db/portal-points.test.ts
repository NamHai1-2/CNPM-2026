import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { setRules } from '../helpers/points.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T07b acceptance criteria (HTTP level): the portal issue and redeem endpoints.

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

type Json = Record<string, unknown>;

async function post(
  path: string,
  opts: { cookie?: string; body?: unknown; key?: string | null; csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = opts.cookie
    ? portalHeaders(opts.cookie)
    : { 'X-Requested-With': 'octapoint-portal' };
  if (opts.csrf === false) delete headers['X-Requested-With'];
  if (opts.key !== null) headers['X-Idempotency-Key'] = opts.key ?? randomUUID();
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  return await app.request(path, { method: 'POST', headers, body });
}

const codeOf = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;
const issue = (t: Tenant, body: unknown, key?: string | null, code = 'CUS001') =>
  post(`/api/v1/merchant/customers/${code}/issue`, { cookie: t.cookie, body, key });
const redeem = (t: Tenant, body: unknown, key?: string | null, code = 'CUS001') =>
  post(`/api/v1/merchant/customers/${code}/redeem`, { cookie: t.cookie, body, key });

async function balanceOfCode(t: Tenant, code = 'CUS001'): Promise<number> {
  const [row] = await sql`SELECT balance FROM customers WHERE merchant_id = ${t.merchantId} AND customer_code = ${code}`;
  return Number(row.balance);
}
async function countTx(t: Tenant): Promise<number> {
  const [row] = await sql`SELECT count(*)::int AS n FROM transactions WHERE merchant_id = ${t.merchantId}`;
  return Number(row.n);
}

/** Customer CUS001 with the given balance, and rules (earn_ratio 10000, minimum 50) unless told otherwise. */
async function prepare(
  t: Tenant,
  opts: { balance?: number; active?: boolean; rules?: boolean; code?: string } = {},
): Promise<void> {
  await sql`
    INSERT INTO customers (merchant_id, customer_code, name, balance, is_active)
    VALUES (${t.merchantId}, ${opts.code ?? 'CUS001'}, 'Customer', ${opts.balance ?? 0}, ${opts.active ?? true})`;
  if (opts.rules !== false) await setRules(sql, t.merchantId, t.ownerId, 10000, 50);
}

const tenants = () => createTwoMerchants(sql, app);

describe('issue', () => {
  it('adds the points and answers the transaction of api-spec.md (PENDING_ANCHOR, no explorer link yet)', async () => {
    const { a } = await tenants();
    await prepare(a);
    const res = await issue(a, { amount: 150000 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      transaction_id: expect.stringMatching(/^TXN-[0-9]{8}-[A-Z0-9]{8}$/),
      type: 'ISSUE',
      customer_code: 'CUS001',
      points: 15,
      balance_after: 15,
      status: 'PENDING_ANCHOR',
      sui_digest: null,
      explorer_url: null,
      reverses_transaction_id: null,
      created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(await balanceOfCode(a)).toBe(15);

    const [row] = await sql`SELECT performed_by_user_id, performed_by_api_key_id, bill_amount, earn_ratio FROM transactions WHERE merchant_id = ${a.merchantId}`;
    expect(String(row.performed_by_user_id)).toBe(a.ownerId);
    expect(row.performed_by_api_key_id).toBeNull();
    expect(Number(row.bill_amount)).toBe(150000);
    expect(Number(row.earn_ratio)).toBe(10000);
  });

  it('takes the merchant from the session: another merchant\'s customer with the same code is untouched (MSG22)', async () => {
    const { a, b } = await tenants();
    await prepare(b, { balance: 7 }); // only B has CUS001
    const res = await issue(a, { amount: 100000 });
    expect(res.status).toBe(404);
    expect(await codeOf(res)).toBe('MSG22');
    expect(await balanceOfCode(b)).toBe(7);
    expect(await countTx(b)).toBe(0);
  });
});

describe('redeem', () => {
  it('spends the points and answers the transaction', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 100 });
    const res = await redeem(a, { points: 60 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ type: 'REDEEM', customer_code: 'CUS001', points: 60, balance_after: 40, status: 'PENDING_ANCHOR' });
    expect(await balanceOfCode(a)).toBe(40);
  });
});

describe('idempotency key', () => {
  it('answers the first response again and creates one transaction when the same request is repeated', async () => {
    const { a } = await tenants();
    await prepare(a);
    const key = randomUUID();
    const first = await issue(a, { amount: 100000 }, key);
    const second = await issue(a, { amount: 100000 }, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(await countTx(a)).toBe(1);
    expect(await balanceOfCode(a)).toBe(10);
  });

  it('answers MSG34 for the same key with another body, another customer, another operation or other bytes', async () => {
    const { a } = await tenants();
    await prepare(a);
    await prepare(a, { code: 'CUS002', balance: 100 });
    const key = randomUUID();
    expect((await issue(a, { amount: 100000 }, key)).status).toBe(201);

    for (const res of [
      await issue(a, { amount: 200000 }, key), // other amount
      await issue(a, { amount: 100000 }, key, 'CUS002'), // other customer (other path)
      await redeem(a, { points: 50 }, key), // other operation (other path)
      await issue(a, '{"amount": 100000}', key), // same value, other bytes
    ]) {
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('MSG34');
    }
    expect(await countTx(a)).toBe(1);
  });

  it('answers MSG33 when the key is missing, blank or longer than 128 characters, and does nothing', async () => {
    const { a } = await tenants();
    await prepare(a);
    for (const key of [null, '', '   ', 'x'.repeat(129)]) {
      const res = await issue(a, { amount: 100000 }, key);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    expect(await countTx(a)).toBe(0);
  });

  it('is not used up by a failed request: after the cause is fixed, the same key works', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 10 });
    const key = randomUUID();
    const failed = await redeem(a, { points: 60 }, key);
    expect(failed.status).toBe(422);
    expect(await codeOf(failed)).toBe('MSG08');

    await sql`UPDATE customers SET balance = 100 WHERE merchant_id = ${a.merchantId}`;
    const retry = await redeem(a, { points: 60 }, key);
    expect(retry.status).toBe(201);
    expect(await balanceOfCode(a)).toBe(40);
  });

  it('is kept apart for each user: the Owner and a staff member can use the same key', async () => {
    const { a } = await tenants();
    await prepare(a);
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const key = randomUUID();

    expect((await issue(a, { amount: 100000 }, key)).status).toBe(201);
    const byStaff = await post('/api/v1/merchant/customers/CUS001/issue', { cookie: staffCookie, body: { amount: 100000 }, key });
    expect(byStaff.status).toBe(201);
    expect(await countTx(a)).toBe(2);
    const [row] = await sql`SELECT performed_by_user_id FROM transactions WHERE merchant_id = ${a.merchantId} ORDER BY created_at DESC, id DESC LIMIT 1`;
    expect(String(row.performed_by_user_id)).toBe(staff.id);
  });

  it('creates one transaction when four identical requests arrive at the same moment', async () => {
    const { a } = await tenants();
    await prepare(a);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => issue(a, { amount: 100000 }, key)));
    for (const res of results) expect(res.status).toBe(201);
    const bodies = await Promise.all(results.map((r) => r.json()));
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(await countTx(a)).toBe(1);
    expect(await balanceOfCode(a)).toBe(10);
  });
});

describe('answers to wrong data', () => {
  it('answers MSG33 for an amount or a number of points that is not an integer within the ceilings, and for malformed JSON', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 1000 });
    for (const body of [{}, { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: '100000' }, { amount: null }, { amount: true }, { amount: 1_000_000_001 }, [], '{not json']) {
      const res = await issue(a, body);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    for (const body of [{}, { points: 0 }, { points: -5 }, { points: 50.5 }, { points: '50' }, { points: 1_000_001 }, { amount: 50 }]) {
      const res = await redeem(a, body);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    expect(await countTx(a)).toBe(0);
    expect(await balanceOfCode(a)).toBe(1000);
  });

  it('answers MSG33 for a customer code that is lowercase or malformed', async () => {
    const { a } = await tenants();
    await prepare(a);
    for (const code of ['cus001', 'CUS-001']) {
      const res = await issue(a, { amount: 100000 }, undefined, code);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });

  it('answers the business errors with their messages and statuses, and changes nothing', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 80 });
    await prepare(a, { code: 'OFF', balance: 80, active: false });

    const cases: [Promise<Response>, number, string][] = [
      [issue(a, { amount: 100000 }, undefined, 'NOSUCH'), 404, 'MSG22'],
      [redeem(a, { points: 50 }, undefined, 'NOSUCH'), 404, 'MSG22'],
      [issue(a, { amount: 100000 }, undefined, 'OFF'), 422, 'MSG39'],
      [redeem(a, { points: 50 }, undefined, 'OFF'), 422, 'MSG39'],
      [issue(a, { amount: 9999 }), 422, 'MSG24'],
      [redeem(a, { points: 49 }), 422, 'MSG09'],
      [redeem(a, { points: 81 }), 422, 'MSG08'],
    ];
    for (const [pending, status, code] of cases) {
      const res = await pending;
      expect(res.status).toBe(status);
      expect(await codeOf(res)).toBe(code);
    }
    expect(await balanceOfCode(a)).toBe(80);
    expect(await countTx(a)).toBe(0);
  });

  it('puts the minimum in the MSG09 message', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 500 });
    const res = await redeem(a, { points: 10 });
    expect(((await res.json()) as Json).message).toContain('50');
  });

  it('answers MSG32 when the merchant has not saved its rules', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 100, rules: false });
    for (const res of [await issue(a, { amount: 100000 }), await redeem(a, { points: 50 })]) {
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('MSG32');
    }
  });
});

describe('access control', () => {
  it('lets staff issue and redeem', async () => {
    const { a } = await tenants();
    await prepare(a, { balance: 100 });
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    expect((await post('/api/v1/merchant/customers/CUS001/issue', { cookie: staffCookie, body: { amount: 100000 } })).status).toBe(201);
    expect((await post('/api/v1/merchant/customers/CUS001/redeem', { cookie: staffCookie, body: { points: 50 } })).status).toBe(201);
  });

  it('refuses Admins (MSG04), anonymous users (MSG35) and a missing X-Requested-With header (MSG04)', async () => {
    const { a } = await tenants();
    await prepare(a);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    const asAdmin = await post('/api/v1/merchant/customers/CUS001/issue', { cookie: adminCookie, body: { amount: 100000 } });
    expect(asAdmin.status).toBe(403);
    expect(await codeOf(asAdmin)).toBe('MSG04');
    const anonymous = await post('/api/v1/merchant/customers/CUS001/issue', { body: { amount: 100000 } });
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');
    const noHeader = await post('/api/v1/merchant/customers/CUS001/issue', { cookie: a.cookie, body: { amount: 100000 }, csrf: false });
    expect(noHeader.status).toBe(403);
    expect(await codeOf(noHeader)).toBe('MSG04');
    expect(await countTx(a)).toBe(0);
  });
});
