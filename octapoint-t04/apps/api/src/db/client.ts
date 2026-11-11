import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * bigint columns (points, balances) are returned as JavaScript numbers. This is safe because the
 * CHECK constraints keep every value far below 2^53 (CR-02 ceilings).
 */
const bigintAsNumber = {
  to: 20,
  from: [20],
  serialize: (value: unknown) => String(value),
  parse: (value: string) => Number(value),
};

/**
 * Runs `fn` in one database transaction and returns its result (commit), or rolls back when it throws.
 * Services must use this instead of sql.begin: postgres.js gives the callback a TransactionSql, which
 * TypeScript does not accept where a Sql is expected, so this wrapper hands over the handle typed as Sql.
 * Do not call tx.begin or tx.end on that handle.
 */
export async function withTransaction<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const result = await sql.begin(async (tx) => fn(tx as unknown as Sql));
  return result as unknown as T;
}

export function createSql(url: string, options: { max?: number } = {}): Sql {
  return postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    types: { bigint: bigintAsNumber },
  }) as unknown as Sql;
}
