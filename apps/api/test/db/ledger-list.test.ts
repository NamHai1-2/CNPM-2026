import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db/client.js';
import type { AppEnv } from '../../src/types.js';
import { createTestApp } from '../helpers/app.js';
import { loginCookie, portalHeaders, seedUser, TEST_PASSWORD } from '../helpers/auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertApiKey } from '../helpers/points.js';
import { nextTxCode } from '../helpers/seed.js';
import { createTwoMerchants, type Tenant } from '../helpers/tenant.js';

// Task T08 acceptance criteria: the ledger list (UC-13). Reversals are tested in reversal.test.ts.

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
type Item = Json & { transaction_id: string; reversible: boolean; performed_by: { kind: string; label: string } };
type PageJson = { items: Item[]; page: number; page_size: number; total: number };

const codeOf = async (res: Response): Promise<string> => ((await res.json()) as Json).code as string;
const get = (path: string, cookie?: string) =>
  app.request(path, { headers: cookie ? portalHeaders(cookie) : { 'X-Requested-With': 'octapoint-portal' } });
const ledger = async (cookie: string, query = ''): Promise<PageJson> =>
  (await (await get(`/api/v1/merchant/ledger${query}`, cookie)).json()) as PageJson;
const adminLedger = async (cookie: string, query = ''): Promise<PageJson> =>
  (await (await get(`/api/v1/admin/ledger${query}`, cookie)).json()) as PageJson;

async function customerOf(t: Tenant, code = 'CUS001'): Promise<string> {
  const rows = await sql`SELECT id FROM customers WHERE merchant_id = ${t.merchantId} AND customer_code = ${code}`;
  if (rows[0]) return String(rows[0].id);
  const [row] = await sql`INSERT INTO customers (merchant_id, customer_code, name) VALUES (${t.merchantId}, ${code}, 'Customer') RETURNING id`;
  return String(row.id);
}

interface RowOptions {
  type?: 'ISSUE' | 'REDEEM' | 'REVERSAL';
  points?: number;
  createdAt?: string;
  status?: 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED';
  digest?: string;
  apiKeyId?: string;
  customerCode?: string;
  reversesId?: string;
}

/** Writes one ledger row directly (with a chosen time and status) so that the list can be tested without the points engine. */
async function insertRow(t: Tenant, opts: RowOptions = {}): Promise<{ id: string; code: string }> {
  const type = opts.type ?? 'ISSUE';
  const points = opts.points ?? 10;
  const code = nextTxCode();
  const customerId = await customerOf(t, opts.customerCode);
  const status = opts.status ?? 'PENDING_ANCHOR';
  const [row] = await sql`
    INSERT INTO transactions
      (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after, reverses_transaction_id,
       performed_by_user_id, performed_by_api_key_id, proof_hash, status, sui_digest, created_at)
    VALUES
      (${code}, ${t.merchantId}, ${customerId}, ${type}, ${points}, ${type === 'ISSUE' ? points * 10000 : null},
       ${type === 'ISSUE' ? 10000 : null}, ${points}, ${opts.reversesId ?? null},
       ${opts.apiKeyId ? null : t.ownerId}, ${opts.apiKeyId ?? null}, ${'a'.repeat(64)}, ${status},
       ${status === 'ANCHORED' ? (opts.digest ?? 'DIGEST') : null}, ${opts.createdAt ?? new Date().toISOString()})
    RETURNING id`;
  return { id: String(row.id), code };
}

const tenants = () => createTwoMerchants(sql, app);

describe('the list', () => {
  it('shows the fields of api-spec.md for an ISSUE and for a REDEEM', async () => {
    const { a } = await tenants();
    const issue = await insertRow(a, { type: 'ISSUE', points: 15, createdAt: '2026-11-01T03:15:42.123Z' });
    await insertRow(a, { type: 'REDEEM', points: 5, createdAt: '2026-11-01T04:00:00.000Z' });

    const page = await ledger(a.cookie);
    expect(page).toMatchObject({ page: 1, page_size: 20, total: 2 });
    const [redeem, issued] = page.items;
    expect(issued).toEqual({
      transaction_id: issue.code,
      type: 'ISSUE',
      customer_code: 'CUS001',
      points: 15,
      balance_after: 15,
      status: 'PENDING_ANCHOR',
      sui_digest: null,
      explorer_url: null,
      reverses_transaction_id: null,
      created_at: '2026-11-01T03:15:42.123Z',
      bill_amount: 150000,
      performed_by: { kind: 'USER', label: 'Test User' },
      reversible: true,
    });
    expect(redeem).toMatchObject({ type: 'REDEEM', points: 5, bill_amount: null, reversible: true });
    expect('merchant_code' in issued!).toBe(false); // only the Admin's list has it
  });

  it('lists newest first and orders rows with the same time by id, descending', async () => {
    const { a } = await tenants();
    const same = '2026-11-02T10:00:00.000Z';
    const older = await insertRow(a, { createdAt: '2026-11-01T10:00:00.000Z' });
    const x = await insertRow(a, { createdAt: same });
    const y = await insertRow(a, { createdAt: same });
    const newest = await insertRow(a, { createdAt: '2026-11-03T10:00:00.000Z' });

    const sameByIdDesc = [x, y].sort((p, q) => (p.id < q.id ? 1 : -1)).map((r) => r.code);
    const codes = (await ledger(a.cookie)).items.map((i) => i.transaction_id);
    expect(codes).toEqual([newest.code, ...sameByIdDesc, older.code]);
  });

  it('shows who did it: the user\'s name, or the masked id of the API key', async () => {
    const { a } = await tenants();
    const apiKeyId = await insertApiKey(sql, a.merchantId, a.ownerId);
    const [key] = await sql`SELECT key_id FROM api_keys WHERE id = ${apiKeyId}`;
    const keyId = String(key.key_id);
    await insertRow(a, { createdAt: '2026-11-01T01:00:00.000Z' });
    await insertRow(a, { createdAt: '2026-11-01T02:00:00.000Z', apiKeyId });

    const [byKey, byUser] = (await ledger(a.cookie)).items;
    expect(byUser!.performed_by).toEqual({ kind: 'USER', label: 'Test User' });
    expect(byKey!.performed_by).toEqual({ kind: 'API_KEY', label: `${keyId.slice(0, 8)}...${keyId.slice(-4)}` });
    expect(JSON.stringify(byKey)).not.toContain(keyId); // never the full key id
  });

  it('gives the digest and the explorer link only for ANCHORED rows', async () => {
    const { a } = await tenants();
    await insertRow(a, { status: 'PENDING_ANCHOR', createdAt: '2026-11-01T01:00:00.000Z' });
    await insertRow(a, { status: 'FAILED', createdAt: '2026-11-01T02:00:00.000Z' });
    await insertRow(a, { status: 'ANCHORED', digest: 'ABC123', createdAt: '2026-11-01T03:00:00.000Z' });

    const [anchored, failed, pending] = (await ledger(a.cookie)).items;
    expect(anchored).toMatchObject({ status: 'ANCHORED', sui_digest: 'ABC123', explorer_url: 'https://suiscan.xyz/testnet/tx/ABC123' });
    expect(failed).toMatchObject({ status: 'FAILED', sui_digest: null, explorer_url: null });
    expect(pending).toMatchObject({ status: 'PENDING_ANCHOR', sui_digest: null, explorer_url: null });
  });

  it('marks as reversible only an ISSUE or REDEEM that has no reversal (Owner), and never for staff', async () => {
    const { a } = await tenants();
    const issue = await insertRow(a, { type: 'ISSUE', createdAt: '2026-11-01T01:00:00.000Z' });
    const redeem = await insertRow(a, { type: 'REDEEM', createdAt: '2026-11-01T02:00:00.000Z' });
    const reversed = await insertRow(a, { type: 'ISSUE', createdAt: '2026-11-01T03:00:00.000Z' });
    const reversal = await insertRow(a, { type: 'REVERSAL', reversesId: reversed.id, points: 10, createdAt: '2026-11-01T04:00:00.000Z' });

    const byCode = (items: Item[]) => Object.fromEntries(items.map((i) => [i.transaction_id, i]));
    const owner = byCode((await ledger(a.cookie)).items);
    expect(owner[issue.code]!.reversible).toBe(true);
    expect(owner[redeem.code]!.reversible).toBe(true);
    expect(owner[reversed.code]!.reversible).toBe(false); // already reversed
    expect(owner[reversal.code]!.reversible).toBe(false); // a reversal cannot be reversed
    expect(owner[reversal.code]).toMatchObject({ type: 'REVERSAL', reverses_transaction_id: reversed.code });

    const staff = await seedUser(sql, { role: 'MERCHANT_STAFF', merchantId: a.merchantId });
    const staffCookie = await loginCookie(app, staff.email, TEST_PASSWORD);
    const seenByStaff = (await ledger(staffCookie)).items;
    expect(seenByStaff).toHaveLength(4);
    expect(seenByStaff.every((i) => i.reversible === false)).toBe(true);
  });
});

describe('filters', () => {
  it('filters by type, status and customer code, and combines them', async () => {
    const { a } = await tenants();
    await insertRow(a, { type: 'ISSUE', customerCode: 'CUS001', createdAt: '2026-11-01T01:00:00.000Z' });
    await insertRow(a, { type: 'REDEEM', customerCode: 'CUS001', status: 'ANCHORED', createdAt: '2026-11-01T02:00:00.000Z' });
    await insertRow(a, { type: 'ISSUE', customerCode: 'CUS002', status: 'FAILED', createdAt: '2026-11-01T03:00:00.000Z' });

    const count = async (query: string) => (await ledger(a.cookie, query)).total;
    expect(await count('')).toBe(3);
    expect(await count('?type=ISSUE')).toBe(2);
    expect(await count('?type=REDEEM')).toBe(1);
    expect(await count('?type=REVERSAL')).toBe(0);
    expect(await count('?status=ANCHORED')).toBe(1);
    expect(await count('?status=FAILED')).toBe(1);
    expect(await count('?customer_code=CUS001')).toBe(2);
    expect(await count('?customer_code=CUS002')).toBe(1);
    expect(await count('?customer_code=NOBODY')).toBe(0);
    expect(await count('?type=ISSUE&customer_code=CUS001')).toBe(1);
    expect(await count('?type=ISSUE&status=FAILED&customer_code=CUS002')).toBe(1);
  });

  it('reads dates as days in UTC+7, both ends included', async () => {
    const { a } = await tenants();
    const rows = {
      lastSecondOct31: await insertRow(a, { createdAt: '2026-10-31T16:59:59.000Z' }), // 23:59:59 on 31 Oct in UTC+7
      firstSecondNov1: await insertRow(a, { createdAt: '2026-10-31T17:00:00.000Z' }), // 00:00:00 on 1 Nov in UTC+7
      lastMomentNov1: await insertRow(a, { createdAt: '2026-11-01T16:59:59.999Z' }), // 23:59:59.999 on 1 Nov
      firstSecondNov2: await insertRow(a, { createdAt: '2026-11-01T17:00:00.000Z' }), // 00:00:00 on 2 Nov
    };
    const codes = async (query: string) => (await ledger(a.cookie, query)).items.map((i) => i.transaction_id).sort();
    const pick = (...names: (keyof typeof rows)[]) => names.map((n) => rows[n].code).sort();

    expect(await codes('?date_from=2026-11-01&date_to=2026-11-01')).toEqual(pick('firstSecondNov1', 'lastMomentNov1'));
    expect(await codes('?date_to=2026-10-31')).toEqual(pick('lastSecondOct31'));
    expect(await codes('?date_from=2026-11-02')).toEqual(pick('firstSecondNov2'));
    expect(await codes('?date_from=2026-10-31&date_to=2026-11-02')).toEqual(
      pick('lastSecondOct31', 'firstSecondNov1', 'lastMomentNov1', 'firstSecondNov2'),
    );
    expect(await codes('?date_from=2026-11-05&date_to=2026-11-01')).toEqual([]); // from after to: nothing, not an error
  });

  it('answers MSG33 for a wrong type, status, date, customer code or page', async () => {
    const { a } = await tenants();
    const bad = [
      '?type=SELL',
      '?type=issue',
      '?status=DONE',
      '?date_from=2026-13-01',
      '?date_from=2026-02-30',
      '?date_to=yesterday',
      '?date_from=2026-1-1',
      '?customer_code=cus001',
      '?customer_code=A%20B',
      '?page=0',
      '?page=abc',
    ];
    for (const query of bad) {
      const res = await get(`/api/v1/merchant/ledger${query}`, a.cookie);
      expect(res.status).toBe(400);
      expect(await codeOf(res)).toBe('MSG33');
    }
  });

  it('paginates 20 per page', async () => {
    const { a } = await tenants();
    for (let i = 0; i < 25; i += 1) {
      await insertRow(a, { createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString() });
    }
    const first = await ledger(a.cookie);
    const second = await ledger(a.cookie, '?page=2');
    const third = await ledger(a.cookie, '?page=3');
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(25);
    expect(second.items).toHaveLength(5);
    expect(third.items).toHaveLength(0);
    const all = [...first.items, ...second.items].map((i) => i.transaction_id);
    expect(new Set(all).size).toBe(25); // no row twice, none missing
  });
});

describe('merchants and the Admin', () => {
  it('shows a merchant only its own rows, even when the customer code is the same', async () => {
    const { a, b } = await tenants();
    const mine = await insertRow(a, { customerCode: 'SAME' });
    const theirs = await insertRow(b, { customerCode: 'SAME' });

    const seenByA = (await ledger(a.cookie)).items.map((i) => i.transaction_id);
    const seenByB = (await ledger(b.cookie)).items.map((i) => i.transaction_id);
    expect(seenByA).toEqual([mine.code]);
    expect(seenByB).toEqual([theirs.code]);
    expect((await ledger(a.cookie, '?customer_code=SAME')).items.map((i) => i.transaction_id)).toEqual([mine.code]);
  });

  it('ignores a merchant_code in the query of a merchant user (it cannot widen the view)', async () => {
    const { a, b } = await tenants();
    await insertRow(a);
    await insertRow(b);
    const page = await ledger(a.cookie, `?merchant_code=${b.merchantCode}`);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('lets the Admin see every merchant with its merchant_code, filter by merchant_code, and never reverse', async () => {
    const { a, b } = await tenants();
    const rowA = await insertRow(a, { customerCode: 'ADMINVIEW' });
    const rowB = await insertRow(b, { customerCode: 'ADMINVIEW' });
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    // a customer code that only these two rows use, so the check does not depend on the other rows or on the date
    const all = await adminLedger(adminCookie, '?customer_code=ADMINVIEW');
    const mine = all.items;
    expect(mine).toHaveLength(2);
    expect(mine.find((i) => i.transaction_id === rowA.code)).toMatchObject({ merchant_code: a.merchantCode });
    expect(mine.find((i) => i.transaction_id === rowB.code)).toMatchObject({ merchant_code: b.merchantCode });
    expect(all.items.every((i) => i.reversible === false)).toBe(true); // read only

    const onlyB = await adminLedger(adminCookie, `?customer_code=ADMINVIEW&merchant_code=${b.merchantCode}`);
    expect(onlyB.items.map((i) => i.transaction_id)).toEqual([rowB.code]);
    const bad = await get('/api/v1/admin/ledger?merchant_code=nope', adminCookie);
    expect(bad.status).toBe(400);
    expect(await codeOf(bad)).toBe('MSG33');

    const reverse = await app.request(`/api/v1/merchant/ledger/${rowA.code}/reverse`, { method: 'POST', headers: portalHeaders(adminCookie) });
    expect(reverse.status).toBe(403);
    expect(await codeOf(reverse)).toBe('MSG04');
  });

  it('refuses anonymous users (MSG35), the Admin on the merchant list (MSG04) and merchant users on the Admin list (MSG04)', async () => {
    const { a } = await tenants();
    const admin = await seedUser(sql, { role: 'ADMIN' });
    const adminCookie = await loginCookie(app, admin.email, admin.password);

    for (const path of ['/api/v1/merchant/ledger', '/api/v1/admin/ledger']) {
      const anonymous = await get(path);
      expect(anonymous.status).toBe(401);
      expect(await codeOf(anonymous)).toBe('MSG35');
    }
    const adminOnMerchant = await get('/api/v1/merchant/ledger', adminCookie);
    expect(adminOnMerchant.status).toBe(403);
    expect(await codeOf(adminOnMerchant)).toBe('MSG04');
    const ownerOnAdmin = await get('/api/v1/admin/ledger', a.cookie);
    expect(ownerOnAdmin.status).toBe(403);
    expect(await codeOf(ownerOnAdmin)).toBe('MSG04');
  });
});
