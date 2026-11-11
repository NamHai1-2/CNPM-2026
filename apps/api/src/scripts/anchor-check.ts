/**
 * T12 – kiểm tra tay adapter Sui trên Testnet, KHÔNG cần cơ sở dữ liệu.
 *
 *   pnpm --filter api exec tsx src/scripts/anchor-check.ts
 *
 * Cần trong .env: SUI_PRIVATE_KEY, SUI_PACKAGE_ID, SUI_REGISTRY_ID (và tuỳ chọn SUI_RPC_URL, SUI_GRAPHQL_URL).
 * Mỗi lần chạy ghi 1 mã giao dịch thử (TXN-…-CHECKxxx) lên registry, tốn rất ít gas Testnet.
 * Script KHÔNG in khoá riêng.
 */
import { createHash, randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';
import { loadEnv } from '../env.js';
import { ChainError, classifyThrown, createSuiChain } from '../services/anchoring/index.js';

loadEnv();
const config = loadConfig();

const missing = (['SUI_PRIVATE_KEY', 'SUI_PACKAGE_ID', 'SUI_REGISTRY_ID'] as const).filter((k) => !config[k]);
if (missing.length > 0) {
  console.error(`Thiếu trong .env: ${missing.join(', ')}`);
  process.exit(2);
}

const chain = createSuiChain({
  rpcUrl: config.SUI_RPC_URL,
  graphqlUrl: config.SUI_GRAPHQL_URL,
  privateKey: config.SUI_PRIVATE_KEY!,
  packageId: config.SUI_PACKAGE_ID!,
  registryId: config.SUI_REGISTRY_ID!,
});

let failures = 0;
function report(ok: boolean, title: string, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}${detail ? `\n      ${detail}` : ''}`);
}
const explorer = (digest: string): string => config.SUI_EXPLORER_TX_URL.replace('{digest}', digest);

const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const code = `TXN-${today}-CHK${randomBytes(3).toString('hex').toUpperCase().slice(0, 5)}`;
const hash = createHash('sha256').update(code).digest('hex');
console.log(`Mã thử: ${code}\nHash   : ${hash}\n`);

// Bước 0: số dư ví nền tảng
try {
  const balance = await chain.getGasBalanceMist?.();
  if (balance === null || balance === undefined) report(false, 'Đọc số dư ví', 'không đọc được số dư');
  else report(balance > 50_000_000n, `Số dư ví: ${Number(balance) / 1e9} SUI`, balance > 50_000_000n ? '' : 'dưới 0.05 SUI: xin thêm từ faucet');
} catch (err) {
  report(false, 'Đọc số dư ví', classifyThrown(err).message);
}

// Bước 1: ghi lần đầu phải thành công
let digest = '';
try {
  ({ digest } = await chain.anchor(code, hash));
  report(true, 'Bước 1: anchor lần đầu thành công', `digest: ${digest}\n      mở thử: ${explorer(digest)}`);
} catch (err) {
  const e = classifyThrown(err);
  report(false, 'Bước 1: anchor lần đầu', `[${e.kind}/${e.reason}] ${e.message}`);
}

// Bước 2: ghi lần hai CÙNG mã phải báo trùng (E_DUPLICATE)
if (digest) {
  try {
    await chain.anchor(code, hash);
    report(false, 'Bước 2: ghi trùng mã phải bị từ chối', 'lần hai lại thành công, hợp đồng không chặn trùng!');
  } catch (err) {
    const e = err instanceof ChainError ? err : classifyThrown(err);
    report(e.kind === 'duplicate', 'Bước 2: ghi trùng mã bị nhận ra là E_DUPLICATE', `loại lỗi nhận được: ${e.kind}\n      ${e.message.slice(0, 200)}`);
  }

  // Bước 3: tìm lại digest bằng sự kiện Anchored (GraphQL)
  try {
    const found = await chain.findDigest(code);
    report(found === digest, 'Bước 3: tìm lại digest từ sự kiện Anchored', found === null ? 'không tìm thấy (có thể chỉ mục GraphQL chưa kịp cập nhật: đợi 10 giây rồi chạy lại)' : `tìm được: ${found}`);
  } catch (err) {
    const e = classifyThrown(err);
    report(false, 'Bước 3: tìm lại digest', `[${e.kind}] ${e.message}`);
  }
}

console.log(failures === 0 ? '\nTẤT CẢ ĐẠT' : `\n${failures} bước KHÔNG đạt`);
process.exit(failures === 0 ? 0 : 1);
