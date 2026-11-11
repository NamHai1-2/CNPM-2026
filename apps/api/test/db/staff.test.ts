import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T04 acceptance criteria (staff part).

let db: TestDatabase;
let sql: Sql;
let app: Hono<AppEnv>;
let a: Tenant;
let b: Tenant;
let counter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  app = createTestApp(sql);
  ({ a, b } = await createTwoMerchants(sql, app));
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

function staffBody(overrides: Json = {}): Json {
  counter += 1;
  return {
    full_name: `Cashier ${counter}`,
    email: `cashier${counter}@example.com`,
    initial_password: TEST_PASSWORD,
    ...overrides,
  };
}

const createStaffAs = (tenant: Tenant, body: unknown) =>
  call('POST', '/api/v1/merchant/staff', { cookie: tenant.cookie, body });

async function newStaff(tenant: Tenant): Promise<{ id: string; email: string }> {
  const body = staffBody();
  const res = await createStaffAs(tenant, body);
  expect(res.status).toBe(201);
  const staff = (await res.json()) as { id: string; email: string };
  return { id: staff.id, email: staff.email };
}

describe('create staff', () => {
  it('creates a MERCHANT_STAFF user in the Owner\'s merchant who can log in', async () => {
    const body = staffBody();
    const res = await createStaffAs(a, body);
    expect(res.status).toBe(201);
    const view = (await res.json()) as Json;
    expect(view).toEqual({
      id: expect.any(String),
      full_name: body.full_name,
      email: body.email,
      is_active: true,
      created_at: expect.stringMatching(/Z$/),
    });

    const [row] = await sql`SELECT merchant_id, role, is_active, password_hash FROM users WHERE id = ${view.id as string}`;
    expect(String(row.merchant_id)).toBe(a.merchantId);
    expect(row.role).toBe('MERCHANT_STAFF');
    expect(String(row.password_hash).startsWith('$2')).toBe(true);

    const login = await call('POST', '/api/v1/auth/login', {
      body: { email: body.email, password: TEST_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { redirect: string }).redirect).toBe('/customers');
  });

  it('takes the merchant from the Owner\'s session, never from the request', async () => {
    const res = await createStaffAs(a, staffBody({ merchant_id: b.merchantId }));
    const view = (await res.json()) as { id: string };
    const [row] = await sql`SELECT merchant_id FROM users WHERE id = ${view.id}`;
    expect(String(row.merchant_id)).toBe(a.merchantId);
  });

  it('writes an audit row STAFF_CREATED', async () => {
    const res = await createStaffAs(a, staffBody());
    const view = (await res.json()) as { id: string };
    const rows = await sql`
      SELECT merchant_id, actor_user_id FROM audit_logs WHERE action = 'STAFF_CREATED' AND entity_id = ${view.id}`;
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.merchant_id)).toBe(a.merchantId);
    expect(String(rows[0]!.actor_user_id)).toBe(a.ownerId);
  });

  it('answers MSG31 for an email used anywhere, whatever its case (staff, Owner of another merchant)', async () => {
    const first = staffBody({ email: 'dup.staff@example.com' });
    expect((await createStaffAs(a, first)).status).toBe(201);
    for (const email of ['DUP.STAFF@example.com', b.email]) {
      const res = await createStaffAs(a, staffBody({ email }));
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('MSG31');
    }
    const other = await createStaffAs(b, staffBody({ email: 'dup.staff@example.com' }));
    expect(await codeOf(other)).toBe('MSG31'); // unique across merchants: login uses the email alone
  });

  it('answers MSG37 for a password that breaks the policy', async () => {
    for (const initial_password of ['short1', '12345678', 'abcdefgh']) {
      const res = await createStaffAs(a, staffBody({ initial_password }));
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG37');
    }
    const body = staffBody();
    expect(await codeOf(await createStaffAs(a, { ...body, initial_password: body.email }))).toBe('MSG37');
  });

  it('answers MSG01 for missing fields and MSG33 for malformed data', async () => {
    for (const field of ['full_name', 'email', 'initial_password']) {
      const missing = staffBody();
      delete missing[field];
      expect(await codeOf(await createStaffAs(a, missing))).toBe('MSG01');
    }
    expect(await codeOf(await createStaffAs(a, staffBody({ email: 'not-an-email' })))).toBe('MSG33');
    expect(await codeOf(await createStaffAs(a, staffBody({ full_name: 'x'.repeat(201) })))).toBe('MSG33');
    expect(await codeOf(await createStaffAs(a, '{not json'))).toBe('MSG33');
  });
});

describe('list staff', () => {
  it('lists only the staff of the Owner\'s merchant (not the Owner, not other merchants)', async () => {
    const mine = await newStaff(a);
    const theirs = await newStaff(b);
    const res = await call('GET', '/api/v1/merchant/staff', { cookie: a.cookie });
    expect(res.status).toBe(200);
    const page = (await res.json()) as { items: { id: string; email: string }[]; page: number; page_size: number; total: number };
    const ids = page.items.map((s) => s.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    expect(page.items.some((s) => s.email === a.email)).toBe(false); // the Owner is not listed
    expect(page.page_size).toBe(20);
    expect(page.total).toBe(page.items.length);
  });

  it('paginates 20 per page and rejects a bad page with MSG33', async () => {
    for (let i = 0; i < 21; i += 1) {
      await sql`
        INSERT INTO users (merchant_id, email, password_hash, full_name, role)
        VALUES (${b.merchantId}, ${'bulk' + i + '@example.com'}, 'hash', ${'Bulk ' + i}, 'MERCHANT_STAFF')`;
    }
    const first = (await (await call('GET', '/api/v1/merchant/staff', { cookie: b.cookie })).json()) as { items: unknown[]; total: number };
    expect(first.items).toHaveLength(20);
    expect(first.total).toBeGreaterThanOrEqual(21);
    const second = (await (await call('GET', '/api/v1/merchant/staff?page=2', { cookie: b.cookie })).json()) as { items: unknown[] };
    expect(second.items.length).toBeGreaterThan(0);
    for (const page of ['0', '-1', 'abc']) {
      const res = await call('GET', `/api/v1/merchant/staff?page=${page}`, { cookie: b.cookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });
});

describe('deactivate staff', () => {
  it('stops the account: no login, the session ends at once, an audit row is written', async () => {
    const staff = await newStaff(a);
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    expect((await call('GET', '/api/v1/auth/me', { cookie: staffCookie })).status).toBe(200);

    const res = await call('POST', `/api/v1/merchant/staff/${staff.id}/deactivate`, { cookie: a.cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { is_active: boolean }).is_active).toBe(false);

    const me = await call('GET', '/api/v1/auth/me', { cookie: staffCookie });
    expect(me.status).toBe(401);
    expect(await codeOf(me)).toBe('MSG35');
    const login = await call('POST', '/api/v1/auth/login', { body: { email: staff.email, password: TEST_PASSWORD } });
    expect(login.status).toBe(401);
    expect(await codeOf(login)).toBe('MSG02');

    const audit = await sql`SELECT 1 FROM audit_logs WHERE action = 'STAFF_DEACTIVATED' AND entity_id = ${staff.id}`;
    expect(audit).toHaveLength(1);
  });

  it('is repeatable without a second audit row, and the row is never deleted', async () => {
    const staff = await newStaff(a);
    await call('POST', `/api/v1/merchant/staff/${staff.id}/deactivate`, { cookie: a.cookie });
    const again = await call('POST', `/api/v1/merchant/staff/${staff.id}/deactivate`, { cookie: a.cookie });
    expect(again.status).toBe(200);
    expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'STAFF_DEACTIVATED' AND entity_id = ${staff.id}`).toHaveLength(1);
    expect(await sql`SELECT 1 FROM users WHERE id = ${staff.id}`).toHaveLength(1);
  });

  it('refuses staff of another merchant, the Owner, and unknown or malformed ids (MSG33)', async () => {
    const theirs = await newStaff(b);
    for (const id of [theirs.id, a.ownerId, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await call('POST', `/api/v1/merchant/staff/${id}/deactivate`, { cookie: a.cookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    const [row] = await sql`SELECT is_active FROM users WHERE id = ${theirs.id}`;
    expect(row.is_active).toBe(true);
    const [owner] = await sql`SELECT is_active FROM users WHERE id = ${a.ownerId}`;
    expect(owner.is_active).toBe(true);
  });
});

describe('access control', () => {
  it('refuses staff (MSG04), anonymous users (MSG35) and Admins without a merchant (MSG04)', async () => {
    const staff = await newStaff(a);
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    for (const cookie of [staffCookie, adminCookie]) {
      for (const [method, path, body] of [
        ['GET', '/api/v1/merchant/staff', undefined],
        ['POST', '/api/v1/merchant/staff', staffBody()],
        ['POST', `/api/v1/merchant/staff/${staff.id}/deactivate`, undefined],
      ] as const) {
        const res = await call(method, path, { cookie, body });
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('MSG04');
      }
    }
    const anonymous = await call('GET', '/api/v1/merchant/staff');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');
    const [row] = await sql`SELECT is_active FROM users WHERE id = ${staff.id}`;
    expect(row.is_active).toBe(true);
  });

  it('needs the X-Requested-With header (MSG04)', async () => {
    const res = await call('POST', '/api/v1/merchant/staff', { cookie: a.cookie, body: staffBody(), csrf: false });
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('MSG04');
  });
});
