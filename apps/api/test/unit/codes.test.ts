import { describe, expect, it } from 'vitest';
import { generateMerchantCode, generateTxCode } from '../../src/lib/codes.js';

describe('generateMerchantCode', () => {
  it('matches MCH-XXXXXX (upper-case letters and digits)', () => {
    for (let i = 0; i < 200; i += 1) expect(generateMerchantCode()).toMatch(/^MCH-[A-Z0-9]{6}$/);
  });

  it('does not repeat in a small sample', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateMerchantCode()));
    expect(codes.size).toBe(200);
  });
});

describe('generateTxCode', () => {
  it('matches TXN-YYYYMMDD-XXXXXXXX', () => {
    for (let i = 0; i < 200; i += 1) expect(generateTxCode()).toMatch(/^TXN-[0-9]{8}-[A-Z0-9]{8}$/);
  });

  it('uses the date in UTC, not local time', () => {
    expect(generateTxCode(new Date('2026-11-01T23:30:00Z'))).toMatch(/^TXN-20261101-/);
    expect(generateTxCode(new Date('2026-12-31T17:30:00Z'))).toMatch(/^TXN-20261231-/);
    expect(generateTxCode(new Date('2027-01-01T00:00:00Z'))).toMatch(/^TXN-20270101-/);
  });

  it('pads single-digit months and days', () => {
    expect(generateTxCode(new Date('2026-03-05T10:00:00Z'))).toMatch(/^TXN-20260305-/);
  });

  it('does not repeat in a small sample', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateTxCode()));
    expect(codes.size).toBe(500);
  });
});
