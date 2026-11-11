import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the .env file in the repository root (apps/api/src -> ../../../.env), if it exists.
 * Variables that are already set in the real environment are NOT overwritten, so hosting
 * platforms (Render, Railway) keep control in production, where no .env file exists.
 */
export function loadEnv(): void {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
