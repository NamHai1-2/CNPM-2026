import { describe, expect, it } from 'vitest';
import { isValidPassword } from '../../src/lib/password-policy.js';

describe('password policy (CR-08)', () => {
  it('accepts 8-64 characters with a letter and a digit', () => {
    expect(isValidPassword('abcdefg1')).toBe(true);
    expect(isValidPassword('Mật khẩu 2026')).toBe(true);
    expect(isValidPassword('a1' + 'x'.repeat(62))).toBe(true); // 64 characters
  });

  it('rejects too short or too long', () => {
    expect(isValidPassword('abc123')).toBe(false);
    expect(isValidPassword('a1' + 'x'.repeat(63))).toBe(false); // 65 characters
  });

  it('needs a letter and a digit', () => {
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('abcdefgh')).toBe(false);
  });

  it('must differ from the email', () => {
    expect(isValidPassword('owner1@example.com', 'Owner1@Example.com')).toBe(false);
    expect(isValidPassword('owner1@example.com', 'someone@example.com')).toBe(true);
  });

  it('counts characters, not bytes', () => {
    expect(isValidPassword('ệ'.repeat(7) + '1')).toBe(true); // 8 characters, 22 bytes
  });
});
