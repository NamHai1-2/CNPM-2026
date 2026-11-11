import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction, type Sql } from '../../src/db/client.js';
import { findCustomer, getCustomerForUpdate, toCustomerView } from '../../src/services/customers.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T05 acceptance criteria.

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

async function call(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = opts.cookie
    ? portalHeaders(opts.cookie)
    : { 'X-Requested-With': 'octapoint-portal' };
  if (opts.csrf === false) delete headers['X-Requested-With'];
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  return await app.request(path, { method, headers, body });
}

const codeOf = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;
const tenants = () => createTwoMerchants(sql, app);
const create = (t: Tenant, body: unknown) => call('POST', '/api/v1/merchant/customers', { cookie: t.cookie, body });
const patch = (t: Tenant, code: string, body: unknown) =>
  call('PATCH', `/api/v1/merchant/customers/${code}`, { cookie: t.cookie, body });
const act = (t: Tenant, code: string, action: 'deactivate' | 'reactivate') =>
  call('POST', `/api/v1/merchant/customers/${code}/${action}`, { cookie: t.cookie });
const list = async (t: Tenant, query = '') =>
  (await (await call('GET', `/api/v1/merchant/customers${query}`, { cookie: t.cookie })).json()) as {
    items: Json[];
    page: number;
    page_size: number;
    total: number;
  };

async function staffCookieOf(t: Tenant): Promise<string> {
  const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: t.merchantId });
  return await loginCookie(app, staff.email, TEST_PASSWORD);
}

describe('create', () => {
  it('creates a customer with a balance of 0, with and without a phone', async () => {
    const { a } = await tenants();
    const withPhone = await create(a, { customer_code: 'CUS001', name: 'An Nguyen', phone: '0901234567' });
    expect(withPhone.status).toBe(201);
    expect(await withPhone.json()).toEqual({
      id: expect.any(String),
      customer_code: 'CUS001',
      name: 'An Nguyen',
      phone: '0901234567',
      balance: 0,
      is_active: true,
    });
    const without = await create(a, { customer_code: 'CUS002', name: 'Binh' });
    expect(without.status).toBe(201);
    expect(((await without.json()) as Json).phone).toBeNull();
  });

  it('takes the merchant from the session, never from the body', async () => {
    const { a, b } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An', merchant_id: b.merchantId });
    expect(await findCustomer(sql, b.merchantId, 'CUS001')).toBeNull();
    expect(await findCustomer(sql, a.merchantId, 'CUS001')).not.toBeNull();
  });

  it('answers MSG27 for a code that exists in the merchant, but allows the same code in another merchant', async () => {
    const { a, b } = await tenants();
    expect((await create(a, { customer_code: 'CUS001', name: 'An' })).status).toBe(201);
    const dup = await create(a, { customer_code: 'CUS001', name: 'Other' });
    expect(dup.status).toBe(409);
    expect(await codeOf(dup)).toBe('MSG27');
    expect((await create(b, { customer_code: 'CUS001', name: 'An' })).status).toBe(201);
  });

  it('answers MSG38 for a phone used in the same merchant, but allows it in another merchant', async () => {
    const { a, b } = await tenants();
    await create(a, { customer_code: 'P1', name: 'One', phone: '0901234567' });
    const dup = await create(a, { customer_code: 'P2', name: 'Two', phone: '0901234567' });
    expect(dup.status).toBe(409);
    expect(await codeOf(dup)).toBe('MSG38');
    expect((await create(b, { customer_code: 'P2', name: 'Two', phone: '0901234567' })).status).toBe(201);
  });

  it('lets several customers have no phone, and treats a blank phone as none', async () => {
    const { a } = await tenants();
    for (const [i, phone] of [undefined, null, '', '   '].entries()) {
      const res = await create(a, { customer_code: `NOPHONE${i}`, name: 'No phone', phone });
      expect(res.status).toBe(201);
      expect(((await res.json()) as Json).phone).toBeNull();
    }
  });

  it('rejects lowercase and malformed codes with MSG33 and does not change the code silently', async () => {
    const { a } = await tenants();
    for (const customer_code of ['cus001', 'Cus001', 'A B', 'A-B', 'X'.repeat(33)]) {
      const res = await create(a, { customer_code, name: 'Bad' });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    expect(await findCustomer(sql, a.merchantId, 'CUS001')).toBeNull();
    expect((await list(a)).total).toBe(0);
  });

  it('rejects a phone that is not 10 digits starting with 0 (MSG33)', async () => {
    const { a } = await tenants();
    for (const phone of ['12345', '1901234567', '090123456', '09012345678', '09a1234567', '+84901234567']) {
      const res = await create(a, { customer_code: 'PH1', name: 'Phone', phone });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });

  it('answers MSG01 for a missing or blank code or name, and MSG33 for a name that is too long or malformed JSON', async () => {
    const { a } = await tenants();
    expect(await codeOf(await create(a, { name: 'No code' }))).toBe('MSG01');
    expect(await codeOf(await create(a, { customer_code: 'C1' }))).toBe('MSG01');
    expect(await codeOf(await create(a, { customer_code: '  ', name: 'Blank' }))).toBe('MSG01');
    expect(await codeOf(await create(a, { customer_code: 'C1', name: '   ' }))).toBe('MSG01');
    expect(await codeOf(await create(a, { customer_code: 'C1', name: 'x'.repeat(201) }))).toBe('MSG33');
    expect(await codeOf(await create(a, '{not json'))).toBe('MSG33');
  });
});

describe('update', () => {
  it('changes the name and the phone but never the code', async () => {
    const { a } = await tenants();
    const created = (await (await create(a, { customer_code: 'CUS001', name: 'An', phone: '0901234567' })).json()) as { id: string };
    const res = await patch(a, 'CUS001', { name: 'An Nguyen', phone: '0907654321', customer_code: 'HACKED' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ customer_code: 'CUS001', name: 'An Nguyen', phone: '0907654321' });
    const [row] = await sql`SELECT customer_code FROM customers WHERE id = ${created.id}`;
    expect(row.customer_code).toBe('CUS001');
    expect(await findCustomer(sql, a.merchantId, 'HACKED')).toBeNull();
  });

  it('changes one field and leaves the other, and removes the phone with null or blank', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An', phone: '0901234567' });
    expect(await (await patch(a, 'CUS001', { name: 'An B' })).json()).toMatchObject({ name: 'An B', phone: '0901234567' });
    expect(await (await patch(a, 'CUS001', { phone: '0911111111' })).json()).toMatchObject({ name: 'An B', phone: '0911111111' });
    expect(((await (await patch(a, 'CUS001', { phone: null })).json()) as Json).phone).toBeNull();
    await patch(a, 'CUS001', { phone: '0922222222' });
    expect(((await (await patch(a, 'CUS001', { phone: '' })).json()) as Json).phone).toBeNull();
  });

  it('keeps the phone unique in the merchant (MSG38) but lets a customer keep its own phone', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'C1', name: 'One', phone: '0901234567' });
    await create(a, { customer_code: 'C2', name: 'Two', phone: '0907654321' });
    const dup = await patch(a, 'C2', { phone: '0901234567' });
    expect(dup.status).toBe(409);
    expect(await codeOf(dup)).toBe('MSG38');
    expect((await patch(a, 'C1', { phone: '0901234567', name: 'One again' })).status).toBe(200);
  });

  it('answers MSG33 for nothing to change, a bad phone or a blank name, and MSG22 for an unknown customer', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'C1', name: 'One' });
    for (const body of [{}, { phone: '123' }, { name: '   ' }, { name: 5 }, { phone: 5 }]) {
      const res = await patch(a, 'C1', body);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    const unknown = await patch(a, 'NOSUCH', { name: 'X' });
    expect(unknown.status).toBe(404);
    expect(await codeOf(unknown)).toBe('MSG22');
    expect(await codeOf(await patch(a, 'lowercase', { name: 'X' }))).toBe('MSG33');
  });

  it('does not see or change a customer of another merchant (MSG22)', async () => {
    const { a, b } = await tenants();
    await create(b, { customer_code: 'SECRET1', name: 'Theirs' });
    const res = await patch(a, 'SECRET1', { name: 'Hacked' });
    expect(res.status).toBe(404);
    expect(await codeOf(res)).toBe('MSG22');
    expect((await findCustomer(sql, b.merchantId, 'SECRET1'))!.name).toBe('Theirs');
  });
});

describe('list and search', () => {
  it('lists only the own customers, newest first', async () => {
    const { a, b } = await tenants();
    await create(a, { customer_code: 'A1', name: 'First' });
    await create(a, { customer_code: 'A2', name: 'Second' });
    await create(b, { customer_code: 'B1', name: 'Other merchant' });
    const page = await list(a);
    expect(page.items.map((c) => c.customer_code)).toEqual(['A2', 'A1']);
    expect(page).toMatchObject({ page: 1, page_size: 20, total: 2 });
    expect(page.items[0]).toEqual({
      id: expect.any(String),
      customer_code: 'A2',
      name: 'Second',
      phone: null,
      balance: 0,
      is_active: true,
    });
  });

  it('searches the code, the name and the phone, ignoring case, anywhere in the text', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'VIP100', name: 'Nguyen Van An', phone: '0901234567' });
    await create(a, { customer_code: 'REG200', name: 'Tran Thi Binh', phone: '0987654321' });
    const codes = async (q: string) => (await list(a, `?q=${encodeURIComponent(q)}`)).items.map((c) => c.customer_code);

    expect(await codes('vip')).toEqual(['VIP100']);
    expect(await codes('100')).toEqual(['VIP100']);
    expect(await codes('thi binh')).toEqual(['REG200']);
    expect(await codes('NGUYEN')).toEqual(['VIP100']);
    expect(await codes('0987')).toEqual(['REG200']);
    expect(await codes('nothing like this')).toEqual([]);
    expect((await codes('')).sort()).toEqual(['REG200', 'VIP100']);
  });

  it('matches % and _ literally and answers MSG33 for a search text that is too long', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'C1', name: '100% fan' });
    await create(a, { customer_code: 'C2', name: 'Plain name' });
    expect((await list(a, `?q=${encodeURIComponent('%')}`)).items.map((c) => c.customer_code)).toEqual(['C1']);
    expect((await list(a, `?q=${encodeURIComponent('_')}`)).items).toEqual([]);
    expect((await list(a, `?q=${encodeURIComponent('n_me')}`)).items).toEqual([]);
    const tooLong = await call('GET', `/api/v1/merchant/customers?q=${'x'.repeat(101)}`, { cookie: a.cookie });
    expect(tooLong.status).toBe(400);
    expect(await codeOf(tooLong)).toBe('MSG33');
  });

  it('paginates 20 per page and answers MSG33 for a bad page', async () => {
    const { a } = await tenants();
    for (let i = 0; i < 25; i += 1) {
      await sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${a.merchantId}, ${'BULK' + i}, ${'Bulk ' + i})`;
    }
    const first = await list(a);
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(25);
    const second = await list(a, '?page=2');
    expect(second.items).toHaveLength(5);
    expect(second.page).toBe(2);
    expect((await list(a, '?page=3')).items).toHaveLength(0);
    for (const page of ['0', '-1', 'abc']) {
      const res = await call('GET', `/api/v1/merchant/customers?page=${page}`, { cookie: a.cookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });
});

describe('deactivate and reactivate', () => {
  it('lets the Owner deactivate and reactivate; history, balance and code stay', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An' });
    await sql`UPDATE customers SET balance = 250 WHERE merchant_id = ${a.merchantId} AND customer_code = 'CUS001'`;

    const off = await act(a, 'CUS001', 'deactivate');
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ customer_code: 'CUS001', balance: 250, is_active: false });
    expect(await findCustomer(sql, a.merchantId, 'CUS001')).toMatchObject({ isActive: false, balance: 250 });

    const on = await act(a, 'CUS001', 'reactivate');
    expect(await on.json()).toMatchObject({ is_active: true, balance: 250 });
  });

  it('keeps the code reserved while the customer is inactive', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An' });
    await act(a, 'CUS001', 'deactivate');
    const res = await create(a, { customer_code: 'CUS001', name: 'New one' });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('MSG27');
  });

  it('writes one audit row per real change and none for a repeat', async () => {
    const { a } = await tenants();
    const created = (await (await create(a, { customer_code: 'CUS001', name: 'An' })).json()) as { id: string };
    await act(a, 'CUS001', 'deactivate');
    await act(a, 'CUS001', 'deactivate'); // repeat
    await act(a, 'CUS001', 'reactivate');
    await act(a, 'CUS001', 'reactivate'); // repeat
    const rows = await sql`
      SELECT action, actor_user_id, merchant_id, entity_type FROM audit_logs
      WHERE entity_id = ${created.id} ORDER BY created_at, id`;
    expect(rows.map((r) => r.action)).toEqual(['CUSTOMER_DEACTIVATED', 'CUSTOMER_REACTIVATED']);
    expect(String(rows[0]!.actor_user_id)).toBe(a.ownerId);
    expect(String(rows[0]!.merchant_id)).toBe(a.merchantId);
    expect(rows[0]!.entity_type).toBe('customer');
  });

  it('refuses staff (MSG04) and does not change the customer', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An' });
    const staffCookie = await staffCookieOf(a);
    for (const action of ['deactivate', 'reactivate']) {
      const res = await call('POST', `/api/v1/merchant/customers/CUS001/${action}`, { cookie: staffCookie });
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('MSG04');
    }
    expect((await findCustomer(sql, a.merchantId, 'CUS001'))!.isActive).toBe(true);
  });

  it('answers MSG22 for an unknown customer and for one of another merchant, MSG33 for a malformed code', async () => {
    const { a, b } = await tenants();
    await create(b, { customer_code: 'THEIRS', name: 'Theirs' });
    for (const code of ['NOSUCH', 'THEIRS']) {
      const res = await act(a, code, 'deactivate');
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('MSG22');
    }
    expect((await findCustomer(sql, b.merchantId, 'THEIRS'))!.isActive).toBe(true);
    expect(await codeOf(await act(a, 'lower', 'deactivate'))).toBe('MSG33');
  });
});

describe('access control', () => {
  it('lets staff list, create and edit', async () => {
    const { a } = await tenants();
    const staffCookie = await staffCookieOf(a);
    const created = await call('POST', '/api/v1/merchant/customers', {
      cookie: staffCookie,
      body: { customer_code: 'BYSTAFF', name: 'Created by staff' },
    });
    expect(created.status).toBe(201);
    expect((await call('GET', '/api/v1/merchant/customers', { cookie: staffCookie })).status).toBe(200);
    const edited = await call('PATCH', '/api/v1/merchant/customers/BYSTAFF', {
      cookie: staffCookie,
      body: { name: 'Edited' },
    });
    expect(edited.status).toBe(200);
  });

  it('refuses Admins (MSG04), anonymous users (MSG35) and a missing X-Requested-With header (MSG04)', async () => {
    const { a } = await tenants();
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);
    const adminRes = await call('GET', '/api/v1/merchant/customers', { cookie: adminCookie });
    expect(adminRes.status).toBe(403);
    expect(await codeOf(adminRes)).toBe('MSG04');

    const anonymous = await call('GET', '/api/v1/merchant/customers');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');

    const noHeader = await call('POST', '/api/v1/merchant/customers', {
      cookie: a.cookie,
      csrf: false,
      body: { customer_code: 'X1', name: 'No header' },
    });
    expect(noHeader.status).toBe(403);
    expect(await findCustomer(sql, a.merchantId, 'X1')).toBeNull();
  });
});

describe('getCustomerForUpdate, findCustomer and toCustomerView (used by T07a and T08)', () => {
  it('return the customer of the merchant, null for another merchant or an unknown code, and include inactive customers', async () => {
    const { a, b } = await tenants();
    await create(a, { customer_code: 'CUS001', name: 'An' });
    await act(a, 'CUS001', 'deactivate');

    expect(await findCustomer(sql, a.merchantId, 'CUS001')).toMatchObject({ customerCode: 'CUS001', isActive: false, balance: 0 });
    expect(await findCustomer(sql, b.merchantId, 'CUS001')).toBeNull();
    expect(await findCustomer(sql, a.merchantId, 'NOSUCH')).toBeNull();
    const locked = await withTransaction(sql, (tx) => getCustomerForUpdate(tx, a.merchantId, 'CUS001'));
    expect(locked).toMatchObject({ customerCode: 'CUS001', merchantId: a.merchantId, isActive: false });
    expect(await withTransaction(sql, (tx) => getCustomerForUpdate(tx, b.merchantId, 'CUS001'))).toBeNull();

    expect(toCustomerView(locked!)).toEqual({
      id: locked!.id,
      customer_code: 'CUS001',
      name: 'An',
      phone: null,
      balance: 0,
      is_active: false,
    });
  });

  it('getCustomerForUpdate makes a second transaction wait until the first one ends', async () => {
    const { a } = await tenants();
    await create(a, { customer_code: 'LOCK1', name: 'Lock me' });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding!: () => void;
    const holdingStarted = new Promise<void>((resolve) => {
      holding = resolve;
    });

    const holder = withTransaction(sql, async (tx) => {
      await getCustomerForUpdate(tx, a.merchantId, 'LOCK1');
      holding();
      await gate;
    });
    await holdingStarted;

    let secondFinished = false;
    const second = withTransaction(sql, async (tx) => {
      await getCustomerForUpdate(tx, a.merchantId, 'LOCK1');
      secondFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(secondFinished).toBe(false); // still waiting for the lock

    release();
    await holder;
    await second;
    expect(secondFinished).toBe(true);
  });
});
