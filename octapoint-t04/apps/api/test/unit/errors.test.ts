import { describe, expect, it } from 'vitest';
import { AppError, toErrorResponse } from '../../src/lib/errors.js';

describe('toErrorResponse', () => {
  it('maps an AppError to its HTTP status and CR-06 body', () => {
    expect(toErrorResponse(new AppError('MSG08'))).toEqual({
      status: 422,
      body: { code: 'MSG08', message: 'Insufficient point balance for this redemption.' },
    });
  });

  it('fills placeholders', () => {
    const { status, body } = toErrorResponse(new AppError('MSG09', { params: { min_points: 50 } }));
    expect(status).toBe(422);
    expect(body.message).toBe('Redemption amount must be at least 50 points.');
  });

  it('adds extra fields (MSG17 returns server_time)', () => {
    const { status, body } = toErrorResponse(new AppError('MSG17', { extra: { server_time: 1700000000 } }));
    expect(status).toBe(401);
    expect(body.server_time).toBe(1700000000);
    expect(body.code).toBe('MSG17');
  });

  it('hides unknown errors behind MSG23 with no detail', () => {
    const { status, body } = toErrorResponse(new Error('connection refused at 10.0.0.5'));
    expect(status).toBe(500);
    expect(body).toEqual({ code: 'MSG23', message: 'An unexpected error occurred. Please try again later.' });
  });

  it('treats an AppError with a success-only code as MSG23', () => {
    expect(toErrorResponse(new AppError('MSG03')).body.code).toBe('MSG23');
  });
});
