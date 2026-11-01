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

export function createSql(url: string, options: { max?: number } = {}): Sql {
  return postgres(url, {
    max: options.max ?? 10,
    onnotice: () => {},
    types: { bigint: bigintAsNumber },
  });
}
