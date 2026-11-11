import { createSql } from '../db/client.js';
import { loadEnv } from '../env.js';
import { hashPassword } from '../lib/password.js';
import { isValidPassword } from '../lib/password-policy.js';

/**
 * Creates the first Admin account (LI-14) from SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.
 * Refuses to run when an Admin already exists.  Usage: pnpm --filter api seed:admin
 */
async function main(): Promise<void> {
  loadEnv();
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('SEED_ADMIN_EMAIL is missing or is not a valid email.');
  }
  if (!password || !isValidPassword(password, email)) {
    throw new Error('SEED_ADMIN_PASSWORD must follow the password policy (CR-08): 8-64 characters, a letter and a digit.');
  }

  const passwordHash = await hashPassword(password);
  const sql = createSql(url, { max: 1 });
  try {
    const created = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(727274002)`;
      const existing = await tx`SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1`;
      if (existing.length > 0) return false;
      await tx`
        INSERT INTO users (merchant_id, email, password_hash, full_name, role)
        VALUES (NULL, ${email}, ${passwordHash}, 'System Admin', 'ADMIN')`;
      return true;
    });
    if (!created) {
      console.error('An Admin account already exists. Nothing was changed.');
      process.exitCode = 1;
      return;
    }
    console.log(`Admin account created for ${email}. Change the seed password after the first login.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
