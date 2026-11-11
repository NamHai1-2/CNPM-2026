import { describe, expect, it } from 'vitest';
import { canonicalProofJson, computeProofHash } from '../../src/lib/proof-hash.js';
import type { ProofFields } from '../../src/types.js';

// Test vector from docs/db-schema.md section 4.
const VECTOR: ProofFields = {
  transaction_id: 'TXN-20261101-K7P2M9QX',
  merchant_id: '3f0c2b8e-6f55-4c1a-9d0e-1a2b3c4d5e6f',
  customer_code: 'CUS001',
  type: 'ISSUE',
  points: 1500,
  created_at: '2026-11-01T03:15:42.123Z',
};

describe('proof hash', () => {
  it('builds the canonical JSON of db-schema.md: keys sorted, no whitespace', () => {
    expect(canonicalProofJson(VECTOR)).toBe(
      '{"created_at":"2026-11-01T03:15:42.123Z","customer_code":"CUS001","merchant_id":"3f0c2b8e-6f55-4c1a-9d0e-1a2b3c4d5e6f","points":1500,"transaction_id":"TXN-20261101-K7P2M9QX","type":"ISSUE"}',
    );
  });

  it('reproduces the test vector', () => {
    expect(computeProofHash(VECTOR)).toBe('fbf42511ae75ae2327bccf4fe9b4560825f52580379e7eaf8e6d340f649ee2a1');
  });

  it('does not depend on the order in which the keys were written', () => {
    const shuffled: ProofFields = {
      type: 'ISSUE',
      created_at: '2026-11-01T03:15:42.123Z',
      points: 1500,
      transaction_id: 'TXN-20261101-K7P2M9QX',
      customer_code: 'CUS001',
      merchant_id: '3f0c2b8e-6f55-4c1a-9d0e-1a2b3c4d5e6f',
    };
    expect(computeProofHash(shuffled)).toBe(computeProofHash(VECTOR));
  });

  it('adds reverses_transaction_id, in its alphabetical place, for a REVERSAL', () => {
    const reversal: ProofFields = {
      ...VECTOR,
      type: 'REVERSAL',
      reverses_transaction_id: 'TXN-20261101-AAAAAAAA',
    };
    const json = canonicalProofJson(reversal);
    expect(json).toContain('"points":1500,"reverses_transaction_id":"TXN-20261101-AAAAAAAA","transaction_id"');
    expect(computeProofHash(reversal)).not.toBe(computeProofHash(VECTOR));
  });

  it('leaves out a key whose value is undefined', () => {
    expect(canonicalProofJson({ ...VECTOR, reverses_transaction_id: undefined })).toBe(canonicalProofJson(VECTOR));
  });

  it('changes when any hashed field changes', () => {
    const base = computeProofHash(VECTOR);
    const changed: ProofFields[] = [
      { ...VECTOR, points: 1501 },
      { ...VECTOR, customer_code: 'CUS002' },
      { ...VECTOR, type: 'REDEEM' },
      { ...VECTOR, created_at: '2026-11-01T03:15:42.124Z' },
      { ...VECTOR, transaction_id: 'TXN-20261101-K7P2M9QY' },
      { ...VECTOR, merchant_id: '3f0c2b8e-6f55-4c1a-9d0e-1a2b3c4d5e70' },
    ];
    for (const fields of changed) expect(computeProofHash(fields)).not.toBe(base);
  });

  it('is 64 lowercase hex characters', () => {
    expect(computeProofHash(VECTOR)).toMatch(/^[0-9a-f]{64}$/);
  });
});
