import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import { getLoyaltyRules } from '../../src/services/rules.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T06 acceptance criteria.

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
const save = (tenant: Tenant, body: unknown) => call('PUT', '/api/v1/merchant/rules', { cookie: tenant.cookie, body });
const read = (tenant: Tenant) => call('GET', '/api/v1/merchant/rules', { cookie: tenant.cookie });
const valid = { earn_ratio: 10000, min_redemption_threshold: 50 };

/** A fresh pair of merchants per test, so rules and audit rows never leak between tests. */
const tenants = () => createTwoMerchants(sql, app);

describe('read the rules', () => {
  it('answers {} before the first save, and getLoyaltyRules returns null', async () => {
    const { a } = await tenants();
    const res = await read(a);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(await getLoyaltyRules(sql, a.merchantId)).toBeNull();
  });
});

describe('save the rules', () => {
  it('saves, answers the saved values and records who changed them', async () => {
    const { a } = await tenants();
    const res = await save(a, valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(valid);
    expect(await (await read(a)).json()).toEqual(valid);
    expect(await getLoyaltyRules(sql, a.merchantId)).toEqual({ earnRatio: 10000, minRedemptionThreshold: 50 });

    const [row] = await sql`SELECT updated_by FROM loyalty_rules WHERE merchant_id = ${a.merchantId}`;
    expect(String(row.updated_by)).toBe(a.ownerId);
  });

  it('replaces the values on the next save and keeps a single row', async () => {
    const { a } = await tenants();
    await save(a, valid);
    const next = { earn_ratio: 5000, min_redemption_threshold: 100 };
    expect((await save(a, next)).status).toBe(200);
    expect(await (await read(a)).json()).toEqual(next);
    expect(await sql`SELECT 1 FROM loyalty_rules WHERE merchant_id = ${a.merchantId}`).toHaveLength(1);
  });

  it('accepts the limits 1 and 1,000,000', async () => {
    const { a } = await tenants();
    for (const body of [
      { earn_ratio: 1, min_redemption_threshold: 1 },
      { earn_ratio: 1_000_000, min_redemption_threshold: 1_000_000 },
    ]) {
      expect((await save(a, body)).status).toBe(200);
      expect(await (await read(a)).json()).toEqual(body);
    }
  });

  it('answers MSG33 for 0, negative, above 1,000,000, decimal, text, null and missing values, and changes nothing', async () => {
    const { a } = await tenants();
    await save(a, valid);
    const bad: unknown[] = [0, -1, 1_000_001, 1.5, '10', null, true, [], {}];
    for (const field of ['earn_ratio', 'min_redemption_threshold']) {
      for (const value of bad) {
        const res = await save(a, { ...valid, [field]: value });
        expect(res.status).toBe(400);
        expect(await codeOf(res)).toBe('MSG33');
      }
      const missing: Json = { ...valid };
      delete missing[field];
      expect(await codeOf(await save(a, missing))).toBe('MSG33');
    }
    expect(await codeOf(await save(a, {}))).toBe('MSG33');
    expect(await codeOf(await save(a, '{not json'))).toBe('MSG33');
    expect(await (await read(a)).json()).toEqual(valid); // nothing changed
    expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'RULE_UPDATED' AND merchant_id = ${a.merchantId}`).toHaveLength(1);
  });

  it('ignores a merchant_id in the body: the merchant comes from the session', async () => {
    const { a, b } = await tenants();
    await save(a, { ...valid, merchant_id: b.merchantId });
    expect(await getLoyaltyRules(sql, b.merchantId)).toBeNull();
    expect(await getLoyaltyRules(sql, a.merchantId)).not.toBeNull();
  });
});

describe('audit', () => {
  const auditRows = (merchantId: string) =>
    sql`SELECT details, actor_user_id, entity_type, entity_id, created_at FROM audit_logs
        WHERE action = 'RULE_UPDATED' AND merchant_id = ${merchantId} ORDER BY created_at, id`;

  it('writes one row per save with the old values (null the first time) and the new ones', async () => {
    const { a } = await tenants();
    const second = { earn_ratio: 5000, min_redemption_threshold: 100 };
    await save(a, valid);
    await save(a, second);

    const rows = await auditRows(a.merchantId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.details).toEqual({ old: null, new: valid });
    expect(rows[1]!.details).toEqual({ old: valid, new: second });
    expect(String(rows[0]!.actor_user_id)).toBe(a.ownerId);
    expect(rows[0]!.entity_type).toBe('loyalty_rules');
    expect(String(rows[0]!.entity_id)).toBe(a.merchantId);
  });

  it('writes a row even when the values did not change', async () => {
    const { a } = await tenants();
    await save(a, valid);
    await save(a, valid);
    expect(await auditRows(a.merchantId)).toHaveLength(2);
  });
});

describe('simultaneous saves', () => {
  it('end with one row holding one of the two submitted values, and two audit rows', async () => {
    const { a } = await tenants();
    const x = { earn_ratio: 100, min_redemption_threshold: 10 };
    const y = { earn_ratio: 200, min_redemption_threshold: 20 };
    const results = await Promise.all([save(a, x), save(a, y)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);

    expect(await sql`SELECT 1 FROM loyalty_rules WHERE merchant_id = ${a.merchantId}`).toHaveLength(1);
    const final = (await (await read(a)).json()) as Json;
    expect([x, y]).toContainEqual(final);
    expect(await sql`SELECT 1 FROM audit_logs WHERE action = 'RULE_UPDATED' AND merchant_id = ${a.merchantId}`).toHaveLength(2);
  });
});

describe('access control and isolation', () => {
  it('refuses staff and Admins (MSG04), anonymous users (MSG35) and a missing X-Requested-With header (MSG04)', async () => {
    const { a } = await tenants();
    await save(a, valid);
    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    for (const cookie of [staffCookie, adminCookie]) {
      for (const method of ['GET', 'PUT']) {
        const res = await call(method, '/api/v1/merchant/rules', { cookie, body: method === 'PUT' ? valid : undefined });
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe('MSG04');
      }
    }
    const anonymous = await call('GET', '/api/v1/merchant/rules');
    expect(anonymous.status).toBe(401);
    expect(await codeOf(anonymous)).toBe('MSG35');

    const noHeader = await call('PUT', '/api/v1/merchant/rules', {
      cookie: a.cookie,
      csrf: false,
      body: { earn_ratio: 1, min_redemption_threshold: 1 },
    });
    expect(noHeader.status).toBe(403);
    expect(await (await read(a)).json()).toEqual(valid); // unchanged
  });

  it('keeps each merchant\'s rules separate', async () => {
    const { a, b } = await tenants();
    await save(a, valid);
    expect(await (await read(b)).json()).toEqual({});
    const other = { earn_ratio: 777, min_redemption_threshold: 7 };
    await save(b, other);
    expect(await (await read(a)).json()).toEqual(valid);
    expect(await (await read(b)).json()).toEqual(other);
    expect(await getLoyaltyRules(sql, a.merchantId)).toEqual({ earnRatio: 10000, minRedemptionThreshold: 50 });
  });
});
