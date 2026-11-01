import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrate.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const MIGRATION = fileURLToPath(new URL('../../src/db/migrations/0001_init.sql', import.meta.url));

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('migrations', () => {
  it('create all 9 tables from db-schema.md', async () => {
    const rows = await db.sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'api_keys',
      'audit_logs',
      'customers',
      'idempotency_keys',
      'loyalty_rules',
      'merchants',
      'sessions',
      'transactions',
      'users',
    ]);
  });

  it('are applied only once', async () => {
    expect(await migrate(db.sql)).toEqual([]);
  });

  it('refuse an applied file that was changed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'octapoint-mig-'));
    try {
      await writeFile(join(dir, '0001_init.sql'), (await readFile(MIGRATION, 'utf8')) + '\n-- edited\n');
      await expect(migrate(db.sql, dir)).rejects.toThrow(/was changed after it was applied/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('apply a new numbered file on top', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'octapoint-mig-'));
    try {
      await copyFile(MIGRATION, join(dir, '0001_init.sql'));
      await writeFile(join(dir, '0002_extra.sql'), 'CREATE TABLE zz_extra (id int);');
      expect(await migrate(db.sql, dir)).toEqual(['0002_extra.sql']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
