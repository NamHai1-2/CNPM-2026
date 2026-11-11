import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, masterKeyFromConfig } from '../../src/lib/crypto.js';
import { testConfig } from '../helpers/app.js';

const key = randomBytes(32);

describe('encryptSecret / decryptSecret (AES-256-GCM)', () => {
  it('round-trips a secret, including non-ASCII text', () => {
    for (const plain of ['abc123', 'k3Y_-sEcReT', 'mật khẩu bí mật ✓', '']) {
      expect(decryptSecret(encryptSecret(plain, key), key)).toBe(plain);
    }
  });

  it('stores nonce(12) + ciphertext + tag(16)', () => {
    expect(encryptSecret('hello', key).length).toBe(12 + 5 + 16);
  });

  it('gives a different result every time (random nonce)', () => {
    const a = encryptSecret('same text', key);
    const b = encryptSecret('same text', key);
    expect(a.equals(b)).toBe(false);
  });

  it('does not contain the plain text', () => {
    const plain = 'a-very-recognisable-secret-value';
    expect(encryptSecret(plain, key).includes(Buffer.from(plain))).toBe(false);
  });

  it('fails with the wrong key', () => {
    const blob = encryptSecret('secret', key);
    expect(() => decryptSecret(blob, randomBytes(32))).toThrow();
  });

  it('fails when any part of the data was changed', () => {
    const blob = encryptSecret('secret value', key);
    for (const index of [0, 5, 12, blob.length - 1]) {
      const copy = Buffer.from(blob);
      copy[index] = copy[index]! ^ 0xff;
      expect(() => decryptSecret(copy, key)).toThrow();
    }
  });

  it('fails when the data is too short', () => {
    expect(() => decryptSecret(Buffer.alloc(10), key)).toThrow();
  });
});

describe('masterKeyFromConfig', () => {
  it('returns the 32 bytes of SECRET_ENCRYPTION_KEY', () => {
    const material = randomBytes(32);
    const config = testConfig({ SECRET_ENCRYPTION_KEY: material.toString('base64') });
    expect(masterKeyFromConfig(config).equals(material)).toBe(true);
  });
});
