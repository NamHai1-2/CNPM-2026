import type { Hono } from 'hono';
import type { Sql } from '../../src/db/client.js';
import { hashPassword } from '../../src/lib/password.js';
import type { AppEnv, Role } from '../../src/types.js';

let userCounter = 0;

/** Default password of seeded users. It satisfies the password policy (CR-08). */
export const TEST_PASSWORD = 'Passw0rd-test';

export interface SeedUserOptions {
  role: Role;
  merchantId?: string | null;
  email?: string;
  password?: string;
  fullName?: string;
  isActive?: boolean;
}

/** Inserts a user with a real BCrypt hash so that it can log in through the API. */
export async function seedUser(
  sql: Sql,
  opts: SeedUserOptions,
): Promise<{ id: string; email: string; password: string }> {
  userCounter += 1;
  const email = opts.email ?? `user${userCounter}@example.com`;
  const password = opts.password ?? TEST_PASSWORD;
  const passwordHash = await hashPassword(password);
  const [row] = await sql`
    INSERT INTO users (merchant_id, email, password_hash, full_name, role, is_active)
    VALUES (${opts.merchantId ?? null}, ${email}, ${passwordHash}, ${opts.fullName ?? 'Test User'},
            ${opts.role}, ${opts.isActive ?? true})
    RETURNING id`;
  return { id: String(row.id), email, password };
}

/** Headers of an authenticated portal request: the session cookie and the CSRF header. */
export function portalHeaders(cookie: string): Record<string, string> {
  return { Cookie: cookie, 'X-Requested-With': 'octapoint-portal' };
}

/** Logs in through the API and returns the value for the Cookie header ("octapoint_session=..."). */
export async function loginCookie(
  app: Hono<AppEnv>,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'octapoint-portal' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: HTTP ${res.status} ${await res.text()}`);
  }
  const match = /octapoint_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!match) throw new Error('login response has no session cookie');
  return `octapoint_session=${match[1]}`;
}
