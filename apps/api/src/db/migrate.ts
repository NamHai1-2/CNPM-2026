import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../env.js';
import { createSql, type Sql } from './client.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const LOCK_ID = 727_274_001; // arbitrary constant: serialises concurrent migrate runs

/**
 * Applies the numbered SQL files in `migrations/` in order and records each one with its checksum.
 * - Already applied files are skipped; if their content changed, the run fails (never edit an
 *   applied migration: add a new one).
 * - All pending files run in one transaction: either all apply or none.
 * Returns the names of the files applied by this run.
 */
export async function migrate(sql: Sql, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      checksum   char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(dir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const applied: string[] = [];

  await sql.begin(async (tx) => {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
    const rows = await tx`SELECT filename, checksum FROM schema_migrations`;
    const done = new Map<string, string>(rows.map((row) => [String(row.filename), String(row.checksum)]));

    for (const file of files) {
      const content = await readFile(new URL(file, pathToFileURL(dir + '/')), 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      const previous = done.get(file);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(`Migration ${file} was changed after it was applied. Add a new migration instead.`);
        }
        continue;
      }
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (filename, checksum) VALUES (${file}, ${checksum})`;
      applied.push(file);
    }
  });

  return applied;
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  const sql = createSql(url, { max: 1 });
  try {
    const applied = await migrate(sql);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
