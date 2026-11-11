import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { registerMerchant } from '../../src/services/merchants.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { createTwoMerchants } from '../helpers/tenant.js';

// Task T03 acceptance criteria: registration, Admin approve/suspend, tenant isolation.

let db: TestDatabase;
let sql: Sql;
let app: Hono<AppEnv>;
let adminCookie: string;
let emailCounter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  app = createTestApp(sql);
  const admin = await seedUser(sql, { role: 'ADMIN', email: 'admin@example.com' });
  adminCookie = await loginCookie(app, admin.email, admin.password);
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

function registration(overrides: Json = {}): Json {
  emailCounter += 1;
  return {
    business_name: `Shop ${emailCounter}`,
    owner_name: 'Owner Name',
    email: `shop${emailCounter}@example.com`,
    password: TEST_PASSWORD,
    ...overrides,
  };
}

const register = (body: unknown, csrf = true) => call('POST', '/api/v1/auth/register', { body, csrf });

async function registerOne(): Promise<{ email: string; merchantId: string }> {
  const body = registration();
  expect((await register(body)).status).toBe(201);
  const [row] = await sql`SELECT merchant_id FROM users WHERE email = ${body.email as string}`;
  return { email: body.email as string, merchantId: String(row.merchant_id) };
}

async function setStatus(merchantId: string, status: string): Promise<void> {
  await sql`UPDATE merchants SET status = ${status} WHERE id = ${merchantId}`;
}

describe('registration', () => {
  it('creates a PENDING merchant with an MCH- code and exactly one Owner', async () => {
    const body = registration({ email: 'First.Owner@Example.com' });
    const res = await register(body);
    expect(res.status).toBe(201);

    const merchants = await sql`SELECT id, code, name, status FROM merchants WHERE name = ${body.business_name as string}`;
    expect(merchants).toHaveLength(1);
    expect(merchants[0]!.status).toBe('PENDING');
    expect(merchants[0]!.code).toMatch(/^MCH-[A-Z0-9]{6}$/);

    const users = await sql`SELECT email, role, full_name, password_hash FROM users WHERE merchant_id = ${merchants[0]!.id}`;
    expect(users).toHaveLength(1);
    expect(users[0]!.role).toBe('MERCHANT_OWNER');
    expect(users[0]!.full_name).toBe('Owner Name');
    expect(users[0]!.password_hash).not.toBe(TEST_PASSWORD);
    expect(String(users[0]!.password_hash).startsWith('$2')).toBe(true);
  });

  it('keeps the Owner out until the Admin approves (MSG15), then lets them in', async () => {
    const { email, merchantId } = await registerOne();
    const before = await call('POST', '/api/v1/auth/login', { body: { email, password: TEST_PASSWORD } });
    expect(before.status).toBe(403);
    expect(await codeOf(before)).toBe('MSG15');

    expect((await call('POST', `/api/v1/admin/merchants/${merchantId}/approve`, { cookie: adminCookie })).status).toBe(200);
    const after = await call('POST', '/api/v1/auth/login', { body: { email, password: TEST_PASSWORD } });
    expect(after.status).toBe(200);
  });

  it('answers MSG31 for an email that is already registered, whatever its case, and leaves nothing behind', async () => {
    const first = registration({ email: 'taken@example.com' });
    expect((await register(first)).status).toBe(201);
    const second = registration({ email: 'TAKEN@Example.COM' });
    const res = await register(second);
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('MSG31');
    const orphan = await sql`SELECT 1 FROM merchants WHERE name = ${second.business_name as string}`;
    expect(orphan).toHaveLength(0);
  });

  it('answers MSG31 when the email belongs to an existing staff or Admin account', async () => {
    const res = await register(registration({ email: 'admin@example.com' }));
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe('MSG31');
  });

  it('checks the email before the password policy (SRS order)', async () => {
    const taken = registration({ email: 'order@example.com' });
    await register(taken);
    const res = await register(registration({ email: 'order@example.com', password: 'weak' }));
    expect(await codeOf(res)).toBe('MSG31');
  });

  it('answers MSG37 for a password that breaks the policy', async () => {
    for (const password of ['short1', '12345678', 'abcdefgh']) {
      const res = await register(registration({ password }));
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG37');
    }
    const body = registration();
    const sameAsEmail = await register({ ...body, password: body.email });
    expect(await codeOf(sameAsEmail)).toBe('MSG37');
  });

  it('answers MSG01 for missing or blank fields and MSG33 for malformed data', async () => {
    for (const field of ['business_name', 'owner_name', 'email', 'password']) {
      const missing = registration();
      delete missing[field];
      expect(await codeOf(await register(missing))).toBe('MSG01');
      expect(await codeOf(await register({ ...registration(), [field]: '' }))).toBe('MSG01');
      if (field !== 'password') {
        expect(await codeOf(await register({ ...registration(), [field]: '   ' }))).toBe('MSG01');
      }
    }
    expect(await codeOf(await register(registration({ email: 'not-an-email' })))).toBe('MSG33');
    expect(await codeOf(await register(registration({ business_name: 'x'.repeat(201) })))).toBe('MSG33');
    expect(await codeOf(await register('{not json'))).toBe('MSG33');
  });

  it('needs the X-Requested-With header (MSG04)', async () => {
    const res = await register(registration(), false);
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe('MSG04');
  });

  it('tries a new merchant code when the first one is taken', async () => {
    const existing = await registerOne();
    const [row] = await sql`SELECT code FROM merchants WHERE id = ${existing.merchantId}`;
    const taken = String(row.code);
    const codes = [taken, 'MCH-RETRY1'];
    const body = registration();
    await registerMerchant(
      sql,
      { businessName: body.business_name as string, ownerName: 'Owner', email: body.email as string, password: TEST_PASSWORD },
      { generateCode: () => codes.shift()! },
    );
    const created = await sql`SELECT code FROM merchants WHERE name = ${body.business_name as string}`;
    expect(created).toHaveLength(1);
    expect(created[0]!.code).toBe('MCH-RETRY1');
  });
});

describe('admin: list merchants', () => {
  it('lists newest first with the owner email, filters by status and paginates 20 per page', async () => {
    const { email, merchantId } = await registerOne();
    await setStatus(merchantId, 'SUSPENDED');

    const suspended = (await (await call('GET', '/api/v1/admin/merchants?status=SUSPENDED', { cookie: adminCookie })).json()) as {
      items: Json[];
      page: number;
      page_size: number;
      total: number;
    };
    expect(suspended.page).toBe(1);
    expect(suspended.page_size).toBe(20);
    const item = suspended.items.find((m) => m.id === merchantId)!;
    expect(item).toEqual({
      id: merchantId,
      code: expect.stringMatching(/^MCH-/),
      name: expect.any(String),
      owner_email: email,
      status: 'SUSPENDED',
      created_at: expect.stringMatching(/Z$/),
    });
    expect(suspended.items.every((m) => m.status === 'SUSPENDED')).toBe(true);

    for (let i = 0; i < 21; i += 1) await sql`INSERT INTO merchants (code, name) VALUES (${'MCH-LP' + String(i).padStart(4, '0')}, ${'List ' + i})`;
    const first = (await (await call('GET', '/api/v1/admin/merchants', { cookie: adminCookie })).json()) as { items: Json[]; total: number };
    expect(first.items).toHaveLength(20);
    const second = (await (await call('GET', '/api/v1/admin/merchants?page=2', { cookie: adminCookie })).json()) as { items: Json[]; page: number };
    expect(second.page).toBe(2);
    expect(second.items.length).toBeGreaterThan(0);
    const createdAt = first.items.map((m) => String(m.created_at));
    expect([...createdAt].sort().reverse()).toEqual(createdAt);
    const beyond = (await (await call('GET', '/api/v1/admin/merchants?page=999', { cookie: adminCookie })).json()) as { items: Json[] };
    expect(beyond.items).toHaveLength(0);
  });

  it('answers MSG33 for an unknown status or a bad page', async () => {
    for (const query of ['status=BANNED', 'page=0', 'page=-1', 'page=abc', 'page=1.5']) {
      const res = await call('GET', `/api/v1/admin/merchants?${query}`, { cookie: adminCookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });
});

describe('admin: approve and suspend', () => {
  async function merchantWithStatus(status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'): Promise<string> {
    const { merchantId } = await registerOne();
    await setStatus(merchantId, status);
    return merchantId;
  }
  const act = (id: string, action: 'approve' | 'suspend') =>
    call('POST', `/api/v1/admin/merchants/${id}/${action}`, { cookie: adminCookie });

  it('allows exactly the transitions of SRS 3.2.1.2', async () => {
    const table: [string, 'approve' | 'suspend', number, string][] = [
      ['PENDING', 'approve', 200, 'ACTIVE'],
      ['SUSPENDED', 'approve', 200, 'ACTIVE'],
      ['ACTIVE', 'approve', 400, 'ACTIVE'],
      ['ACTIVE', 'suspend', 200, 'SUSPENDED'],
      ['PENDING', 'suspend', 400, 'PENDING'],
      ['SUSPENDED', 'suspend', 400, 'SUSPENDED'],
    ];
    for (const [from, action, httpStatus, expectedStatus] of table) {
      const id = await merchantWithStatus(from as 'PENDING' | 'ACTIVE' | 'SUSPENDED');
      const res = await act(id, action);
      expect(res.status).toBe(httpStatus);
      if (httpStatus === 200) {
        expect(((await res.json()) as Json).status).toBe(expectedStatus);
      } else {
        expect(await codeOf(res)).toBe('MSG33');
      }
      const [row] = await sql`SELECT status FROM merchants WHERE id = ${id}`;
      expect(row.status).toBe(expectedStatus);
    }
  });

  it('writes an audit row with the old and the new status', async () => {
    const id = await merchantWithStatus('PENDING');
    await act(id, 'approve');
    await act(id, 'suspend');
    const rows = await sql`SELECT action, actor_user_id, entity_id, details FROM audit_logs WHERE merchant_id = ${id} ORDER BY created_at, id`;
    expect(rows.map((r) => r.action)).toEqual(['MERCHANT_APPROVED', 'MERCHANT_SUSPENDED']);
    expect(rows[0]!.details).toEqual({ from: 'PENDING', to: 'ACTIVE' });
    expect(rows[1]!.details).toEqual({ from: 'ACTIVE', to: 'SUSPENDED' });
    expect(String(rows[0]!.entity_id)).toBe(id);
    expect(rows[0]!.actor_user_id).not.toBeNull();
  });

  it('suspend moves ACTIVE keys to SUSPENDED and approve moves SUSPENDED keys back; REVOKED never changes', async () => {
    const id = await merchantWithStatus('ACTIVE');
    const [owner] = await sql`SELECT id FROM users WHERE merchant_id = ${id}`;
    for (const [keyId, status] of [['oct_active', 'ACTIVE'], ['oct_suspended', 'SUSPENDED'], ['oct_revoked', 'REVOKED']] as const) {
      await sql`INSERT INTO api_keys (merchant_id, key_id, secret_encrypted, status, created_by)
                VALUES (${id}, ${keyId + id.slice(0, 8)}, ${Buffer.from('secret')}, ${status}, ${owner.id})`;
    }
    const keys = async () =>
      Object.fromEntries(
        (await sql`SELECT key_id, status FROM api_keys WHERE merchant_id = ${id}`).map((k) => [String(k.key_id).slice(0, -8), k.status]),
      );

    await act(id, 'suspend');
    expect(await keys()).toEqual({ oct_active: 'SUSPENDED', oct_suspended: 'SUSPENDED', oct_revoked: 'REVOKED' });
    await act(id, 'approve');
    expect(await keys()).toEqual({ oct_active: 'ACTIVE', oct_suspended: 'ACTIVE', oct_revoked: 'REVOKED' });
  });

  it('answers MSG33 for an unknown or malformed merchant id', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await act(id, 'approve');
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });

  it('lets only one of two simultaneous approvals succeed', async () => {
    const id = await merchantWithStatus('PENDING');
    const results = await Promise.all([act(id, 'approve'), act(id, 'approve')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const audit = await sql`SELECT 1 FROM audit_logs WHERE merchant_id = ${id} AND action = 'MERCHANT_APPROVED'`;
    expect(audit).toHaveLength(1);
  });

  it('ends the sessions of the merchant users when the merchant is suspended (BR-19)', async () => {
    const id = await merchantWithStatus('ACTIVE');
    const [owner] = await sql`SELECT email FROM users WHERE merchant_id = ${id}`;
    const cookie = await loginCookie(app, String(owner.email), TEST_PASSWORD);
    expect((await call('GET', '/api/v1/auth/me', { cookie })).status).toBe(200);
    await act(id, 'suspend');
    const res = await call('GET', '/api/v1/auth/me', { cookie });
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe('MSG35');
  });
});

describe('access control and tenant isolation', () => {
  it('refuses the Admin routes without a session (MSG35) and to merchant users (MSG04)', async () => {
    const { a } = await createTwoMerchants(sql, app);
    const anonymous = await call('GET', '/api/v1/admin/merchants');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');

    const owner = await call('GET', '/api/v1/admin/merchants', { cookie: a.cookie });
    expect(owner.status).toBe(403);
    expect(await codeOf(owner)).toBe('MSG04');
    const approve = await call('POST', `/api/v1/admin/merchants/${a.merchantId}/suspend`, { cookie: a.cookie });
    expect(approve.status).toBe(403);
    const [row] = await sql`SELECT status FROM merchants WHERE id = ${a.merchantId}`;
    expect(row.status).toBe('ACTIVE'); // an Owner cannot suspend even their own merchant
  });

  it('shows each merchant user only their own merchant', async () => {
    const { a, b } = await createTwoMerchants(sql, app);
    const meA = (await (await call('GET', '/api/v1/auth/me', { cookie: a.cookie })).json()) as { merchant: Json };
    const meB = (await (await call('GET', '/api/v1/auth/me', { cookie: b.cookie })).json()) as { merchant: Json };
    expect(meA.merchant.code).toBe(a.merchantCode);
    expect(meB.merchant.code).toBe(b.merchantCode);
    expect(meA.merchant.code).not.toBe(meB.merchant.code);
  });

  it('suspending merchant A does not affect merchant B', async () => {
    const { a, b } = await createTwoMerchants(sql, app);
    await call('POST', `/api/v1/admin/merchants/${a.merchantId}/suspend`, { cookie: adminCookie });
    expect((await call('GET', '/api/v1/auth/me', { cookie: a.cookie })).status).toBe(401);
    expect((await call('GET', '/api/v1/auth/me', { cookie: b.cookie })).status).toBe(200);
  });
});
