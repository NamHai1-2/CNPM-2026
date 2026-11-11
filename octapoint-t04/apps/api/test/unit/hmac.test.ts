import { describe, expect, it } from 'vitest';
import { buildSigningString, sha256Hex, sign, verifySignature } from '../../src/lib/hmac.js';

// Test vectors from docs/api-spec.md A.2. The SDK must pass the same ones.
const SECRET = 'test_secret_do_not_use';
const BODY = '{"customer_code":"CUS001","amount":150000}';
const KEY_1 = '11111111-1111-4111-8111-111111111111';
const KEY_2 = '22222222-2222-4222-8222-222222222222';

const issue = (idempotencyKey: string) => ({
  timestamp: '1700000000',
  method: 'POST',
  target: '/api/v1/points/issue',
  body: BODY,
  idempotencyKey,
});
const list = {
  timestamp: '1700000000',
  method: 'GET',
  target: '/api/v1/customers/CUS001/transactions?page=2&type=ISSUE',
  body: '',
};

describe('request signing', () => {
  it('hashes the body', () => {
    expect(sha256Hex(BODY)).toBe('2f3a15194661221065981d3607b484d7434e4ca28cd983f1722ac23ce9279eea');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('builds the signing string', () => {
    expect(buildSigningString(issue(KEY_1))).toBe(
      '1700000000.POST./api/v1/points/issue.2f3a15194661221065981d3607b484d7434e4ca28cd983f1722ac23ce9279eea.' + KEY_1,
    );
    expect(buildSigningString(list).endsWith('.')).toBe(true); // a GET ends with an empty key
  });

  it('vector 1: POST issue', () => {
    expect(sign(SECRET, issue(KEY_1))).toBe('a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0');
  });

  it('vector 2: GET with query, empty body, no idempotency key', () => {
    expect(sign(SECRET, list)).toBe('d53e51fa1efe9d41097a3a2aa50cd6d982699acbb8e174cb8c828511c990c08c');
  });

  it('vector 3: replay with another key is rejected, the right signature is accepted', () => {
    const signatureOfVector1 = 'a886d990691785c75c8c53da0ce590f06b53debc8d803f558defcd7c51e599e0';
    expect(verifySignature(SECRET, issue(KEY_2), signatureOfVector1)).toBe(false);
    expect(sign(SECRET, issue(KEY_2))).toBe('096ee56092b5ac5514efd58cbb1ba62292ba2200520c520501ab05b33365e912');
    expect(verifySignature(SECRET, issue(KEY_2), '096ee56092b5ac5514efd58cbb1ba62292ba2200520c520501ab05b33365e912')).toBe(true);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifySignature(SECRET, issue(KEY_1), '')).toBe(false);
    expect(verifySignature(SECRET, issue(KEY_1), 'xyz')).toBe(false);
    expect(verifySignature(SECRET, issue(KEY_1), 'A886D990691785C75C8C53DA0CE590F06B53DEBC8D803F558DEFCD7C51E599E0')).toBe(false);
  });

  it('signs bytes the same way as the equivalent string', () => {
    const asBytes = { ...issue(KEY_1), body: new TextEncoder().encode(BODY) };
    expect(sign(SECRET, asBytes)).toBe(sign(SECRET, issue(KEY_1)));
  });
});
