import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Correct horse 1');
    expect(hash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('Correct horse 1', hash)).toBe(true);
    expect(await verifyPassword('Correct horse 2', hash)).toBe(false);
  });

  it('uses every character of a long password (no 72-byte truncation)', async () => {
    const longA = 'ệ'.repeat(40) + 'A1';
    const longB = 'ệ'.repeat(40) + 'B1';
    const hash = await hashPassword(longA);
    expect(await verifyPassword(longB, hash)).toBe(false);
  });
});
