import { createSql } from '../db/client.js';
import { loadEnv } from '../env.js';
import { hashPassword } from '../lib/password.js';
import { isValidPassword } from '../lib/password-policy.js';
import { promptHidden } from '../lib/prompt.js';

/**
 * Manual password reset (LI-14). A team member runs it after checking the person's identity.
 * Usage: pnpm --filter api reset:password -- user@example.com
 * Stores the new BCrypt hash, revokes all sessions of the user and writes an audit row.
 */
async function main(): Promise<void> {
  loadEnv();
  const url = process.env.DATABASE_URL;
  const email = process.argv.slice(2).find((arg) => arg !== '--');
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  if (!email) throw new Error('Usage: pnpm --filter api reset:password -- <email>');

  const sql = createSql(url, { max: 1 });
  try {
    const users = await sql`SELECT id, merchant_id FROM users WHERE email = ${email}`;
    const user = users[0];
    if (!user) throw new Error(`No user with email ${email}.`);

    const password = await promptHidden('New password: ');
    const confirmation = await promptHidden('Repeat the new password: ');
    if (password !== confirmation) throw new Error('The two passwords are different.');
    if (!isValidPassword(password, email)) {
      throw new Error('The password must follow the policy (CR-08): 8-64 characters, a letter and a digit.');
    }

    const passwordHash = await hashPassword(password);
    await sql.begin(async (tx) => {
      await tx`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${user.id}`;
      await tx`UPDATE sessions SET revoked_at = now() WHERE user_id = ${user.id} AND revoked_at IS NULL`;
      await tx`
        INSERT INTO audit_logs (merchant_id, actor_user_id, action, entity_type, entity_id, details)
        VALUES (${user.merchant_id}, NULL, 'PASSWORD_CHANGED', 'user', ${String(user.id)}, ${tx.json({ by: 'script' })})`;
    });
    console.log('Password changed and all sessions of this user were ended.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
