import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const healthy = createApp({ checkDb: async () => {} });

describe('app', () => {
  it('GET /health answers ok and sets a request id', async () => {
    const res = await healthy.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('turns a database failure into MSG23 without leaking details', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('password authentication failed for user "octapoint"');
      },
    });
    const res = await app.request('/health');
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ code: 'MSG23', message: 'An unexpected error occurred. Please try again later.' });
  });

  it('answers unknown routes with the CR-06 body and HTTP 404', async () => {
    const res = await healthy.request('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'MSG33', message: 'Request data is invalid.' });
  });
});
