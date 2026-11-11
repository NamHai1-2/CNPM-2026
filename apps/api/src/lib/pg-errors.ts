/**
 * True when `error` is a PostgreSQL unique violation (SQLSTATE 23505). With `constraint`, it must be that
 * constraint or unique index (for example 'users_email_key' or 'uq_customer_phone').
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint_name: name } = error as { code?: unknown; constraint_name?: unknown };
  if (code !== '23505') return false;
  return constraint === undefined || name === constraint;
}
