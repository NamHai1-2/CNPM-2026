import type { Sql } from '../../db/client.js';
import type { AnchorDb } from './run.js';

/**
 * Bọc postgres.js (Sql từ db/client.ts) thành AnchorDb. Câu lệnh dùng $1, $2… nên đi qua sql.unsafe;
 * mọi giá trị đều là tham số, không nối chuỗi.
 */
export function toAnchorDb(sql: Sql): AnchorDb {
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.unsafe(text, params as never[]);
      return Array.from(rows) as unknown as T[];
    },
  };
}
