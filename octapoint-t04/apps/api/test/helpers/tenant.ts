import type { Hono } from 'hono';
import type { Sql } from '../../src/db/client.js';
import type { AppEnv } from '../../src/types.js';
import { loginCookie, seedUser } from './auth.js';

export interface Tenant {
  merchantId: string;
  merchantCode: string;
  ownerId: string;
  email: string;
  password: string;
  /** Value for the Cookie header of the Owner's session. */
  cookie: string;
}

let tenantCounter = 0;

/**
 * Two ACTIVE merchants, each with an Owner who is logged in. Later tasks use it for tenant-isolation tests:
 * create data as A, then check that B cannot see or change it.
 */
export async function createTwoMerchants(
  sql: Sql,
  app: Hono<AppEnv>,
): Promise<{ a: Tenant; b: Tenant }> {
  async function one(): Promise<Tenant> {
    tenantCounter += 1;
    const code = `MCH-T${String(tenantCounter).padStart(5, '0')}`;
    const [merchant] = await sql`
      INSERT INTO merchants (code, name, status) VALUES (${code}, ${'Tenant ' + tenantCounter}, 'ACTIVE') RETURNING id`;
    const merchantId = String(merchant.id);
    const owner = await seedUser(sql, { role: 'MERCHANT_OWNER', merchantId });
    const cookie = await loginCookie(app, owner.email, owner.password);
    return { merchantId, merchantCode: code, ownerId: owner.id, email: owner.email, password: owner.password, cookie };
  }
  return { a: await one(), b: await one() };
}
