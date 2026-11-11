import { describe, expect, it } from 'vitest';
import { requestTarget } from '../../src/lib/request-target.js';

describe('requestTarget', () => {
  it('returns an origin-form target unchanged', () => {
    expect(requestTarget('/api/v1/customers/CUS001/transactions?page=2&type=ISSUE')).toBe(
      '/api/v1/customers/CUS001/transactions?page=2&type=ISSUE',
    );
  });

  it('reduces a full URL to path and query', () => {
    expect(requestTarget('https://api.example.com/api/v1/points/issue')).toBe('/api/v1/points/issue');
    expect(requestTarget('https://api.example.com/api/v1/x?b=2&a=1')).toBe('/api/v1/x?b=2&a=1');
  });

  it('keeps the order of query parameters and percent-encoding', () => {
    expect(requestTarget('http://localhost:3001/api/v1/x?q=a%20b&z=1&a=2')).toBe('/api/v1/x?q=a%20b&z=1&a=2');
  });
});
