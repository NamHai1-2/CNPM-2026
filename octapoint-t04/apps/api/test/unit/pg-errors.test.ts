import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../../src/lib/pg-errors.js';

describe('isUniqueViolation', () => {
  const violation = { code: '23505', constraint_name: 'users_email_key' };

  it('recognises a unique violation', () => {
    expect(isUniqueViolation(violation)).toBe(true);
  });

  it('checks the constraint name when one is given', () => {
    expect(isUniqueViolation(violation, 'users_email_key')).toBe(true);
    expect(isUniqueViolation(violation, 'merchants_code_key')).toBe(false);
  });

  it('is false for other errors and for values that are not errors', () => {
    expect(isUniqueViolation({ code: '23503', constraint_name: 'users_email_key' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
