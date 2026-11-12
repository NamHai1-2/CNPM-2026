import { describe, expect, it } from 'vitest';
import {
  ChainError,
  classifyExecutionFailure,
  classifyThrown,
  extractAbortCode,
  shortError,
} from '../../src/services/anchoring/errors.js';

const abortText = (code: number, module = 'anchor') =>
  `MoveAbort(MoveLocation { module: ModuleId { address: 0xabc, name: Identifier("${module}") }, function: 0, instruction: 8, function_name: Some("anchor") }, ${code}) in command 0`;

describe('extractAbortCode', () => {
  it('reads the abort code from the string form', () => {
    expect(extractAbortCode(abortText(1))).toBe(1);
    expect(extractAbortCode(abortText(2))).toBe(2);
  });

  it('reads the abort code from the object form', () => {
    expect(extractAbortCode(JSON.stringify({ MoveAbort: { abortCode: '1', location: { module: 'anchor' } } }))).toBe(1);
  });

  it('returns null when there is no abort', () => {
    expect(extractAbortCode('InsufficientGas')).toBeNull();
  });
});

describe('classifyExecutionFailure', () => {
  it('E_DUPLICATE (1) is a duplicate', () => {
    expect(classifyExecutionFailure(abortText(1)).kind).toBe('duplicate');
  });

  it('E_BAD_HASH (2) counts as a normal failure', () => {
    expect(classifyExecutionFailure(abortText(2)).kind).toBe('permanent');
  });

  it('InsufficientGas is temporary and flagged as gas', () => {
    const error = classifyExecutionFailure('InsufficientGas');
    expect(error.kind).toBe('temporary');
    expect(error.reason).toBe('gas');
  });
});

describe('classifyThrown', () => {
  it.each([
    'fetch failed',
    'connect ECONNREFUSED 127.0.0.1:443',
    'The operation was aborted due to timeout',
    'HTTP 503 Service Unavailable',
    '429 Too Many Requests',
    'ObjectVersionUnavailableForConsumption',
  ])('treats %s as a temporary infrastructure error', (message) => {
    expect(classifyThrown(new Error(message)).kind).toBe('temporary');
  });

  it.each(['No valid gas coins found for the transaction', 'GasBalanceTooLow'])(
    'treats %s as temporary (gas)',
    (message) => {
      const error = classifyThrown(new Error(message));
      expect(error.kind).toBe('temporary');
      expect(error.reason).toBe('gas');
    },
  );

  it('treats anything unknown as permanent', () => {
    expect(classifyThrown(new Error('something odd')).kind).toBe('permanent');
  });

  it('keeps an existing ChainError unchanged', () => {
    const original = new ChainError('duplicate', 'x');
    expect(classifyThrown(original)).toBe(original);
  });
});

describe('shortError', () => {
  it('never leaks a private key and stays short', () => {
    const text = shortError(new Error(`bad key suiprivkey1qabcdef123 ${'x'.repeat(1000)}`));
    expect(text).not.toContain('suiprivkey1qabcdef123');
    expect(text.length).toBeLessThanOrEqual(300);
  });
});
