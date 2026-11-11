import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { createSql, type Sql } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';

export interface TestDatabase {
  sql: Sql;
  url: string;
  /** Closes the connections and drops the database. */
  drop: () => Promise<void>;
}

export function requireTestDbUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Start PostgreSQL with "docker compose up -d db" and copy ' +
        '.env.example to .env. Use "pnpm test:unit" to run only the tests that need no database.',
    );
  }
  return url;
}

/**
 * Creates a brand-new, fully migrated database for one test file and drops it afterwards.
 * Tests never clean tables: the ledger forbids DELETE and TRUNCATE (BR-03), so isolation comes from
 * using a fresh database instead.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = requireTestDbUrl();
  const name = `octapoint_test_${randomBytes(6).toString('hex')}`; // hex only: safe as an identifier
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const sql = createSql(url.toString(), { max: 10 });
  await migrate(sql);

  return {
    sql,
    url: url.toString(),
    drop: async () => {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}
