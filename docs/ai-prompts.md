# OctaPoint – Hướng dẫn dùng AI để viết code theo từng task (T02 → T16)

Mục tiêu: năm người dùng AI song song nhưng code ghép lại **khít với nhau, đúng SRS, không phải sửa lại**.

AI hay làm sai theo ba kiểu: (1) tự thêm tính năng hoặc đổi tên hàm, (2) đoán khi tài liệu chưa rõ, (3) mỗi người một kiểu nên code của các task không ghép được. Tài liệu này chặn cả ba bằng bốn thứ:

| Công cụ | Chặn lỗi gì |
|---|---|
| **Prompt nền** (mục 5) dán đầu mỗi cuộc trò chuyện | AI tự thêm tính năng, đoán, quên quy tắc chung |
| **Hợp đồng giữa các task** (mục 3) và file `apps/api/src/types.ts` | Hai task gọi nhau sai tên hàm hoặc sai kiểu dữ liệu |
| **Bảng sở hữu file** (mục 2) | Hai người sửa cùng một file, xung đột khi gộp |
| **Quy trình Kế hoạch → Code → Test → Báo cáo lệch** (mục 1) | Code sai hướng mà đến lúc review mới biết |

> **Đọc nhanh (5 phút):** chỉ cần đọc **mục 1** (quy trình), sao chép **mục 5** (prompt nền), rồi tìm task của mình ở **mục 7** và dán prompt đó. Các mục 2, 3, 4 là phần **tra cứu** (ai sở hữu file nào, tên hàm giữa các task, đường dẫn route): đọc phần liên quan đến task của bạn và đính kèm theo "Gói ngữ cảnh".

---

## 1. Quy trình 9 bước cho mỗi task

1. **Đọc thẻ Jira** của task (mục "Cần có trước", "Phải chờ"). Chưa đủ điều kiện thì không bắt đầu.
2. **Cập nhật code mới nhất:** `git checkout develop`, `git pull`, rồi tạo nhánh `feature/Txx-ten-ngan`. Chạy `pnpm install` và `pnpm test` để chắc chắn bạn xuất phát từ trạng thái xanh.
3. **Mở một cuộc trò chuyện AI mới** cho mỗi task (đừng dùng lại cuộc cũ, AI sẽ lẫn ngữ cảnh).
4. **Dán Prompt nền** (mục 5) trước.
5. **Đính kèm hoặc dán đúng các file ở "Gói ngữ cảnh"** của task (mục 7). Không dán cả repo; đủ và ít thì AI chính xác hơn. Nếu dùng công cụ đọc được repo (Claude Code, Cursor), vẫn chỉ cho nó đúng các file đó.
6. **Dán Prompt của task**. AI sẽ trả về **Bước 1: Kế hoạch** và danh sách câu hỏi. **Đọc kỹ và trả lời câu hỏi trước khi cho nó viết code.** Chỗ nào AI nói "tài liệu không nói rõ" thì hỏi người xem lại hoặc Hải; đừng tự quyết thay AI.
7. **Cho AI viết code từng bước** (Bước 2 → 5). Chép file vào đúng đường dẫn, rồi chạy:
   ```powershell
   pnpm lint
   pnpm typecheck
   pnpm test
   ```
8. **Lỗi thì dùng Prompt sửa lỗi** (mục 8.2), không tự sửa mò và không để AI sửa test cho vừa với code sai.
9. **Mở pull request.** Người xem lại dùng **Prompt review** (mục 8.1) để kiểm cùng một danh sách. Gộp vào `develop` khi đạt mục "Xong khi" của thẻ.

Ba quy tắc sống còn:
- **AI đưa ra "đề xuất đổi hợp đồng" thì dừng lại.** Báo cho người sở hữu file đó (mục 2), đừng tự sửa.
- **AI không chắc một hàm của thư viện có tồn tại không thì phải nói**, không được đoán. Bạn kiểm bằng gợi ý kiểu trong VS Code hoặc `pnpm typecheck`.
- **Không tin kết quả cho đến khi test chạy xanh trên máy bạn.** Với phần có database, nhớ bật `docker compose up -d db`.

---

## 2. Ai sở hữu file nào, và thứ tự gộp file nền

Mỗi file dùng chung có **một chủ**. Chỉ chủ được sửa; người khác cần đổi thì nhờ chủ (hoặc mở PR nhỏ do chủ duyệt).

| File | Chủ | Gộp vào `develop` | Ai dùng |
|---|---|---|---|
| `apps/api/src/types.ts` (đã có) | Hiếu | Đã xong | Tất cả |
| `src/middleware/auth.ts`, `src/routes/index.ts`, `src/services/audit.ts`, `src/lib/http.ts`, `test/helpers/app.ts`, `test/helpers/auth.ts`, thay đổi nhỏ ở `src/app.ts`, `src/index.ts` | Hiếu (T02) | **2 ngày đầu tuần 5** | Tất cả task có route; `audit.ts` dùng bởi T03, T04, T05, T06, T08 |
| `src/lib/codes.ts`, `src/lib/pg-errors.ts` | Duy (T03) | **2 ngày đầu tuần 5** | T04, T05, T07a, T08 |
| `src/lib/crypto.ts`, `src/lib/validation.ts` (isUuid, isValidEmail), `src/services/apikeys.ts`, `src/services/staff.ts` | Duy (T04) | Tuần 6 | T09; `validation.ts` cũng dùng ở T05 |
| `src/services/customers.ts` | Hiệp (T05) | Giữa tuần 5 | T07a, T08 |
| `src/services/rules.ts` | Hải (T06) | Giữa tuần 5 | T07a, T09 |
| `src/lib/proof-hash.ts`, `src/services/transactions.ts`, `src/services/points.ts` | Hiếu (T07a) | Đầu tuần 6 | T07b, T08, T09 |
| `src/services/idempotency.ts`, `src/services/maintenance.ts` | Duy (T07b) | Giữa tuần 6 | T09 |
| `src/services/ledger.ts` | Hải (T08) | Tuần 6 | T13b |
| `src/middleware/api-key.ts`, `src/routes/external/*` | Đạt (T09) | Cuối tuần 6 | T14 |
| `src/services/anchoring.ts`, `src/services/sui-client.ts` | Hiếu (T12) | Tuần 7 | – |
| `contracts/anchor/*` | Đạt (T11) | Tuần 5–6 | T12 |
| `apps/web/*` | Hiệp (T13) | Từng màn hình | – |
| `packages/sdk/*` | Đạt (T14) | Tuần 7 | T15 |
| `packages/mcp/*` | Duy (T15) | Tuần 7 | – |
| `docs/*` | Hải (T16b) | Liên tục | Tất cả |

**Mỗi task thêm route** chỉ sửa `src/routes/index.ts` đúng **một dòng import và một dòng `app.route(...)`** (theo bảng ở mục 4). Không tự sắp xếp lại file, để khi gộp không bị xung đột.

---

## 3. Hợp đồng giữa các task (chép đúng, không đổi tên)

Các kiểu dữ liệu dùng chung nằm sẵn trong **`apps/api/src/types.ts`** (đọc file đó trước). Các chữ ký hàm dưới đây là cam kết giữa người này và người kia: **người sở hữu phải viết đúng như vậy, người dùng được phép tin vào nó.**

Quy ước chung:
- JSON gửi ra ngoài (View) dùng `snake_case` đúng như `api-spec.md`; code bên trong (Row, Input) dùng `camelCase`.
- `Sql` là kiểu trong `src/db/client.ts`; tham số `db: Sql` nhận cả kết nối thường lẫn giao dịch, tham số `tx: Sql` có nghĩa "phải gọi bên trong một giao dịch đã mở".
- Mọi hàm bất đồng bộ trả `Promise`; lỗi nghiệp vụ ném `AppError('MSGxx')`.

```ts
// ============ T02 · Hiếu ============
// src/middleware/auth.ts
export function requireSession(sql: Sql): MiddlewareHandler<AppEnv>;   // 401 MSG35; đặt c.var.auth
export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv>; // 403 MSG04
export function requireCsrfHeader(): MiddlewareHandler<AppEnv>;        // POST/PUT/PATCH/DELETE phải có X-Requested-With: octapoint-portal, sai: 403 MSG04
export function requireMerchantId(c: Context<AppEnv>): string;         // c.var.auth.merchantId; Admin thì ném AppError('MSG04')

// src/services/audit.ts
export async function writeAudit(db: Sql, entry: AuditEntry): Promise<void>;   // INSERT vào audit_logs; gọi trong cùng giao dịch với hành động được ghi

// src/db/client.ts
export async function withTransaction<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T>;   // commit khi xong, rollback khi ném lỗi; tx có kiểu Sql

// src/lib/http.ts
export async function parseJsonBody<T>(c: Context, schema: ZodType<T>, invalidCode?: MsgCode): Promise<T>;
//   JSON hỏng: AppError('MSG33'); sai schema: AppError(invalidCode), mặc định 'MSG33' (form dùng 'MSG01')

// src/routes/index.ts
export interface RouteDeps { sql: Sql; config: Config }
export function registerRoutes(app: Hono<AppEnv>, deps: RouteDeps): void;
// Mọi file route: export function xxxRoutes(deps: RouteDeps): Hono<AppEnv>
// app.ts: AppDeps có thêm  routes?: (app: Hono<AppEnv>) => void   (không bắt buộc, để test cũ vẫn chạy)

// test/helpers/app.ts
export function testConfig(overrides?: Record<string, string>): Config;   // cấu hình hợp lệ cho test
export function createTestApp(sql: Sql, config?: Config): Hono<AppEnv>;  // createApp + registerRoutes
// test/helpers/auth.ts
export async function seedUser(sql: Sql, opts: { role: Role; merchantId?: string | null; email?: string;
  password?: string; fullName?: string; isActive?: boolean }): Promise<{ id: string; email: string; password: string }>;
export async function loginCookie(app: Hono<AppEnv>, email: string, password: string): Promise<string>; // giá trị cho header Cookie
export function portalHeaders(cookie: string): Record<string, string>;   // Cookie + X-Requested-With

// ============ T03 · Duy ============
// src/lib/codes.ts
export function generateMerchantCode(): string;       // 'MCH-' + 6 ký tự [A-Z0-9], dùng crypto.randomInt
export function generateTxCode(now?: Date): string;   // 'TXN-' + YYYYMMDD (UTC) + '-' + 8 ký tự [A-Z0-9]
// src/lib/pg-errors.ts
export function isUniqueViolation(error: unknown, constraint?: string): boolean;   // mã 23505, tuỳ chọn tên ràng buộc

// ============ T04 · Duy ============
// src/lib/crypto.ts
export function masterKeyFromConfig(config: Config): Buffer;                // 32 byte
export function encryptSecret(plain: string, key: Buffer): Buffer;          // nonce(12) || ciphertext || tag(16)
export function decryptSecret(blob: Buffer, key: Buffer): string;
// src/lib/validation.ts
export function isUuid(value: string): boolean;          // kiểm id từ đường dẫn trước khi đưa vào SQL
export function isValidEmail(value: string): boolean;
// src/services/apikeys.ts
export async function findApiKeyForAuth(db: Sql, keyId: string, masterKey: Buffer): Promise<ApiKeyAuthRecord | null>;

// ============ T05 · Hiệp ============
// src/services/customers.ts
export async function getCustomerForUpdate(tx: Sql, merchantId: string, customerCode: string): Promise<CustomerRow | null>; // SELECT ... FOR UPDATE, lọc theo merchantId
export async function findCustomer(db: Sql, merchantId: string, customerCode: string): Promise<CustomerRow | null>;          // không khoá
export function toCustomerView(row: CustomerRow): CustomerView;

// ============ T06 · Hải ============
// src/services/rules.ts
export async function getLoyaltyRules(db: Sql, merchantId: string): Promise<LoyaltyRules | null>;   // null = chưa đặt (MSG32 do người gọi ném)
export function toRulesView(rules: LoyaltyRules): LoyaltyRulesView;

// ============ T07a · Hiếu ============
// src/lib/proof-hash.ts
export function computeProofHash(fields: ProofFields): string;          // đúng ví dụ trong db-schema.md mục 4
// src/services/transactions.ts
export async function insertTransaction(tx: Sql, input: NewTransaction): Promise<TransactionRow>;
//   sinh mã TXN- (thử lại với mã mới khi trùng), created_at theo UTC làm tròn mili-giây, proof_hash; người gọi đã khoá khách
export function toTransactionView(row: TransactionRow, explorerUrlTemplate: string): TransactionView;
// src/services/points.ts
export interface IssueInput  { merchantId: string; customerCode: string; amount: number; actor: Actor }
export interface RedeemInput { merchantId: string; customerCode: string; points: number; actor: Actor }
export async function issuePointsInTx(tx: Sql, input: IssueInput): Promise<TransactionRow>;    // làm việc trong giao dịch có sẵn
export async function redeemPointsInTx(tx: Sql, input: RedeemInput): Promise<TransactionRow>;
export async function issuePoints(sql: Sql, input: IssueInput): Promise<TransactionRow>;       // tự mở giao dịch (withTransaction)
export async function redeemPoints(sql: Sql, input: RedeemInput): Promise<TransactionRow>;

// ============ T07b · Duy ============
// src/services/idempotency.ts
export function readIdempotencyKey(headerValue: string | undefined): string;   // thiếu hoặc không 1–128 ký tự: AppError('MSG33')
export function hashRequest(method: string, target: string, body: Uint8Array | string): string;
//   = sha256hex(METHOD + '.' + target + '.' + sha256hex(body))
export interface IdempotentResult<T> { status: number; body: T }
export async function withIdempotency<T>(
  sql: Sql,
  params: { scope: IdempotencyScope; key: string; requestHash: string },
  execute: (tx: Sql) => Promise<IdempotentResult<T>>,
): Promise<IdempotentResult<T> & { replayed: boolean }>;
// src/services/maintenance.ts
export async function cleanupExpired(sql: Sql): Promise<{ idempotencyDeleted: number; sessionsDeleted: number }>;

// ============ T08 · Hải ============
// src/services/ledger.ts
export interface LedgerFilter { type?: TxType; status?: TxStatus; dateFrom?: string; dateTo?: string; customerCode?: string; merchantCode?: string; page: number }
export interface LedgerItem extends TransactionView {
  bill_amount: number | null; performed_by: { kind: 'USER' | 'API_KEY'; label: string };
  reversible: boolean; merchant_code?: string }
export async function listLedger(db: Sql, scope: { merchantId: string | null }, filter: LedgerFilter,
  opts: { explorerUrlTemplate: string; includeReversible: boolean }): Promise<Page<LedgerItem>>;   // merchantId null = Admin, mọi cửa hàng
export async function reverseTransaction(sql: Sql,
  input: { merchantId: string; transactionCode: string; actor: { kind: 'USER'; userId: string } }): Promise<TransactionRow>;

// ============ T09 · Đạt ============
// src/middleware/api-key.ts
export function requireApiKey(deps: { sql: Sql; masterKey: Buffer; nowSeconds?: () => number }): MiddlewareHandler<AppEnv>;
//   đặt c.var.apiKey và c.var.rawBody; thứ tự lỗi MSG18, MSG17, MSG16

// ============ T10 · Hiệp ============
// src/services/dashboard.ts
export async function adminDashboard(db: Sql): Promise<AdminDashboardView>;
export async function merchantDashboard(db: Sql, merchantId: string): Promise<MerchantDashboardView>;
//   hai kiểu View này khai báo ngay trong file, đúng JSON ở api-spec.md B.3 và B.4

// ============ T12 · Hiếu ============
// src/services/anchoring.ts
export interface SuiAnchorPort {
  anchor(args: { txCode: string; proofHashHex: string }): Promise<{ digest: string }>;  // ném AnchorDuplicateError khi hợp đồng abort E_DUPLICATE (1)
  findDigestByTxCode(txCode: string): Promise<string | null>;
}
export class AnchorDuplicateError extends Error {}
export class TemporarySuiError extends Error {}   // mạng/timeout, RPC 5xx hoặc giới hạn, hết gas/không có gas coin, xung đột phiên bản object
export async function runAnchorOnce(sql: Sql, deps: { sui: SuiAnchorPort; batchSize: number;
  retryDelaysMinutes?: number[]; temporaryDelayMinutes?: number; leaseMinutes?: number }): Promise<{ claimed: number; anchored: number; retried: number; failed: number; deferred: number }>;
export function startAnchorWorker(sql: Sql, deps: Parameters<typeof runAnchorOnce>[1], intervalSeconds: number): { stop(): void };
// src/services/sui-client.ts
export function createSuiAnchorPort(config: Config): SuiAnchorPort;   // dùng @mysten/sui, gọi hàm anchor của T11

// ============ T11 · Đạt (trên chuỗi, đúng docs/anchoring.md) ============
// module octapoint::anchor;  entry fun anchor(registry: &mut AnchorRegistry, tx_id: String, proof_hash: vector<u8>, clock: &Clock)
// abort 1 = E_DUPLICATE, abort 2 = E_BAD_HASH (hash khác 32 byte); sự kiện Anchored { tx_id, proof_hash, anchored_at_ms }

// ============ T14 · Đạt (packages/sdk/src/index.ts) ============
export interface OctaPointClientOptions { baseUrl: string; apiKey: string; apiSecret: string; timeoutMs?: number;
  fetch?: typeof fetch; nowSeconds?: () => number }
export interface Transaction { transactionId: string; type: 'ISSUE' | 'REDEEM' | 'REVERSAL'; customerCode: string; points: number;
  balanceAfter: number; status: 'PENDING_ANCHOR' | 'ANCHORED' | 'FAILED'; suiDigest: string | null; explorerUrl: string | null;
  reversesTransactionId: string | null; createdAt: string }
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export class OctaPointError extends Error { code: string; httpStatus: number; serverTime?: number }   // serverTime chỉ có với MSG17
export class OctaPointClient {
  constructor(options: OctaPointClientOptions);
  issuePoints(args: { customerCode: string; amount: number; idempotencyKey?: string }): Promise<Transaction>;
  redeemPoints(args: { customerCode: string; points: number; idempotencyKey?: string }): Promise<Transaction>;
  getBalance(customerCode: string): Promise<{ customerCode: string; balance: number }>;
  listTransactions(customerCode: string, query?: { page?: number; type?: string; status?: string; dateFrom?: string; dateTo?: string }): Promise<Page<Transaction>>;
  getLoyaltyRules(): Promise<{ earnRatio: number; minRedemptionThreshold: number }>;
}
export function buildSigningString(parts: { timestamp: string; method: string; target: string; body: string | Uint8Array; idempotencyKey?: string }): string;
export function sign(secret: string, parts: Parameters<typeof buildSigningString>[0]): string;
```

**Sơ đồ ai gọi ai (để thấy vì sao phải khớp):**
`T09 gateway` → `T07b withIdempotency` → `T07a issuePointsInTx` → `T05 getCustomerForUpdate` + `T06 getLoyaltyRules` + `T07a insertTransaction` (dùng `T03 generateTxCode`). `T08 reverseTransaction` dùng `getCustomerForUpdate` và `insertTransaction`. `T12` đọc bảng `transactions` do `insertTransaction` ghi. `T14 SDK` ký giống `T09`; `T15 MCP` dùng `T14`.

---

## 4. Đường dẫn route (mỗi task chỉ thêm đúng dòng của mình vào `routes/index.ts`)

| Mount tại | Hàm | Task |
|---|---|---|
| `/api/v1/auth` | `authRoutes` (login, logout, me, change-password) | T02 |
| `/api/v1/auth/register` | `registrationRoutes` | T03 |
| `/api/v1/admin/merchants` | `adminMerchantRoutes` | T03 |
| `/api/v1/merchant/staff` | `staffRoutes` | T04 |
| `/api/v1/merchant/api-keys` | `apiKeyRoutes` | T04 |
| `/api/v1/merchant/customers` | `customerRoutes` (danh sách, tạo, sửa, khoá/mở) | T05 |
| `/api/v1/merchant/customers` | `portalPointsRoutes` (`/:code/issue`, `/:code/redeem`) | T07b |
| `/api/v1/merchant/rules` | `ruleRoutes` | T06 |
| `/api/v1/merchant/ledger` | `merchantLedgerRoutes` (danh sách, `/:code/reverse`) | T08 |
| `/api/v1/admin/ledger` | `adminLedgerRoutes` | T08 |
| `/api/v1/admin/dashboard`, `/api/v1/merchant/dashboard` | `adminDashboardRoutes`, `merchantDashboardRoutes` | T10 |
| `/api/v1/points` | `externalPointsRoutes` (`/issue`, `/redeem`) | T09 |
| `/api/v1/customers` | `externalCustomerRoutes` (`/:code/balance`, `/:code/transactions`) | T09 |
| `/api/v1/loyalty-rules` | `externalRulesRoutes` | T09 (Should) |

Hai task cùng mount một đường dẫn (T05 và T07b) vẫn được: Hono ghép các route lại, miễn đường con khác nhau.

**Cẩn thận với `router.use('*', ...)`:** middleware đăng ký như vậy trong một file route sẽ áp dụng cho **mọi đường dưới prefix đó**, kể cả route do task khác mount cùng prefix. Chỉ dùng khi tất cả đường dưới prefix đều cần middleware đó (ví dụ `/api/v1/admin/merchants` cần Admin). Nếu không, gắn middleware cho từng route.

---

## 5. Prompt nền (dán đầu mỗi cuộc trò chuyện, không sửa)

```text
You are a senior TypeScript engineer on the OctaPoint project: Hono + PostgreSQL 16 + postgres.js,
Node 20+, ESM, pnpm monorepo (apps/api, apps/web, packages/sdk, packages/mcp, contracts/anchor).
I will give you ONE task. Several teammates are building other tasks in parallel, so your code must
match the shared contracts exactly.

SOURCE OF TRUTH (highest first):
1) docs/PROJECT_REPORT_FIXED.md (SRS)  2) docs/api-spec.md  3) docs/db-schema.md
4) docs/anchoring.md  5) docs/config-and-deploy.md  6) apps/api/src/types.ts
7) the function signatures in docs/ai-prompts.md section 3  8) existing code.
If two sources disagree, STOP and tell me. Do not pick one silently.

HARD RULES
1. Implement ONLY the task below. Do not add features, endpoints, columns, message codes or business
   rules that are not in the documents. Missing or ambiguous information goes under "QUESTIONS";
   wait for my answer.
2. Use the shared types in apps/api/src/types.ts and the signatures in docs/ai-prompts.md section 3
   exactly: same names, parameter order and types. If you think a contract must change, stop and
   report a "CONTRACT CHANGE REQUEST". Never change it yourself.
3. Do not edit files owned by another task (docs/ai-prompts.md section 2). Ask me instead.
   The only allowed edit to src/routes/index.ts is one import line and one app.route(...) line.
4. Code style: TypeScript strict; ESM imports WITH the .js suffix (import { x } from './y.js');
   zod for input validation (read JSON bodies with parseJsonBody from src/lib/http.ts); postgres.js tagged templates for SQL (no ORM, never build SQL by
   string concatenation); points, balances and amounts are integers (never floating point).
5. Errors: throw new AppError('MSGxx', { params }) from src/lib/errors.ts, using only codes defined in
   src/lib/messages.ts. Never invent message text. HTTP statuses come from messages.ts.
6. Security: never log or return passwords, secrets, signatures, session tokens or private keys.
   merchant_id comes ONLY from the session or the API key, never from a request body, query or path.
   Every SQL statement on merchant data filters by merchant_id.
7. Open transactions with withTransaction(sql, fn) from src/db/client.ts (never sql.begin inside services: its handle has a
   different TypeScript type). Anything that changes points runs in ONE database transaction and locks the customer row
   (SELECT ... FOR UPDATE) BEFORE any check that depends on the balance or on earlier transactions.
8. Tests: vitest. Tests that need PostgreSQL use createTestDatabase() from test/helpers/db.ts.
   Never TRUNCATE or DELETE to clean up (the ledger forbids it). Write at least one test for every
   acceptance criterion and name the test after the criterion.
9. Use only APIs that exist in the installed versions (hono ^4, postgres ^3, zod ^3, bcryptjs ^3,
   vitest ^2). If you are not sure an API exists, say so instead of guessing.

WORKFLOW. Stop after each step and wait for me.
Step 1 PLAN: restate the task in your own words; list every file you will create or change (with
        path); list your assumptions and QUESTIONS. No code yet.
Step 2 CODE: after I approve the plan, give each file in full, with its path.
Step 3 TESTS: give the test files in full.
Step 4 CHECK: give the exact commands to run, then a table: acceptance criterion -> test that covers it.
Step 5 DEVIATIONS: list everything that differs from the documents, plus anything you were unsure about.
```

---

## 6. Cách đọc prompt của từng task

Mỗi prompt ở mục 7 có cùng 7 phần: **GÓI NGỮ CẢNH** (file phải đính kèm), **MỤC TIÊU**, **PHẢI GIAO** (đường dẫn file chính xác), **DÙNG TỪ TASK KHÁC** (hàm được phép gọi), **QUY TẮC RIÊNG**, **TEST BẮT BUỘC**, **NGOÀI PHẠM VI**. Phần văn bản trong khối `text` bằng tiếng Anh để AI hiểu chính xác theo tài liệu; bạn dán nguyên.

Với các mục "Gói ngữ cảnh": "SRS x.y" nghĩa là chỉ dán phần đó của `PROJECT_REPORT_FIXED.md`, không dán cả file.

---

## 7. Prompt từng task

### T02 · Đăng nhập và phiên (Hiếu)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.1.1, 3.2.1.4, BR-02, BR-19, CR-03, CR-08; `api-spec.md` mục 0, B.1, B.2 (login, logout, me, change-password); `db-schema.md` bảng `users`, `sessions`, `merchants`; code: `src/app.ts`, `src/index.ts`, `src/types.ts`, `src/lib/{errors,messages,password,password-policy}.ts`, `src/db/client.ts`, `test/helpers/{db,seed}.ts`; mục 3 của tài liệu này (phần T02).

```text
TASK T02 - Login, session and account settings.

GOAL: users log in with email and password and get an 8-hour session cookie; every later portal
route is protected by the middleware you build here. You also create the shared foundation (route
registry and test helpers) that every other task uses, so it must match docs/ai-prompts.md section 3
(T02) EXACTLY.

DELIVERABLES (exact paths):
- src/middleware/auth.ts: requireSession, requireRole, requireCsrfHeader, requireMerchantId
- src/services/auth.ts: session creation/lookup/revocation, login, change password
- src/services/audit.ts: writeAudit(db, entry) inserting into audit_logs (section 3); T03..T08 reuse it
- src/routes/portal/auth.ts: export function authRoutes(deps: RouteDeps): Hono<AppEnv>
  (POST /login, POST /logout, GET /me, POST /change-password; mounted at /api/v1/auth)
- src/routes/index.ts: RouteDeps and registerRoutes (mount authRoutes only; others add their own line)
- small edits: src/app.ts (AppEnv from types.ts; AppDeps.routes optional) and src/index.ts
  (pass routes: app => registerRoutes(app, { sql, config })). test/unit/app.test.ts must still pass.
- test/helpers/app.ts and test/helpers/auth.ts with the signatures in section 3
- test/db/auth.test.ts

SPECIFIC RULES:
- Cookie octapoint_session: random 32 bytes base64url; store ONLY sha256(token) in sessions.token_hash;
  HttpOnly; SameSite=Lax; Path=/; Max-Age 8 hours; Secure when NODE_ENV === 'production'.
- requireSession runs on every request: token -> session not revoked and not expired -> user is_active ->
  (merchant users) merchant status ACTIVE. Any failure: 401 MSG35. Set c.var.auth (AuthContext).
- Login order (api-spec B.2): verify email + password first (unknown email, wrong password, or inactive
  user: the SAME 401 MSG02, and still run a password hash comparison so timing does not reveal which);
  then merchant status (not ACTIVE: 403 MSG15). Response: { user:{id,full_name,email,role}, redirect }
  with redirect /admin for ADMIN, /dashboard for MERCHANT_OWNER, /customers for MERCHANT_STAFF. Message MSG03.
- login is public: apply requireSession per route (logout, me, change-password) and NOT with router.use('*'), because
  T03 mounts /api/v1/auth/register under the same prefix and must not inherit it.
- /logout revokes the current session (204). /me returns { id, full_name, email, role, merchant: {code,name,status} | null }.
- change-password: wrong current -> MSG36; policy CR-08 via isValidPassword -> MSG37; new password must
  differ from the current one -> MSG37; on success revoke all OTHER sessions of the user, keep the current one, and write audit PASSWORD_CHANGED
  (merchantId = the user's merchant or null for an Admin) in the same transaction.
- requireCsrfHeader: see section 3. login is also a state-changing POST, so it is covered too.
- requireMerchantId: throws AppError('MSG04') when auth.merchantId is null (Admin).
- Do NOT implement registration (T03) or any merchant status change.

TEST REQUIRED (one per bullet): login success per role with the right redirect; wrong password and
inactive user return the identical body; correct password but PENDING and SUSPENDED merchant -> MSG15;
expired session, revoked session, deactivated user, suspended merchant -> MSG35 on the next request;
logout then /me -> MSG35; change-password success / MSG36 / MSG37 (policy and same-as-current) / other
sessions revoked; missing X-Requested-With on POST -> MSG04; the stored token_hash is never the cookie value.

OUT OF SCOPE: registration, merchant approval, staff, API keys, any points logic.
```

### T03 · Đăng ký, duyệt cửa hàng, dùng chung (Duy)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.1.1, 3.2.1.2, BR-01, BR-18, CR-04, CR-05; `api-spec.md` B.2 (register), B.3 (merchants); `db-schema.md` bảng `merchants`, `users`, `api_keys`, `audit_logs`; code: `src/types.ts`, `src/middleware/auth.ts` và `src/routes/index.ts` của T02 (sau khi T02 đã gộp), `src/lib/{errors,messages,password}.ts`, `test/helpers/*`; mục 3 (T03).

```text
TASK T03 - Merchant registration, admin approval/suspension, and the shared helpers.

GOAL: shop owners register (merchant PENDING + one owner user), an Admin approves or suspends, and
merchant data is isolated. You also publish two small shared helpers that T04, T05, T07a and T08
depend on (codes and unique-violation detection), so deliver them FIRST (within two days) in their own small
pull request. Audit logging (writeAudit) already exists from T02: use it.

DELIVERABLES (exact paths):
- src/lib/codes.ts: generateMerchantCode(), generateTxCode(now?) as in section 3 (use crypto.randomInt;
  characters [A-Z0-9]; date part of TXN codes is UTC)
- src/lib/pg-errors.ts: isUniqueViolation(error, constraint?) (SQLSTATE 23505)
- src/services/merchants.ts, src/routes/portal/registration.ts (registrationRoutes, POST at /api/v1/auth/register),
  src/routes/portal/admin-merchants.ts (adminMerchantRoutes)
- one import + one app.route line each in src/routes/index.ts (paths in section 4)
- tests: test/unit/codes.test.ts, test/db/merchants.test.ts, test/helpers/tenant.ts
  (createTwoMerchants(sql, app): two merchants, each with an owner, returns both cookies; reused by later tasks)

SPECIFIC RULES:
- Register: validate (MSG01), unique email case-insensitive (MSG31, detect with isUniqueViolation), password policy
  (MSG37). In ONE transaction create merchants(status PENDING, code from generateMerchantCode, retry on a
  code collision) and users(role MERCHANT_OWNER). Public route: no session, but it still requires the X-Requested-With header (requireCsrfHeader). Success 201 MSG30.
- Admin routes need requireSession + requireCsrfHeader + requireRole('ADMIN').
- Approve: allowed from PENDING or SUSPENDED -> ACTIVE; in the same transaction set this merchant's api_keys
  with status SUSPENDED back to ACTIVE (never REVOKED). MSG13. Audit MERCHANT_APPROVED.
- Suspend: allowed ONLY from ACTIVE -> SUSPENDED; set its ACTIVE api_keys to SUSPENDED. MSG14. Audit MERCHANT_SUSPENDED.
  Any other transition: 400 MSG33. There is no reject action.
- List: filter by status, 20 per page, fields {id, code, name, owner_email, status, created_at}; unknown status or a page that is
  not an integer >= 1 -> 400 MSG33. An unknown or malformed merchant id in approve/suspend -> 400 MSG33 (no message exists for
  "merchant not found"; MSG22 is for customers). Lock the merchant row (FOR UPDATE) before checking the status.
- generateTxCode must only produce codes matching ^TXN-[0-9]{8}-[A-Z0-9]{8}$.

TEST REQUIRED: register success (merchant PENDING with MCH- code and exactly one owner); duplicate email
(different case) -> MSG31; weak password -> MSG37; each allowed and each forbidden status transition;
api_keys status changes on suspend/approve and REVOKED stays REVOKED (insert keys directly in the test);
non-admin calling admin routes -> MSG04; code formats; TENANT ISOLATION: a user of merchant A cannot see
merchant B data through any endpoint that exists at this point, using createTwoMerchants.

OUT OF SCOPE: staff, API key creation, customers, rules, points.
```

### T04 · Nhân viên và khoá API (Duy)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.1.3, 3.2.3.3, BR-08, CR-07, CR-08; `api-spec.md` B.4 (staff, api-keys); `db-schema.md` bảng `users`, `api_keys`; code: `src/types.ts`, `src/config.ts`, `src/lib/{errors,messages,password,codes,pg-errors}.ts`, `src/services/audit.ts`, `src/middleware/auth.ts`, `test/helpers/*`.

```text
TASK T04 - Staff accounts and API keys.

GOAL: the Owner creates staff and API keys for POS systems. A key's secret is shown once and stored
encrypted. T09 will call findApiKeyForAuth, so match section 3 (T04) exactly.

DELIVERABLES: src/lib/crypto.ts; src/services/apikeys.ts; src/services/staff.ts;
src/routes/portal/staff.ts (staffRoutes); src/routes/portal/api-keys.ts (apiKeyRoutes); routes mounted per
section 4; tests test/unit/crypto.test.ts, test/db/staff.test.ts, test/db/apikeys.test.ts.

SPECIFIC RULES:
- crypto.ts: AES-256-GCM with node:crypto, key = base64 SECRET_ENCRYPTION_KEY (32 bytes), random 12-byte nonce per
  secret, stored as nonce || ciphertext || 16-byte tag in api_keys.secret_encrypted. Decrypt with a wrong key or
  tampered data must throw.
- Key creation: key_id = 'oct_' + 16 random bytes hex; secret = 32 random bytes base64url (crypto.randomBytes).
  In one transaction: lock the merchant row (SELECT ... FOR UPDATE), count keys with status ACTIVE or SUSPENDED;
  if already 5 -> 409 MSG40; insert; audit API_KEY_CREATED. Response 201 { id, key_id, secret } and the secret is
  returned ONLY in this response. Never log it.
- List returns { id, masked_key_id (first 8 + '...' + last 4 characters), status, created_at }; never the secret.
- Revoke: -> REVOKED permanently (MSG12), audit API_KEY_REVOKED. Owner only. A key of another merchant, an unknown id or a malformed id
  answers 400 MSG33 (same as T03; MSG22 is for customers) so the response does not reveal that the key exists. Revoking an already
  revoked key changes nothing, answers 200 and writes no second audit row.
- Lists (keys and staff) use the Page shape of api-spec section 0 (20 per page, parsePage from services/merchants.ts; a bad page -> MSG33).
- findApiKeyForAuth(db, keyId, masterKey): join api_keys and merchants; return the decrypted secret and both
  statuses; null when the key_id does not exist. It does NOT decide whether the key may be used (T09 does).
- Staff: create {full_name, email, initial_password} for the caller's merchant, role MERCHANT_STAFF; email unique
  (MSG31), password policy (MSG37); audit STAFF_CREATED. Deactivate sets is_active=false and revokes all sessions of
  that user in the same transaction; audit STAFF_DEACTIVATED. There is no delete and no reactivate.
- All routes: Owner only (requireRole('MERCHANT_OWNER')), merchant_id from requireMerchantId.

TEST REQUIRED: encrypt/decrypt round trip, wrong key, tampered data, two encryptions of the same text differ;
6th key -> MSG40 (and a revoked key does not count as active/suspended); secret not stored in plain text
(query the column); list never contains the secret; revoke is permanent; Owner of merchant A cannot revoke merchant
B's key; staff creation errors (MSG31, MSG37); deactivated staff session -> MSG35; staff cannot call these routes (MSG04).

OUT OF SCOPE: HMAC verification and the gateway (T09).
```

### T05 · Khách hàng (Hiệp)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.3.1, BR-04, CR-02; `api-spec.md` B.4 (customers); `db-schema.md` bảng `customers`; code: `src/types.ts`, `src/lib/{errors,messages,pg-errors}.ts`, `src/middleware/auth.ts`, `test/helpers/*`, `test/helpers/tenant.ts`.

```text
TASK T05 - Customer management.

GOAL: Owner and staff find, create and edit customers by customer_code; the Owner can deactivate or
reactivate. T07a and T08 will call getCustomerForUpdate, so match section 3 (T05) exactly.

DELIVERABLES: src/services/customers.ts (getCustomerForUpdate, findCustomer, toCustomerView, plus list/create/update/
setActive); src/routes/portal/customers.ts (customerRoutes mounted at /api/v1/merchant/customers);
test/db/customers.test.ts.

SPECIFIC RULES:
- Create {customer_code, name, phone?}: code must match ^[A-Z0-9]{1,32}$ (lowercase is rejected with MSG33, never
  upper-cased silently); phone optional, 10 digits starting with 0; balance starts at 0. Duplicate code -> 409 MSG27
  (constraint customers_merchant_id_customer_code_key); duplicate phone within the merchant -> 409 MSG38
  (uq_customer_phone). Use isUniqueViolation with the constraint name. Success MSG28.
- Update: only name and phone (MSG29). The code can never change; a customer_code in the body is ignored. phone null or blank removes
  the phone. {} or nothing valid to change -> 400 MSG33. An unknown customer (or one of another merchant) -> 404 MSG22; a malformed
  code in the path (lowercase, wrong characters) -> 400 MSG33. A blank phone on create also means "no phone".
- List order: newest first (created_at DESC, id DESC); the search text is matched literally (escape % _ \\) and is limited to 100
  characters (MSG33).
- List: search q matches code, name or phone (case-insensitive, parameterised ILIKE), 20 per page, items = CustomerView;
  page that is not an integer >= 1 -> 400 MSG33; a page beyond the last returns empty items.
- Deactivate/reactivate: Owner only. Never delete rows. Write audit CUSTOMER_DEACTIVATED / CUSTOMER_REACTIVATED
  (writeAudit from T02) in the same transaction.
- getCustomerForUpdate: SELECT ... FOR UPDATE filtered by merchant_id AND customer_code; returns CustomerRow or null.
  It must be usable only inside a transaction (document this in a comment). It does NOT check is_active; callers do.
- All queries filter by merchant_id from requireMerchantId.

TEST REQUIRED: create with and without phone; duplicate code MSG27; same phone in two merchants allowed, in one merchant MSG38;
lowercase code MSG33; code cannot change; search; staff calling deactivate -> MSG04; one audit row per deactivate and per reactivate; page=0 -> MSG33; merchant B's customer is invisible to
merchant A (list and update); getCustomerForUpdate blocks a second concurrent transaction until the first commits.

OUT OF SCOPE: issuing and redeeming points (T07), the UI (T13).
```

### T06 · Quy tắc tích điểm (Hải)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.2.1, BR-07, BR-22; `api-spec.md` B.4 (rules); `db-schema.md` bảng `loyalty_rules`; code: `src/types.ts`, `src/lib/{errors,messages}.ts`, `src/services/audit.ts`, `src/middleware/auth.ts`, `test/helpers/*`.

```text
TASK T06 - Loyalty rules.

GOAL: the Owner sets earn_ratio (VND per point) and min_redemption_threshold (points per redemption).
T07a and T09 call getLoyaltyRules, so match section 3 (T06) exactly.

DELIVERABLES: src/services/rules.ts (getLoyaltyRules, toRulesView, saveLoyaltyRules); src/routes/portal/rules.ts
(ruleRoutes at /api/v1/merchant/rules); test/db/rules.test.ts.

SPECIFIC RULES:
- GET /merchant/rules: Owner only; returns {earn_ratio, min_redemption_threshold} or {} when never saved.
- PUT: both values integers between 1 and 1,000,000, otherwise 400 MSG33. Upsert on merchant_id; set updated_by to
  the user. Success 200 MSG05. In the same transaction write audit RULE_UPDATED with details {old, new}.
- Rules change only future transactions (BR-22): do not touch existing transactions.
- getLoyaltyRules returns null when no row exists; the CALLER throws MSG32. Do not throw inside the service.

TEST REQUIRED: 0, negative, 1,000,001, decimal and non-number -> MSG33; first save then update; one audit row per save with
old and new values; staff -> MSG04; merchant isolation; getLoyaltyRules null before first save.

OUT OF SCOPE: using the rules to compute points (T07a).
```

### T07a · Lõi điểm (Hiếu)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.3.2, BR-05, BR-06, BR-07, BR-17, BR-22; `db-schema.md` mục 3, 4, 5, 6 và bảng `transactions`, `customers`; `api-spec.md` mục 0 (Transaction object); code: `src/types.ts`, `src/lib/{errors,messages,codes,pg-errors}.ts`, `src/services/{customers,rules}.ts`, `test/helpers/*`; mục 3 (T07a).

```text
TASK T07a - Points engine: issue and redeem, safe under concurrency.

GOAL: add and spend points so a balance can never be wrong, even with many simultaneous requests.
This module has NO HTTP routes in this task; T07b wraps it with idempotency and adds the endpoints.
Match section 3 (T07a) EXACTLY: other tasks already code against these signatures.

DELIVERABLES: src/lib/proof-hash.ts; src/services/transactions.ts; src/services/points.ts;
tests test/unit/proof-hash.test.ts, test/db/points.test.ts, test/db/points-concurrency.test.ts.

SPECIFIC RULES (order matters):
1) Inside the given transaction: getCustomerForUpdate (null -> MSG22; is_active=false -> MSG39).
2) getLoyaltyRules (null -> MSG32).
3) Validate and compute (first, defensively, before step 1: amount integer 1..1,000,000,000 or points integer
   1..1,000,000, else MSG33; the routes validate too):
   - issue: points = Math.floor(amount / earnRatio) (the remainder is lost, never carried over, BR-17);
     points === 0 -> MSG24; points > 1,000,000 -> MSG33; newBalance > 1,000,000,000 -> MSG33.
     Check order after the input validation: MSG22, MSG39, MSG32, MSG24, then the two MSG33 ceilings.
   - redeem: points integer 1..1,000,000 (else MSG33); points < minRedemptionThreshold -> MSG09 (checked FIRST);
     balance < points -> MSG08.
4) UPDATE customers SET balance, updated_at. 5) insertTransaction.
- insertTransaction: type ISSUE stores bill_amount and earn_ratio used; REDEEM stores them as null; performed_by from actor
  (exactly one of user/api key); balance_after; code from generateTxCode, retry with a new code only on a unique violation
  of the transactions.code constraint (max 5 tries); created_at is generated ONCE in code (UTC, rounded to milliseconds), used both for the INSERT and for the proof
  hash (never rely on the database default), formatted ISO 8601 with a trailing Z; proof_hash = computeProofHash(...) over exactly the fields in db-schema.md section 4 (REVERSAL adds
  reverses_transaction_id = the original's code). Return a TransactionRow joined with customerCode.
- computeProofHash: canonical JSON with keys sorted alphabetically, no whitespace, UTF-8, sha256 lowercase hex.
  It MUST reproduce the test vector in db-schema.md section 4.
- toTransactionView: snake_case JSON from api-spec.md section 0; explorer_url = template with {digest} replaced, only
  when status is ANCHORED, else null.
- issuePoints/redeemPoints use withTransaction(sql, fn) and call the InTx versions.
- Numbers are plain integers; never use floating point except Math.floor on a division of two integers.

TEST REQUIRED: proof-hash vector; points formula table (100000/10000=10, 99999/10000=9, 15000 at 10000 per point = 1 with the remainder lost, 9999/10000 -> MSG24);
calculated points above 1,000,000 (amount 1,000,000,000 at earn_ratio 1) -> MSG33; balance above 1,000,000,000 -> MSG33;
each error code in the order above (e.g. below minimum AND insufficient balance -> MSG09); inactive customer; ceilings;
CONCURRENCY: 20 simultaneous redeems of 10 points on a balance of 50 -> exactly 5 succeed, 15 fail with MSG08, final balance 0;
20 simultaneous issues -> balance equals the sum; after all tests, the consistency query of db-schema.md section 6 holds
(balance = sum of ISSUE + REVERSAL-of-REDEEM - REDEEM - REVERSAL-of-ISSUE); code collision retry (simulate by inserting the
same code first); a failed operation leaves balance and ledger unchanged.

OUT OF SCOPE: HTTP routes, idempotency, reversal (T08), anchoring.
```

### T07b · Chống gửi trùng và endpoint cộng/đổi điểm của portal (Duy)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS BR-10, 3.2.3.2 (bước 6), CR-04; `db-schema.md` bảng `idempotency_keys` và mục 5; `api-spec.md` A.1, B.1, B.4 (issue, redeem); code: `src/types.ts`, `src/services/{points,transactions,audit}.ts`, `src/lib/{errors,messages}.ts`, `src/middleware/auth.ts`, `src/index.ts`, `test/helpers/*`; mục 3 (T07b).

```text
TASK T07b - Idempotency and the portal issue/redeem endpoints.

GOAL: a repeated request produces exactly one transaction and returns the first response. T09 uses
the same functions for the external API, so match section 3 (T07b) EXACTLY.

DELIVERABLES: src/services/idempotency.ts (readIdempotencyKey, hashRequest, withIdempotency);
src/services/maintenance.ts (cleanupExpired); src/routes/portal/points.ts (portalPointsRoutes mounted at
/api/v1/merchant/customers: POST /:code/issue and POST /:code/redeem); a daily call to cleanupExpired in
src/index.ts; tests test/db/idempotency.test.ts, test/db/portal-points.test.ts.

SPECIFIC RULES:
- withIdempotency opens ONE transaction with withTransaction(sql, fn) and in this order:
  1) pg_advisory_xact_lock(hashtextextended(scope_id::text || ':' || key, 0)) where scope_id is apiKeyId or userId;
  2) look for a saved row of the same scope and key; if older than 24 hours delete it and continue;
     same request_hash -> return the saved {status, body} with replayed=true WITHOUT running execute;
     different request_hash -> AppError('MSG34');
  3) run execute(tx); 4) insert the idempotency row with the response; 5) commit.
  If execute throws, the transaction rolls back, so nothing is saved and the same key can be retried.
- hashRequest(method, target, body) = sha256hex(METHOD + '.' + target + '.' + sha256hex(body)).
- readIdempotencyKey: missing or empty or longer than 128 characters -> AppError('MSG33'). Same scope rules for
  portal (scope = USER) and external (scope = API_KEY, used by T09).
- Portal endpoints: session + CSRF header + role OWNER or STAFF; body validated with zod ({amount} or {points}); key from
  the X-Idempotency-Key header; call withIdempotency(sql, {scope:{kind:'USER', userId}, key, requestHash}, tx =>
  issuePointsInTx(tx, {...actor:{kind:'USER', userId}}) mapped with toTransactionView(row, config.SUI_EXPLORER_TX_URL)
  and status 201). requestHash uses the request body bytes.
- cleanupExpired deletes idempotency_keys older than 24 hours and sessions that are expired or revoked; returns the counts.

TEST REQUIRED: same key + same body twice -> one transaction, identical response, second has replayed=true;
two simultaneous identical requests -> one transaction; same key + different body -> MSG34; failing request (MSG08) then
retry with the same key after fixing the cause succeeds; missing key -> MSG33; same key for two different users is
independent; a row older than 24 hours is ignored; cleanupExpired counts; portal endpoints end to end with real session
cookies (use createTestApp, loginCookie, portalHeaders), including a customer of another merchant -> MSG22.

OUT OF SCOPE: the external gateway (T09), reversal (T08).
```

### T08 · Sổ cái và huỷ giao dịch (Hải)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.5.1, 3.2.5.2, BR-03, BR-05, BR-21; `api-spec.md` mục 0, B.3 (ledger), B.4 (ledger, reverse); `db-schema.md` mục 3 (trigger), 5 (Reversal) và bảng `transactions`; code: `src/types.ts`, `src/services/{customers,transactions,audit}.ts`, `src/lib/{errors,messages}.ts`, `src/middleware/auth.ts`, `test/helpers/*`; mục 3 (T08).

```text
TASK T08 - Ledger view and reversal.

GOAL: list transactions with filters, and let the Owner reverse an ISSUE or REDEEM by creating a
REVERSAL; the original row is never modified. Match section 3 (T08) EXACTLY.

DELIVERABLES: src/services/ledger.ts (listLedger, reverseTransaction); src/routes/portal/ledger.ts
(merchantLedgerRoutes at /api/v1/merchant/ledger, adminLedgerRoutes at /api/v1/admin/ledger);
tests test/db/ledger-list.test.ts, test/db/reversal.test.ts.

SPECIFIC RULES:
- listLedger: newest first (created_at DESC, id DESC), 20 per page; filters type, status, customerCode, dateFrom/dateTo
  (YYYY-MM-DD, inclusive, interpreted in UTC+7 = Asia/Ho_Chi_Minh), merchantCode (Admin only). scope.merchantId null means
  Admin (all merchants, read only). Each item = LedgerItem; explorer_url only when ANCHORED; performed_by.label is the user's
  full name or the masked key id; reversible is true only when includeReversible is set, the type is ISSUE or REDEEM, and no
  REVERSAL exists for it.
- reverseTransaction (Owner only) in ONE transaction, in this order: (1) find the original by code and merchant (missing -> MSG22);
  (2) getCustomerForUpdate on its customer; (3) RE-READ the original and check it is ISSUE or REDEEM and has no REVERSAL
  (else MSG26) - this check must come AFTER the lock; (4) ISSUE reversal subtracts the points: balance < points -> MSG25;
  REDEEM reversal adds them: new balance above 1,000,000,000 -> MSG41; (5) update the balance, insertTransaction type REVERSAL with
  the same points and reverses {id, code}; (6) audit REVERSAL_CREATED. Success MSG19 (returned by the route).
- The anchoring status of the original does not matter, and the customer MAY be inactive: do NOT check is_active in a reversal.
  A REVERSAL can never be reversed (the database trigger also enforces this).
- page that is not an integer >= 1 -> 400 MSG33; a page beyond the last returns empty items.
- Routes: Owner for reverse; Owner and staff for the merchant list; Admin for admin list. merchant_id from the session.

TEST REQUIRED: filters (each one, UTC+7 around midnight); Admin sees several merchants, merchant users only their own; Admin cannot
reverse (MSG04); staff cannot reverse (MSG04); reverse ISSUE success; reverse REDEEM success; MSG25; MSG41; second reversal MSG26;
reversing a REVERSAL MSG26; TWO SIMULTANEOUS reversals of the same transaction -> one success, one MSG26; original row unchanged;
reversing another merchant's transaction -> MSG22; reversal works when the original is PENDING_ANCHOR and when it is FAILED, and for an inactive customer; page=0 -> MSG33.

OUT OF SCOPE: the UI, anchoring.
```

### T09 · Cổng API ký HMAC (Đạt)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.3.4, UC-15, BR-08, BR-09, BR-10; `api-spec.md` mục 0 và **toàn bộ mục A** (kể cả 3 ví dụ chữ ký); code: `src/types.ts`, `src/lib/{hmac,request-target,errors,messages}.ts`, `src/lib/crypto.ts`, `src/services/{apikeys,idempotency,points,transactions,customers,rules,ledger}.ts`, `src/config.ts`, `test/helpers/*`; mục 3 (T09).

```text
TASK T09 - External API gateway (API key + HMAC) and the external endpoints.

GOAL: every call from a POS is verified; the merchant is identified ONLY by the API key.
Reuse lib/hmac.ts and lib/request-target.ts (already tested). Match section 3 (T09) EXACTLY.

DELIVERABLES: src/middleware/api-key.ts (requireApiKey); src/routes/external/points.ts (externalPointsRoutes at
/api/v1/points), src/routes/external/customers.ts (externalCustomerRoutes at /api/v1/customers),
src/routes/external/rules.ts (externalRulesRoutes at /api/v1/loyalty-rules, Should); tests test/db/gateway.test.ts.

SPECIFIC RULES:
- Read the RAW body bytes before any JSON parsing (await c.req.arrayBuffer()), keep them in c.var.rawBody, and parse
  JSON from those bytes afterwards.
- Request target: use the Node request target as sent (c.env.incoming.url with @hono/node-server; fall back to
  requestTarget(c.req.url) when it is absent, e.g. in tests). Never rebuild the query string.
- Verification order, stop at the first failure (api-spec A.2): (1) X-API-Key present, findApiKeyForAuth finds it,
  key status ACTIVE and merchant status ACTIVE, otherwise 401 MSG18; (2) X-Timestamp an integer within +-300 seconds of the
  server time, otherwise 401 MSG17 with extra { server_time }; (3) X-Signature present and verifySignature(secret, parts,
  signature) where parts.idempotencyKey is the X-Idempotency-Key header value or '' , otherwise 401 MSG16;
  (4) body/query validation with zod -> 400 MSG33; (5) POST issue/redeem need X-Idempotency-Key (readIdempotencyKey).
- Business logic: withIdempotency(sql, {scope:{kind:'API_KEY', apiKeyId}, key, requestHash}, tx => issuePointsInTx / redeemPointsInTx,
  actor {kind:'API_KEY', apiKeyId}) and respond 201 with toTransactionView. Balance, transactions (20 per page, ordered by created_at DESC then id DESC, invalid page -> MSG33, filters
  type/status/date_from/date_to in UTC+7) and loyalty-rules per api-spec A.3. Unknown customer -> 404 MSG22.
- Do not create CORS support and never read merchant_id from the request.

TEST REQUIRED: the three vectors of api-spec A.2 through the real middleware; each failure in the stated order (missing/unknown key,
SUSPENDED key, REVOKED key, SUSPENDED merchant -> MSG18; timestamp 301 s old and 301 s in the future -> MSG17; wrong signature, altered
body, altered query, altered idempotency key -> MSG16); replay of an identical signed request creates one transaction (same idempotency
key); the same signed body with a new idempotency key and a stale timestamp -> MSG17; a customer of another merchant -> MSG22; end to end
issue then redeem then balance then transactions.

OUT OF SCOPE: SDK (T14), anchoring.
```

### T10 · API bảng thống kê (Hiệp)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.2.6; `api-spec.md` B.3 và B.4 (dashboard); `db-schema.md` mục 6; code: `src/types.ts`, `src/middleware/auth.ts`, `src/lib/errors.ts`, `test/helpers/*`.

```text
TASK T10 - Dashboard counters.

DELIVERABLES: src/services/dashboard.ts (adminDashboard, merchantDashboard with their View types declared in the
file, exactly the JSON of api-spec B.3 and B.4); src/routes/portal/dashboard.ts (adminDashboardRoutes at
/api/v1/admin/dashboard, merchantDashboardRoutes at /api/v1/merchant/dashboard); test/db/dashboard.test.ts.

SPECIFIC RULES: use the SQL of db-schema.md section 6. "Today" is the current date in Asia/Ho_Chi_Minh. Admin: merchant counts by
status, total customers of ALL merchants whatever their status, points issued = ISSUE minus REVERSAL of ISSUE, points redeemed = REDEEM
minus REVERSAL of REDEEM. Merchant (Owner only): total customers, circulating points (sum of balances), today's transactions of ALL types
and statuses. Counts and sums are integers (bigint -> number).

TEST REQUIRED: numbers on seeded data that includes reversals of both types; a transaction just before and just after midnight UTC+7;
staff -> MSG04 on the merchant dashboard; a merchant sees only its own numbers; empty database returns zeros.

OUT OF SCOPE: the screens (T13).
```

### T11 · Hợp đồng Move (Đạt)

**Gói ngữ cảnh:** `docs/anchoring.md` mục 1–2; SRS 3.2.2.2, BR-13, BR-20, LI-02; `docs/spikes.md` (S2).

```text
TASK T11 - Move contract for anchoring (Sui Testnet).

GOAL: a minimal contract that stores a transaction id and a 32-byte proof hash, rejects duplicates and can be
written only by the platform wallet. T12 calls it from the backend, so keep module, function, abort codes and event
EXACTLY as in docs/anchoring.md section 1.

DELIVERABLES: contracts/anchor/Move.toml; contracts/anchor/sources/anchor.move; contracts/anchor/tests/anchor_tests.move;
a short note in docs/spikes.md (S2 result) with the PACKAGE_ID and the AnchorRegistry object id.

SPECIFIC RULES: module octapoint::anchor; AnchorRegistry (key, owned, created in init and transferred to the publisher) with a
Table<String, vector<u8>>; entry fun anchor(registry: &mut AnchorRegistry, tx_id: String, proof_hash: vector<u8>, clock: &Clock);
abort 1 (E_DUPLICATE) when tx_id already exists; abort 2 (E_BAD_HASH) when proof_hash length is not 32; emit event Anchored {tx_id,
proof_hash, anchored_at_ms}. No balances and no personal data on-chain (BR-20). The sketch in anchoring.md is only a sketch: adapt
the syntax to the installed Sui version and say which version you used.

TEST REQUIRED (Move unit tests): new id succeeds and emits the event; same id again aborts with 1; hash of 31 and 33 bytes aborts with 2.
Then give me the exact CLI commands to build, test, publish to Testnet, and call anchor once, and how to find the digest on the Explorer.

OUT OF SCOPE: any backend code.
```

### T12 · Worker neo bằng chứng (Hiếu)

**Gói ngữ cảnh:** `CLAUDE.md`; `docs/anchoring.md` mục 3–5; SRS 3.2.5.3, BR-11, BR-12, LI-08; `db-schema.md` bảng `transactions` và trigger; code: `src/types.ts`, `src/config.ts`, `src/index.ts`, `src/lib/logger.ts`, `src/services/transactions.ts`, `test/helpers/*`; mục 3 (T12); PACKAGE_ID và registry id từ T11.

```text
TASK T12 - Anchoring worker.

GOAL: transactions are saved first (PENDING_ANCHOR); a background worker later writes their proof to the Move
contract. Sui failures must never change balances. Match section 3 (T12) EXACTLY. All logic is tested against a FAKE
SuiAnchorPort; the real adapter is thin.

DELIVERABLES: src/services/anchoring.ts (SuiAnchorPort, AnchorDuplicateError, runAnchorOnce, startAnchorWorker);
src/services/sui-client.ts (createSuiAnchorPort using @mysten/sui); src/index.ts starts the worker only when
config.ENABLE_ANCHOR_WORKER is true; tests test/db/anchoring.test.ts and a short manual test note.

SPECIFIC RULES:
- Claim query: use the one in docs/anchoring.md section 3 (FOR UPDATE SKIP LOCKED, ORDER BY created_at, id, lease of 2 minutes by
  moving next_attempt_at forward), short transaction.
- Process claimed rows ONE AT A TIME (single gas coin). Success: UPDATE ... SET status='ANCHORED', sui_digest, last_error=NULL
  WHERE id AND status='PENDING_ANCHOR'.
- AnchorDuplicateError: an earlier attempt already succeeded. Call findDigestByTxCode (newest events first, at most 20 pages of 50
  events); digest found -> ANCHORED; not found -> treat it as a COUNTED failure (below).
- TemporarySuiError (network error or timeout, RPC unavailable or 5xx, RPC rate limit, insufficient gas or no gas coin, object-version
  conflict) is NOT an attempt: leave attempt_count unchanged, set next_attempt_at = now + 5 minutes, save a short last_error, log a
  warning (for gas: "platform wallet balance too low"), and STOP the run. The other claimed rows return when their lease ends. The row
  stays PENDING_ANCHOR as long as the problem lasts. If a timeout hid a transaction that really succeeded, the next try ends in
  AnchorDuplicateError and is repaired.
- Any other failure (contract abort other than E_DUPLICATE, invalid arguments, unexpected response) is COUNTED: attempt = attempt_count + 1.
  If attempt <= 5: attempt_count = attempt, next_attempt_at = now + [1,2,4,8,16][attempt-1] minutes, last_error = a SHORT message with no
  secrets. If attempt = 6: status = 'FAILED' (final) and attempt_count = 6.
- Only these columns may be updated: status, sui_digest, attempt_count, next_attempt_at, last_error. Never touch customers.balance.
- The worker must not overlap with itself: if the previous run is still going, skip the tick. Log with lib/logger.ts, never the private key.
- sui-client.ts: proofHashHex (64 hex chars) -> 32 bytes; call target `${SUI_PACKAGE_ID}::anchor::anchor` with the registry object,
  the code string, the bytes and the Clock object 0x6; success only when the transaction effects status is success; map the Move abort
  code 1 to AnchorDuplicateError and every temporary infrastructure error listed above to TemporarySuiError; findDigestByTxCode queries events of type `${SUI_PACKAGE_ID}::anchor::Anchored` and matches tx_id.
  Do not guess @mysten/sui method names: read the installed package types and tell me which version you used.

TEST REQUIRED (fake port, injectable delays): success; the full retry schedule 1,2,4,8,16 minutes then FAILED on the 6th COUNTED failure;
temporary errors never change attempt_count, never produce FAILED however many times they repeat, use the 5-minute delay and stop the run
(rows claimed later in the same run are untouched);
FAILED and ANCHORED never change again; duplicate with digest found; duplicate with digest not found; two simultaneous runs never
process the same row; balances unchanged after failures; batch size respected; rows with a future next_attempt_at are skipped.

OUT OF SCOPE: the contract (T11), the UI.
```

### T13a · Web portal: khung, đăng nhập, màn Admin (Hiệp)

**Gói ngữ cảnh:** `CLAUDE.md`; SRS 3.1.2–3.1.6 và các sơ đồ trong `docs/diagrams`; `api-spec.md` mục 0, B.1–B.3; `docs/config-and-deploy.md` mục 3; `apps/api/src/lib/messages.ts`; code: `apps/web/*`.

```text
TASK T13a - Web portal: layout, login, registration, Admin screens.

GOAL: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. The browser talks only to relative URLs /api/v1/... (the proxy in
next.config.mjs forwards them). Hiding menus by role is only a convenience: the server enforces permissions.

DELIVERABLES (exact paths):
- apps/web/src/lib/api-types.ts: TypeScript types that MIRROR api-spec.md (snake_case JSON); no imports from apps/api
- apps/web/src/lib/api-client.ts: one typed function per endpoint used; it always sends credentials, JSON, and the header
  X-Requested-With: octapoint-portal on POST/PUT/PATCH/DELETE; on a non-2xx it throws ApiError {code, message, status} using the body
  { code, message } of CR-06; on 401 with code MSG35 it redirects to /login
- apps/web/src/lib/messages.ts: map of MSG code -> text copied from apps/api/src/lib/messages.ts (codes and texts only)
- layout and role-based menu (Admin, Owner, Staff), pages: /login (shared by all roles, redirects by the `redirect` field),
  /register, /admin (dashboard), /admin/merchants (Approve/Suspend with the allowed transitions only), /admin/ledger, /account
- a mock mode (NEXT_PUBLIC_USE_MOCKS=true) that returns fixture data of the SAME shapes while the API is not ready

SPECIFIC RULES: show server messages with the text from messages.ts (success as toast, validation errors inline); never invent texts;
buttons are disabled while a request is running; no secrets or tokens in localStorage (the session is an HttpOnly cookie);
the Suspend/Approve buttons appear only for the statuses that allow them (PENDING: Approve; ACTIVE: Suspend; SUSPENDED: Approve).

TEST REQUIRED: simple component or function tests for api-client error handling (MSG35 redirect, ApiError mapping) and for the role
menu; plus a manual checklist of each screen written in the PR description.

OUT OF SCOPE: merchant screens (T13b).
```

### T13b · Web portal: màn hình cửa hàng (Hiệp)

**Gói ngữ cảnh:** như T13a; SRS 3.1.2 (màn 3–10), 3.2.3–3.2.5; `api-spec.md` B.4; code của T13a.

```text
TASK T13b - Web portal: merchant screens.

DELIVERABLES: pages /dashboard, /customers (list, create, edit, deactivate/reactivate for Owner, search, Issue/Redeem dialog),
/rules (Owner), /api-keys (Owner), /staff (Owner), /ledger (filters, status badge, Explorer link, Reverse for Owner); additions to
apps/web/src/lib/api-client.ts and api-types.ts only (same conventions as T13a).

SPECIFIC RULES:
- Issue/Redeem dialog: generate crypto.randomUUID() ONCE when the dialog opens for a submission, send it as X-Idempotency-Key, keep the same
  value if the user retries the same submission, disable the confirm button while sending; show MSG06 / MSG07 (with {points} and {new_balance})
  and then MSG20 text as in the SRS; show server errors (MSG08, MSG09, MSG24, MSG32, MSG39) inline.
- API key secret: shown in a modal exactly once with MSG11; it is not kept in state after the modal is closed.
- Ledger status badges: PENDING_ANCHOR, ANCHORED (link to explorer_url), FAILED. Do NOT implement a toast for MSG21: anchoring is shown
  by the status label only. The Reverse button appears only when the item has reversible=true.
- Staff must not see Owner-only menu entries or pages.

TEST REQUIRED: dialog behaviour (one key per submission, double click sends once, error display); secret modal; role-based visibility; a manual
checklist of every screen against SRS 3.1.2.

OUT OF SCOPE: new endpoints. If an endpoint you need is missing from api-spec.md, report it; do not invent it.
```

### T14 · SDK (Đạt)

**Gói ngữ cảnh:** SRS 3.2.3.5; `api-spec.md` A.1–A.3 và C.2; code: `apps/api/src/lib/hmac.ts` và `hmac.test.ts` (để so ví dụ); mục 3 (T14).

```text
TASK T14 - TypeScript SDK (Node.js 20+, uses global fetch, no runtime dependencies).

GOAL: a client that signs requests exactly like the gateway. Public API EXACTLY as in docs/ai-prompts.md section 3 (T14).

DELIVERABLES: packages/sdk/src/index.ts (and small files it re-exports); packages/sdk/test/*.test.ts with vitest added as a
devDependency of the package and a "test" script; packages/sdk/README.md with a runnable example.

SPECIFIC RULES:
- Signing string and signature: api-spec.md A.2 (timestamp in Unix SECONDS, method uppercase, target = path + query exactly as sent,
  sha256 hex of the raw body bytes, X-Idempotency-Key value or empty string, HMAC-SHA256 lowercase hex). Implement with node:crypto.
- Every request sends X-API-Key, X-Timestamp, X-Signature. issuePoints/redeemPoints also send X-Idempotency-Key (crypto.randomUUID()
  unless idempotencyKey is given). No automatic retries.
- JSON -> camelCase mapping is explicit and complete (transaction_id -> transactionId, page_size -> pageSize, ...). Do not leak snake_case.
- Non-2xx: throw OctaPointError { code, message, httpStatus, serverTime? } from the CR-06 body (serverTime = body.server_time, only for MSG17); a network error or timeout (timeoutMs, default 10000, use
  AbortController) throws OctaPointError with code 'NETWORK_ERROR' and httpStatus 0.
- The same body bytes that are signed must be the bytes that are sent (serialise once).

TEST REQUIRED: the three vectors of api-spec.md A.2 using the injected nowSeconds and a fake fetch (check headers and signature; for vector 3 check that
the signature changes when only the idempotency key changes); MSG17 error exposes serverTime;
camelCase mapping; error mapping; timeout; idempotency key auto-generated and honoured when supplied; the signed target includes the query
string in the same order as sent.

OUT OF SCOPE: publishing to npm (LI-10).
```

### T15 · MCP Server (Duy)

**Gói ngữ cảnh:** SRS 3.2.4.1, BR-14, LI-05; `api-spec.md` C.1; `packages/sdk/src/index.ts` và README của T14.

```text
TASK T15 - MCP server (stdio, READ-ONLY).

GOAL: let an AI assistant read a customer's balance and recent transactions. The server must expose ONLY read tools.

DELIVERABLES: packages/mcp/src/index.ts (entry, stdio), packages/mcp/src/tools.ts (tool definitions), packages/mcp/test/tools.test.ts,
packages/mcp/README.md with a Claude Desktop configuration example.

SPECIFIC RULES:
- Use @modelcontextprotocol/sdk and @octapoint/sdk (workspace). Configuration only from OCTAPOINT_BASE_URL, OCTAPOINT_API_KEY,
  OCTAPOINT_API_SECRET; fail at start-up with a clear message when one is missing; never print the secret.
- The server trims and UPPER-CASES customer_code before calling the API (the API itself stays strict: lowercase -> MSG33).
- Tools and outputs exactly as api-spec.md C.1: get_balance({customer_code}) -> {customer_code, balance}; list_transactions({customer_code})
  -> latest 10, newest first, each {transaction_id, type, points, status, sui_digest} (snake_case: map from the SDK's camelCase);
  get_loyalty_rules() (Should) -> {earn_ratio, min_redemption_threshold}.
- API errors become MCP tool errors that keep the original code and message (invalid credentials -> MSG18, unknown customer -> MSG22).
- Register NO tool that can issue, redeem, reverse or change anything (BR-14). Export the list of tool names so a test can assert it.
- Check the installed @modelcontextprotocol/sdk types before writing code and tell me the version; do not guess method names.

TEST REQUIRED: customer_code ' cus001 ' is sent as CUS001; the registered tool names equal exactly the read-only list; output mapping with a fake SDK client; error pass-through; missing
environment variable message; a test that fails if a tool with a name containing issue, redeem, reverse, create, update or delete is added.

OUT OF SCOPE: remote (HTTP) transport.
```

### T16a · Kiểm thử thủ công (Đạt)

**Gói ngữ cảnh:** SRS toàn bộ phần chức năng (UC, BR, CR, MSG); `docs/implementation-plan.md` mục "Cross-cutting scenarios"; `docs/api-spec.md`.

```text
TASK T16a - Manual test checklist and report (no application code).

GOAL: a checklist that covers EVERY use case (UC-01..UC-18) and EVERY business rule (BR-01..BR-22) and common requirement (CR-xx) of the SRS.

DELIVERABLES: docs/test-checklist.md (table: ID, covers [UC/BR/CR], precondition, steps, expected result with the exact MSG code, result Pass/Fail,
tester, date, bug link); docs/postman/octapoint.postman_collection.json for the external API including the signing pre-request script and the
test vectors; docs/test-report.md template.

SPECIFIC RULES: each test case checks ONE thing and states the exact expected message code and HTTP status from messages.ts / api-spec.md; never write
"works correctly". Include the cross-cutting scenarios of implementation-plan.md and concurrency cases (parallel requests with the Postman runner).
After the table, add a coverage matrix listing every UC and BR with the test ids that cover it, and flag any uncovered one.
Do not invent expected results: where the SRS is silent, mark the case "NEEDS DECISION" and list it under QUESTIONS.

OUT OF SCOPE: fixing bugs.
```

### T16b · Tài liệu và triển khai (Hải)

**Gói ngữ cảnh:** SRS mục II.3; `docs/config-and-deploy.md`; `docs/spikes.md`; danh sách PR đã gộp.

```text
TASK T16b - Keep documents true to the code, deploy, and package the release.

DELIVERABLES: updated docs/PROJECT_REPORT_FIXED.md, docs/api-spec.md, docs/db-schema.md and docs/diagrams/* to match the merged code;
docs/INSTALL.md (step by step from a clean machine: tools, .env, docker compose, migrate, seed, run, publish the contract, deploy);
docs/USER_MANUAL.md (screens and flows for Admin, Owner, Staff, with the real message texts); deployment of web (Vercel), API+worker
(Render or Railway, ONE instance with ENABLE_ANCHOR_WORKER=true) and PostgreSQL; release tag on main.

SPECIFIC RULES: for every merged pull request, compare the code with the documents and list each difference in a table "document says / code does /
which is right"; the owner of the code decides, then the wrong side is fixed in a pull request. Never silently edit a document to match a bug.
The Installation Guide must be tested by following it literally on a clean checkout and noting every step that fails.

OUT OF SCOPE: code changes (create tickets for the owners instead).
```

### T16c · Diễn tập demo (Đạt)

**Gói ngữ cảnh:** SRS mục 2 (Objective 5, kịch bản demo); `docs/test-checklist.md`; `docs/spikes.md`.

```text
TASK T16c - Demo rehearsal script.

DELIVERABLES: docs/demo-script.md: ordered steps of the demo (register, approve, set rule, create API key, add customer, issue, redeem,
ledger and digest, SDK call, MCP query), each with who does it, exact test data, expected result and the message shown; a "before the demo"
checklist (wake up the free-tier servers, wallet gas balance, one already ANCHORED sample transaction, browser state, .env for the MCP client);
a "if something fails" table (Testnet down -> show the prepared ANCHORED transaction and explain asynchronous anchoring; API cold start -> ...).

SPECIFIC RULES: use only features that exist in the SRS and are verified in the checklist. Each step has a measurable expected result.
Do not promise features that are not implemented.
```

---

## 8. Prompt dùng chung

### 8.1 Prompt review (cho người xem lại)

Dán prompt nền trước, rồi dán nội dung dưới đây cùng **diff của pull request** và mục "Xong khi" của thẻ.

```text
You are reviewing a pull request for task <Txx>. I attach: the task prompt, the acceptance criteria, the diff, and docs/ai-prompts.md.
Review ONLY against the documents; do not suggest new features. Answer with a table (check, PASS/FAIL, file and line, short reason):
1. Every deliverable path exists; no file owned by another task was edited (except one import + one route line in routes/index.ts).
2. Exported function names, parameter order and types match docs/ai-prompts.md section 3 and src/types.ts exactly.
3. Error codes and HTTP statuses match messages.ts and api-spec.md; no invented message text.
4. Every SQL statement on merchant data filters by merchant_id; merchant_id never comes from the request body, query or path.
5. Points-changing code runs in one transaction and locks the customer row BEFORE the checks; the order of checks matches the task prompt.
6. No secret, password, signature, token or private key is logged or returned.
7. Each acceptance criterion has a test; list criterion -> test; tests use createTestDatabase() and never TRUNCATE/DELETE.
8. Anything that differs from the SRS, api-spec or db-schema (list it), and anything added that is not in the documents.
Then list BLOCKING problems first and NON-BLOCKING suggestions last.
```

### 8.2 Prompt sửa lỗi (khi lint, typecheck hoặc test báo đỏ)

```text
Below is the exact output of a failing command and the files involved. Find the ROOT CAUSE before changing anything and explain it in two sentences.
Then give the smallest change that fixes it. Rules: do not change a test just to make it pass (if you believe the test is wrong, prove it from the
SRS/api-spec and say so); do not change shared types or signatures (docs/ai-prompts.md section 3); do not add features; do not silence errors with
`any`, `@ts-ignore` or by deleting checks. After the fix, list which acceptance criteria could be affected and which tests to re-run.
<paste the command, its full output, and the relevant files>
```

### 8.3 Prompt khi code của hai task không khớp nhau

```text
My code (task <Txx>) and the code or contract of task <Tyy> do not fit. Here are both signatures or files: <paste>.
Do NOT change either side yet. List the differences, say which one matches docs/ai-prompts.md section 3 and src/types.ts, and propose the
minimal change on the side that is wrong. If both match the document but still fail, tell me which document line is ambiguous so I can ask Hải.
```

### 8.4 Prompt đồng bộ tài liệu (sau khi code đã chốt, cho Hải)

```text
Compare this merged code with docs/api-spec.md and docs/db-schema.md. Output three lists: (a) things the code does that the documents do not
say, (b) things the documents say that the code does not do, (c) things that differ. For each item give the file/section and a one-line proposal.
Do not edit anything; I will decide which side is right.
```

---

## 9. Checklist trước khi mở pull request

- [ ] Đã đọc hết mục "Cần có trước" của thẻ và task chặn đã `Done`.
- [ ] AI đã đưa **Kế hoạch** và tôi đã trả lời các câu hỏi trước khi nó viết code.
- [ ] Tên hàm, tham số và kiểu **trùng khít** với mục 3 và `src/types.ts`.
- [ ] Không sửa file của task khác; `routes/index.ts` chỉ thêm đúng 2 dòng.
- [ ] Mọi mã lỗi lấy từ `messages.ts`; không có chữ thông báo tự nghĩ ra.
- [ ] Mọi truy vấn dữ liệu cửa hàng đều lọc `merchant_id` lấy từ phiên hoặc khoá API.
- [ ] Mỗi tiêu chí "Xong khi" có ít nhất một test, và test dùng `createTestDatabase()`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` xanh **trên máy tôi** với database đang chạy.
- [ ] Không có bí mật nào trong log, trong code hay trong commit.
- [ ] Tài liệu đã sửa nếu có thay đổi; danh sách "lệch so với tài liệu" (Bước 5 của AI) đã gửi cho người xem lại.
- [ ] Tiêu đề PR bắt đầu bằng mã task; thẻ Jira chuyển sang `In Review`.

Nếu một dòng không đánh dấu được, **dừng lại và hỏi**, đừng mở PR.
