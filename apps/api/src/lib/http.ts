import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { AppError } from './errors.js';
import type { MsgCode } from './messages.js';

/**
 * Reads and validates a JSON request body.
 * - Malformed JSON: AppError('MSG33').
 * - Data that does not match the schema: AppError(invalidCode), MSG33 by default. Forms use 'MSG01'
 *   ("This field is required").
 * The returned value is the parsed and typed body.
 */
export async function parseJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
  invalidCode: MsgCode = 'MSG33',
): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('MSG33');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError(invalidCode);
  return parsed.data;
}
