import { createHash } from 'node:crypto';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Sql } from '../../src/db/client.js';
import {
  requireCsrfHeader,
  requireMerchantId,
  requireRole,
  requireSession,
} from '../../src/middleware/auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp, testConfig } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

// Task T02 acceptance criteria: login, session, roles, change password.

let db: TestDatabase;
let sql: Sql;
let app: Hono<AppEnv>;
let merchantCounter = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  app = createTestApp(sql);
});
afterAll(async () => {
  await db.drop();
});

async function createMerchant(status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' = 'ACTIVE'): Promise<string> {
  merchantCounter += 1;
  const n = String(merchantCounter).padStart(6, '0');
  const [row] = await sql`
    INSERT INTO merchants (code, name, status) VALUES (${'MCH-' + n}, ${'Shop ' + n}, ${status}) RETURNING id`;
  return String(row.id);
}

/** A new merchant with one Owner who can log in. */
async function freshOwner(status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  const merchantId = await createMerchant(status);
  const user = await seedUser(sql, { role: 'MERCHANT_OWNER', merchantId });
  return { merchantId, ...user };
}

async function send(
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

const login = (email: string, password: string) =>
  send('POST', '/api/v1/auth/login', { body: { email, password } });

describe('login', () => {
  it('returns the redirect for each role and a safe session cookie', async () => {
    const merchantId = await createMerchant();
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const owner = await seedUser(sql, { role: 'MERCHANT_OWNER', merchantId });
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId });

    for (const [user, redirect, role] of [
      [admin, '/admin', 'ADMIN'],
      [owner, '/dashboard', 'MERCHANT_OWNER'],
      [staff, '/customers', 'MERCHANT_STAFF'],
    ] as const) {
      const res = await login(user.email, user.password);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { id: string; role: string; email: string }; redirect: string };
      expect(body.redirect).toBe(redirect);
      expect(body.user.role).toBe(role);
      expect(body.user.id).toBe(user.id);
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('octapoint_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=28800');
      expect(cookie).not.toContain('Secure'); // NODE_ENV is "test"
    }
  });

  it('sets the Secure flag in production', async () => {
    const prodApp = createTestApp(sql, testConfig({ NODE_ENV: 'production' }));
    const owner = await freshOwner();
    const res = await prodApp.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'octapoint-portal' },
      body: JSON.stringify({ email: owner.email, password: owner.password }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toContain('Secure');
  });

  it('stores only the hash of the token, never the cookie value', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    const token = cookie.split('=')[1]!;
    const rows = await sql`SELECT token_hash FROM sessions WHERE user_id = ${owner.id}`;
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    const expected = createHash('sha256').update(token).digest('hex');
    expect(rows.some((r) => r.token_hash === expected)).toBe(true);
  });

  it('gives the identical answer for a wrong password, an unknown email and an inactive user', async () => {
    const owner = await freshOwner();
    const inactive = await seedUser(sql, { role: 'ADMIN', isActive: false });

    const wrong = await login(owner.email, 'Wrong-pass1');
    const unknown = await login('nobody@example.com', 'Wrong-pass1');
    const off = await login(inactive.email, inactive.password); // right password, user inactive

    expect(wrong.status).toBe(401);
    const wrongBody = await wrong.json();
    expect((wrongBody as { code: string }).code).toBe('MSG02');
    expect(await unknown.json()).toEqual(wrongBody);
    expect(off.status).toBe(401);
    expect(await off.json()).toEqual(wrongBody);
  });

  it('finds the user whatever the case of the email', async () => {
    const owner = await freshOwner();
    const res = await login(owner.email.toUpperCase(), owner.password);
    expect(res.status).toBe(200);
  });

  it('answers MSG15 for a correct password when the merchant is PENDING or SUSPENDED', async () => {
    for (const status of ['PENDING', 'SUSPENDED'] as const) {
      const owner = await freshOwner(status);
      const res = await login(owner.email, owner.password);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe('MSG15');
    }
  });

  it('answers MSG02, not MSG15, when the password is wrong for a PENDING merchant', async () => {
    const owner = await freshOwner('PENDING');
    const res = await login(owner.email, 'Wrong-pass1');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('MSG02');
  });

  it('validates the body: MSG01 for missing fields, MSG33 for malformed JSON', async () => {
    const empty = await send('POST', '/api/v1/auth/login', { body: {} });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { code: string }).code).toBe('MSG01');
    const broken = await send('POST', '/api/v1/auth/login', { body: '{not json' });
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { code: string }).code).toBe('MSG33');
  });

  it('needs the X-Requested-With header (MSG04)', async () => {
    const owner = await freshOwner();
    const res = await send('POST', '/api/v1/auth/login', {
      body: { email: owner.email, password: owner.password },
      csrf: false,
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('MSG04');
  });
});

describe('session', () => {
  async function loggedIn() {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    return { owner, cookie };
  }
  async function expectEnded(cookie: string) {
    const res = await send('GET', '/api/v1/auth/me', { cookie });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('MSG35');
  }

  it('returns the user and the merchant on /me', async () => {
    const { owner, cookie } = await loggedIn();
    const res = await send('GET', '/api/v1/auth/me', { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: owner.id,
      full_name: 'Test User',
      email: owner.email,
      role: 'MERCHANT_OWNER',
      merchant: { code: expect.stringMatching(/^MCH-\d{6}$/), name: expect.any(String), status: 'ACTIVE' },
    });
  });

  it('returns merchant null for an Admin', async () => {
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const cookie = await loginCookie(app, admin.email, admin.password);
    const body = (await (await send('GET', '/api/v1/auth/me', { cookie })).json()) as { merchant: unknown; role: string };
    expect(body.role).toBe('ADMIN');
    expect(body.merchant).toBeNull();
  });

  it('refuses a request without a cookie or with an unknown token (MSG35)', async () => {
    await expectEnded('');
    await expectEnded('octapoint_session=not-a-real-token');
  });

  it('ends an expired session', async () => {
    const { owner, cookie } = await loggedIn();
    await sql`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = ${owner.id}`;
    await expectEnded(cookie);
  });

  it('ends a session when the user is logged out', async () => {
    const { cookie } = await loggedIn();
    const res = await send('POST', '/api/v1/auth/logout', { cookie });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
    await expectEnded(cookie);
  });

  it('refuses logout without the X-Requested-With header and keeps the session', async () => {
    const { cookie } = await loggedIn();
    const res = await send('POST', '/api/v1/auth/logout', { cookie, csrf: false });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('MSG04');
    expect((await send('GET', '/api/v1/auth/me', { cookie })).status).toBe(200);
  });

  it('ends the session when the user is deactivated', async () => {
    const { owner, cookie } = await loggedIn();
    await sql`UPDATE users SET is_active = false WHERE id = ${owner.id}`;
    await expectEnded(cookie);
  });

  it('ends the session when the merchant is suspended', async () => {
    const { owner, cookie } = await loggedIn();
    await sql`UPDATE merchants SET status = 'SUSPENDED' WHERE id = ${owner.merchantId}`;
    await expectEnded(cookie);
  });
});

describe('guards', () => {
  const config = testConfig();

  // Extra routes that use the guards, on top of the real routes and the test database.
  let guarded: Hono<AppEnv>;
  beforeAll(() => {
    guarded = createApp({
      checkDb: async () => {},
      routes: (a) => {
        registerRoutes(a, { sql, config });
        a.get('/test/admin-only', requireSession(sql), requireRole('ADMIN'), (c) => c.json({ ok: true }));
        a.get('/test/merchant-id', requireSession(sql), (c) => c.json({ merchant_id: requireMerchantId(c) }));
        a.post('/test/write', requireCsrfHeader(), (c) => c.json({ ok: true }));
      },
    });
  });

  it('requireRole lets the right role in and answers MSG04 to the others', async () => {
    const owner = await freshOwner();
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const ownerCookie = await loginCookie(guarded, owner.email, owner.password);
    const adminCookie = await loginCookie(guarded, admin.email, admin.password);

    const denied = await guarded.request('/test/admin-only', { headers: portalHeaders(ownerCookie) });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe('MSG04');

    const allowed = await guarded.request('/test/admin-only', { headers: portalHeaders(adminCookie) });
    expect(allowed.status).toBe(200);
  });

  it('requireMerchantId returns the merchant of the session and refuses an Admin', async () => {
    const owner = await freshOwner();
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const ownerCookie = await loginCookie(guarded, owner.email, owner.password);
    const adminCookie = await loginCookie(guarded, admin.email, admin.password);

    const ok = await guarded.request('/test/merchant-id', { headers: portalHeaders(ownerCookie) });
    expect(await ok.json()).toEqual({ merchant_id: owner.merchantId });

    const refused = await guarded.request('/test/merchant-id', { headers: portalHeaders(adminCookie) });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe('MSG04');
  });

  it('requireCsrfHeader blocks a POST without the header and lets a GET through', async () => {
    const blocked = await guarded.request('/test/write', { method: 'POST' });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code: string }).code).toBe('MSG04');
    const allowed = await guarded.request('/test/write', {
      method: 'POST',
      headers: { 'X-Requested-With': 'octapoint-portal' },
    });
    expect(allowed.status).toBe(200);
  });
});

describe('change password', () => {
  const NEW_PASSWORD = 'N3w-passw0rd!';

  async function change(cookie: string, current: string, next: string) {
    return send('POST', '/api/v1/auth/change-password', {
      cookie,
      body: { current_password: current, new_password: next },
    });
  }

  it('changes the password: old one stops working, new one works, an audit row is written', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);

    const res = await change(cookie, TEST_PASSWORD, NEW_PASSWORD);
    expect(res.status).toBe(200);

    expect((await login(owner.email, TEST_PASSWORD)).status).toBe(401);
    expect((await login(owner.email, NEW_PASSWORD)).status).toBe(200);

    const audit = await sql`
      SELECT merchant_id, actor_user_id, entity_id FROM audit_logs
      WHERE action = 'PASSWORD_CHANGED' AND actor_user_id = ${owner.id}`;
    expect(audit).toHaveLength(1);
    expect(String(audit[0]!.merchant_id)).toBe(owner.merchantId);
    expect(String(audit[0]!.entity_id)).toBe(owner.id);
  });

  it('ends the OTHER sessions of the user and keeps the current one', async () => {
    const owner = await freshOwner();
    const current = await loginCookie(app, owner.email, owner.password);
    const other = await loginCookie(app, owner.email, owner.password);

    expect((await change(current, TEST_PASSWORD, NEW_PASSWORD)).status).toBe(200);

    expect((await send('GET', '/api/v1/auth/me', { cookie: current })).status).toBe(200);
    const res = await send('GET', '/api/v1/auth/me', { cookie: other });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('MSG35');
  });

  it('answers MSG36 for a wrong current password', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    const res = await change(cookie, 'Not-the-one1', NEW_PASSWORD);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe('MSG36');
  });

  it('answers MSG37 for a password that breaks the policy or equals the current one', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    for (const weak of ['short1', '12345678', 'abcdefgh', owner.email, TEST_PASSWORD]) {
      const res = await change(cookie, TEST_PASSWORD, weak);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe('MSG37');
    }
  });

  it('checks the current password before the policy', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    const res = await change(cookie, 'Not-the-one1', 'weak');
    expect(((await res.json()) as { code: string }).code).toBe('MSG36');
  });

  it('needs a session (MSG35) and the X-Requested-With header (MSG04)', async () => {
    const owner = await freshOwner();
    const cookie = await loginCookie(app, owner.email, owner.password);
    const body = { current_password: TEST_PASSWORD, new_password: NEW_PASSWORD };

    const noSession = await send('POST', '/api/v1/auth/change-password', { body });
    expect(noSession.status).toBe(401);
    expect(((await noSession.json()) as { code: string }).code).toBe('MSG35');

    const noHeader = await send('POST', '/api/v1/auth/change-password', { cookie, csrf: false, body });
    expect(noHeader.status).toBe(403);
    expect(((await noHeader.json()) as { code: string }).code).toBe('MSG04');

    // nothing changed: the old password still works
    expect((await login(owner.email, TEST_PASSWORD)).status).toBe(200);
  });
});
