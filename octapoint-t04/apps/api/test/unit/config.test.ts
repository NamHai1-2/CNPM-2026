import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const key = Buffer.alloc(32, 7).toString('base64');
const base = {
  DATABASE_URL: 'postgres://octapoint:octapoint@localhost:5432/octapoint',
  SECRET_ENCRYPTION_KEY: key,
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(base);
    expect(config.PORT).toBe(3001);
    expect(config.ENABLE_ANCHOR_WORKER).toBe(false);
    expect(config.ANCHOR_INTERVAL_SECONDS).toBe(30);
    expect(config.ANCHOR_BATCH_SIZE).toBe(20);
    expect(config.SUI_EXPLORER_TX_URL).toContain('{digest}');
  });

  it('rejects a missing database url and lists the problem', () => {
    expect(() => loadConfig({ SECRET_ENCRYPTION_KEY: key })).toThrow(/DATABASE_URL/);
  });

  it('rejects the placeholder or a wrong-length encryption key', () => {
    expect(() => loadConfig({ ...base, SECRET_ENCRYPTION_KEY: 'REPLACE_WITH_32_RANDOM_BYTES_BASE64' })).toThrow(/SECRET_ENCRYPTION_KEY/);
    expect(() => loadConfig({ ...base, SECRET_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/SECRET_ENCRYPTION_KEY/);
  });

  it('needs the Sui settings only when the worker is enabled', () => {
    expect(() => loadConfig({ ...base, ENABLE_ANCHOR_WORKER: 'true' })).toThrow(/SUI_PRIVATE_KEY/);
    const config = loadConfig({
      ...base,
      ENABLE_ANCHOR_WORKER: 'true',
      SUI_PRIVATE_KEY: 'suiprivkey1abc',
      SUI_PACKAGE_ID: '0x1',
      SUI_REGISTRY_ID: '0x2',
    });
    expect(config.ENABLE_ANCHOR_WORKER).toBe(true);
  });

  it('rejects an explorer template without {digest}', () => {
    expect(() => loadConfig({ ...base, SUI_EXPLORER_TX_URL: 'https://example.com/tx' })).toThrow(/SUI_EXPLORER_TX_URL/);
  });
});
