import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { masterKeyFromConfig, decryptSecret } from '../../src/lib/crypto.js';
import { findApiKeyForAuth } from '../../src/services/apikeys.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp, testConfig } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T04 acceptance criteria (API key part).

let db: TestDatabase;
let sql: Sql;
let app: Hono<AppEnv>;
const config = testConfig();
const masterKey = masterKeyFromConfig(config);

beforeAll(async () => {
  db = await createTestDatabase();
  sql = db.sql;
  app = createTestApp(sql, config);
});
afterAll(async () => {
  await db.drop();
});

type Json = Record<string, unknown>;
type CreatedKey = { id: string; key_id: string; secret: string };

async function call(
  method: string,
  path: string,
  opts: { cookie?: string; csrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = opts.cookie
    ? portalHeaders(opts.cookie)
    : { 'X-Requested-With': 'octapoint-portal' };
  if (opts.csrf === false) delete headers['X-Requested-With'];
  return await app.request(path, { method, headers });
}

const codeOf = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;
const create = (tenant: Tenant) => call('POST', '/api/v1/merchant/api-keys', { cookie: tenant.cookie });

async function createKey(tenant: Tenant): Promise<CreatedKey> {
  const res = await create(tenant);
  expect(res.status).toBe(201);
  return (await res.json()) as CreatedKey;
}

/** A fresh pair of merchants for each test, so counts and statuses never leak between tests. */
const tenants = () => createTwoMerchants(sql, app);

describe('create a key', () => {
  it('returns id, key_id and secret once, and stores only the encrypted secret', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    expect(key.key_id).toMatch(/^oct_[0-9a-f]{32}$/);
    expect(key.secret).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url
    expect(Object.keys(key).sort()).toEqual(['id', 'key_id', 'secret']);

    const [row] = await sql`SELECT merchant_id, key_id, status, secret_encrypted, created_by FROM api_keys WHERE id = ${key.id}`;
    expect(String(row.merchant_id)).toBe(a.merchantId);
    expect(row.status).toBe('ACTIVE');
    expect(String(row.created_by)).toBe(a.ownerId);
    const stored = row.secret_encrypted as Buffer;
    expect(stored.includes(Buffer.from(key.secret))).toBe(false); // not plain text
    expect(decryptSecret(stored, masterKey)).toBe(key.secret); // but recoverable with the master key
  });

  it('gives every key a different id and secret', async () => {
    const { a } = await tenants();
    const first = await createKey(a);
    const second = await createKey(a);
    expect(first.key_id).not.toBe(second.key_id);
    expect(first.secret).not.toBe(second.secret);
  });

  it('writes an audit row that does not contain the secret', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    const rows = await sql`SELECT details, actor_user_id, merchant_id FROM audit_logs WHERE action = 'API_KEY_CREATED' AND entity_id = ${key.id}`;
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.merchant_id)).toBe(a.merchantId);
    const text = JSON.stringify(rows[0]!.details);
    expect(text).not.toContain(key.secret);
    expect(text).not.toContain(key.key_id);
  });

  it('refuses the 6th ACTIVE or SUSPENDED key with MSG40; revoked keys do not count', async () => {
    const { a } = await tenants();
    const keys: CreatedKey[] = [];
    for (let i = 0; i < 5; i += 1) keys.push(await createKey(a));
    const sixth = await create(a);
    expect(sixth.status).toBe(409);
    expect(await codeOf(sixth)).toBe('MSG40');

    await sql`UPDATE api_keys SET status = 'SUSPENDED' WHERE id = ${keys[0]!.id}`;
    expect((await create(a)).status).toBe(409); // SUSPENDED still counts

    await call('POST', `/api/v1/merchant/api-keys/${keys[1]!.id}/revoke`, { cookie: a.cookie });
    expect((await create(a)).status).toBe(201); // a revoked key frees a place
    expect((await create(a)).status).toBe(409);
  });

  it('keeps the limit under simultaneous requests: 7 at once give exactly 5 keys', async () => {
    const { a } = await tenants();
    const results = await Promise.all(Array.from({ length: 7 }, () => create(a)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 409, 409]);
    const [count] = await sql`SELECT count(*)::int AS n FROM api_keys WHERE merchant_id = ${a.merchantId}`;
    expect(count.n).toBe(5);
  });

  it('counts the keys of each merchant separately', async () => {
    const { a, b } = await tenants();
    for (let i = 0; i < 5; i += 1) await createKey(a);
    expect((await create(b)).status).toBe(201);
  });
});

describe('list keys', () => {
  it('shows masked ids and statuses of the own merchant only, never a secret or a full key id', async () => {
    const { a, b } = await tenants();
    const mine = await createKey(a);
    const theirs = await createKey(b);

    const res = await call('GET', '/api/v1/merchant/api-keys', { cookie: a.cookie });
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain(mine.secret);
    expect(text).not.toContain(mine.key_id);
    expect(text).not.toContain(theirs.key_id);

    const page = (await res.json()) as { items: Json[]; page: number; page_size: number; total: number };
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      id: mine.id,
      masked_key_id: `${mine.key_id.slice(0, 8)}...${mine.key_id.slice(-4)}`,
      status: 'ACTIVE',
      created_at: expect.stringMatching(/Z$/),
    });
    expect(page.items[0]!.masked_key_id).toMatch(/^oct_[0-9a-f]{4}\.\.\.[0-9a-f]{4}$/);
    expect(page).toMatchObject({ page: 1, page_size: 20, total: 1 });
  });

  it('rejects a bad page with MSG33', async () => {
    const { a } = await tenants();
    for (const page of ['0', 'x']) {
      const res = await call('GET', `/api/v1/merchant/api-keys?page=${page}`, { cookie: a.cookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });
});

describe('revoke a key', () => {
  it('revokes for good and writes an audit row', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    const res = await call('POST', `/api/v1/merchant/api-keys/${key.id}/revoke`, { cookie: a.cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('REVOKED');

    const [row] = await sql`SELECT status, revoked_at FROM api_keys WHERE id = ${key.id}`;
    expect(row.status).toBe('REVOKED');
    expect(row.revoked_at).not.toBeNull();
    expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'API_KEY_REVOKED' AND entity_id = ${key.id}`).toHaveLength(1);
  });

  it('is permanent: revoking again changes nothing and approving the merchant does not bring it back', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    await call('POST', `/api/v1/merchant/api-keys/${key.id}/revoke`, { cookie: a.cookie });
    const again = await call('POST', `/api/v1/merchant/api-keys/${key.id}/revoke`, { cookie: a.cookie });
    expect(again.status).toBe(200);
    expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'API_KEY_REVOKED' AND entity_id = ${key.id}`).toHaveLength(1);

    await sql`UPDATE merchants SET status = 'SUSPENDED' WHERE id = ${a.merchantId}`;
    await sql`UPDATE api_keys SET status = 'ACTIVE' WHERE merchant_id = ${a.merchantId} AND status = 'SUSPENDED'`; // what "approve" does
    const [row] = await sql`SELECT status FROM api_keys WHERE id = ${key.id}`;
    expect(row.status).toBe('REVOKED');
  });

  it('does not reveal or touch a key of another merchant (MSG33), nor an unknown or malformed id', async () => {
    const { a, b } = await tenants();
    const theirs = await createKey(b);
    for (const id of [theirs.id, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await call('POST', `/api/v1/merchant/api-keys/${id}/revoke`, { cookie: a.cookie });
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
    const [row] = await sql`SELECT status FROM api_keys WHERE id = ${theirs.id}`;
    expect(row.status).toBe('ACTIVE');
  });
});

describe('access control', () => {
  it('refuses staff and Admins (MSG04), anonymous users (MSG35) and a missing X-Requested-With header (MSG04)', async () => {
    const { a } = await tenants();
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);
    const key = await createKey(a);

    for (const cookie of [staffCookie, adminCookie]) {
      for (const [method, path] of [
        ['GET', '/api/v1/merchant/api-keys'],
        ['POST', '/api/v1/merchant/api-keys'],
        ['POST', `/api/v1/merchant/api-keys/${key.id}/revoke`],
      ] as const) {
        const res = await call(method, path, { cookie });
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('MSG04');
      }
    }
    const anonymous = await call('GET', '/api/v1/merchant/api-keys');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');
    const noHeader = await call('POST', '/api/v1/merchant/api-keys', { cookie: a.cookie, csrf: false });
    expect(noHeader.status).toBe(403);
    const [row] = await sql`SELECT status FROM api_keys WHERE id = ${key.id}`;
    expect(row.status).toBe('ACTIVE');
  });
});

describe('findApiKeyForAuth (used by the gateway, T09)', () => {
  it('returns the decrypted secret with the key status and the merchant status', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    const record = await findApiKeyForAuth(sql, key.key_id, masterKey);
    expect(record).toEqual({
      apiKeyId: key.id,
      merchantId: a.merchantId,
      keyId: key.key_id,
      status: 'ACTIVE',
      merchantStatus: 'ACTIVE',
      secret: key.secret,
    });
  });

  it('reflects SUSPENDED and REVOKED keys and a suspended merchant, and does not decide anything itself', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    await sql`UPDATE api_keys SET status = 'REVOKED' WHERE id = ${key.id}`;
    await sql`UPDATE merchants SET status = 'SUSPENDED' WHERE id = ${a.merchantId}`;
    const record = await findApiKeyForAuth(sql, key.key_id, masterKey);
    expect(record).toMatchObject({ status: 'REVOKED', merchantStatus: 'SUSPENDED', secret: key.secret });
  });

  it('returns null for an unknown key id', async () => {
    expect(await findApiKeyForAuth(sql, 'oct_does_not_exist', masterKey)).toBeNull();
  });

  it('fails loudly (does not return a wrong secret) when the master key is wrong', async () => {
    const { a } = await tenants();
    const key = await createKey(a);
    const wrong = Buffer.alloc(32, 1);
    await expect(findApiKeyForAuth(sql, key.key_id, wrong)).rejects.toThrow();
  });
});
