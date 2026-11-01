/**
 * Minimal JSON logger. Log request id, route, status and duration only (CLAUDE.md): never headers,
 * bodies, passwords, secrets, signatures, session tokens or keys.
 */
function write(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields: Record<string, unknown> = {}) => write('info', { message, ...fields }),
  warn: (message: string, fields: Record<string, unknown> = {}) => write('warn', { message, ...fields }),
  error: (message: string, fields: Record<string, unknown> = {}) => write('error', { message, ...fields }),
  request: (fields: { requestId: string; method: string; path: string; status: number; ms: number }) =>
    write('info', { message: 'request', ...fields }),
};
