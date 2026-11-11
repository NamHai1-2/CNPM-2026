/**
 * T12 – tạo dữ liệu mẫu để thử worker: một cửa hàng demo, một khách và N giao dịch PENDING_ANCHOR.
 *
 *   pnpm --filter api exec tsx src/scripts/anchor-seed.ts [số giao dịch, mặc định 3]
 *
 * Chạy lại được nhiều lần (không tạo trùng cửa hàng/khách). Chỉ dùng trên máy phát triển.
 */
import { createHash, randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';
import { createSql } from '../db/client.js';
import { loadEnv } from '../env.js';

loadEnv();
const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Không chạy script này ở production.');
  process.exit(2);
}
const count = Math.min(Math.max(Number(process.argv[2] ?? 3) || 3, 1), 50);
const sql = createSql(config.DATABASE_URL);

const [merchant] = await sql`
  INSERT INTO merchants (code, name, status) VALUES ('MCH-ANCHDM', 'Anchor Demo Shop', 'ACTIVE')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
const [owner] = await sql`
  INSERT INTO users (merchant_id, email, password_hash, full_name, role)
  VALUES (${merchant!.id}, 'anchor-demo@example.com', 'not-a-real-hash', 'Anchor Demo Owner', 'MERCHANT_OWNER')
  ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`;
const [customer] = await sql`
  INSERT INTO customers (merchant_id, customer_code, name, balance)
  VALUES (${merchant!.id}, 'DEMO001', 'Demo Customer', 1000)
  ON CONFLICT (merchant_id, customer_code) DO UPDATE SET name = EXCLUDED.name RETURNING id`;

const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
for (let i = 0; i < count; i += 1) {
  const code = `TXN-${today}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const proofHash = createHash('sha256').update(code).digest('hex');
  await sql`
    INSERT INTO transactions
      (code, merchant_id, customer_id, type, points, bill_amount, earn_ratio, balance_after, performed_by_user_id, proof_hash)
    VALUES (${code}, ${merchant!.id}, ${customer!.id}, 'ISSUE', 10, 100000, 10000, 1000, ${owner!.id}, ${proofHash})`;
  console.log(`đã tạo ${code}  (PENDING_ANCHOR)`);
}
await sql.end();
