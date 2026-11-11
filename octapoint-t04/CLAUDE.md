# CLAUDE.md – OctaPoint

Rules for developers and AI assistants working in this repository. Read this file first, then the documents in `docs/`.

## 1. What OctaPoint is

A blockchain-backed Credit-as-a-Service (loyalty points) platform. **Academic MVP, Sui Testnet only.** A merchant issues and redeems points for its customers through a web portal, a REST API, a TypeScript SDK or a read-only MCP server. PostgreSQL holds all balances. Sui only stores a proof hash of each transaction.

## 2. Source of truth (priority order)

1. `docs/PROJECT_REPORT_FIXED.md` – the SRS. It wins over everything else.
2. `docs/db-schema.md`, `docs/api-spec.md`, `docs/anchoring.md` – turn the SRS into tables, endpoints and the worker.
3. `docs/config-and-deploy.md` – layout, environment variables, deployment.
4. `docs/implementation-plan.md` – task order (T00–T16) and acceptance criteria.
5. `apps/api/src/types.ts` and the function signatures in `docs/ai-prompts.md` section 3 – the contracts between tasks. Never rename or reorder them; propose a change instead and update both places in one pull request.

When you use an AI assistant, follow `docs/ai-prompts.md` (base prompt, one prompt per task, review prompt).

If two documents disagree, follow the higher one and **fix the lower one in the same pull request**. If something is missing, ask; do not invent behaviour. Never add a feature that is not in the SRS (see section 8).

## 3. Stack and layout

- Backend: Node.js 20+, TypeScript (strict), Hono, PostgreSQL 16+ with plain SQL (`postgres` or `pg`, no heavy ORM), `zod`, `bcryptjs`.
- Frontend: Next.js (App Router), TypeScript, Tailwind, shadcn/ui. Desktop-first, English only.
- Blockchain: Sui Testnet, Move, `@mysten/sui`. MCP: `@modelcontextprotocol/sdk`.
- Tests: `vitest`. Package manager: `pnpm` workspaces.

```
apps/api         Hono API, anchoring worker, migrations, seed and reset scripts
apps/web         Next.js portal (proxies /api/* to the API, same-origin cookie)
packages/sdk     TypeScript SDK (not published to npm)
packages/mcp     MCP server (stdio), built on packages/sdk
contracts/anchor Move package
docs/            the documents listed in section 2
```

## 4. Commands

```
corepack enable && pnpm install
docker compose up -d db                 # local PostgreSQL 16 (needed by DB tests and the API)
pnpm lint
pnpm typecheck
pnpm test                               # all automated tests (needs the database)
pnpm test:unit                          # only tests that need no database
pnpm --filter api migrate               # apply SQL migrations in order
pnpm --filter api seed:admin            # first Admin (refuses if one exists)
pnpm --filter api reset:password -- <email>   # manual password reset (LI-14)
pnpm --filter api dev                   # API; set ENABLE_ANCHOR_WORKER=true on ONE instance only
pnpm --filter web dev
cd contracts/anchor && sui move build && sui move test
```

Copy `.env.example` to `.env` in the **repository root** (git-ignored); the API and the web app both read it. Every variable is listed in `docs/config-and-deploy.md`.

**Testing rule:** database tests get a throw-away database from `createTestDatabase()` (`apps/api/test/helpers/db.ts`). The ledger forbids `DELETE` and `TRUNCATE`, so never clean tables in tests. Passwords are always hashed with `hashPassword`/`verifyPassword` (`lib/password.ts`), never with bcrypt directly.

## 5. Non-negotiable rules

**Money and numbers**
- Points, amounts and balances are `bigint` in the database and integers in code. Never floating point.
- `points = floor(amount / earn_ratio)`. The remainder is lost. Result 0 → MSG24. Result above 1,000,000 → MSG33.
- Ceilings (CR-02): bill ≤ 1,000,000,000 VND, points per request ≤ 1,000,000, balance ≤ 1,000,000,000.

**Tenant isolation (BR-01)**
- `merchant_id` always comes from the session or the API key. Never from the request body, path or query.
- Every query on merchant data filters by `merchant_id`. Add a test for every new endpoint: merchant A cannot see or change merchant B.

**Atomic balance changes (BR-06)**
- One database transaction, in this order: idempotency lock → `SELECT ... FOR UPDATE` on the customer row → read rules → validate → update balance → insert transaction → save idempotency row → commit.
- Do not check anything that depends on the balance before the row is locked.
- Rules in the database (CHECK, UNIQUE, triggers) are the last guard. Do not rely on application code alone.

**Ledger (BR-03, BR-21)**
- `transactions` rows are never edited or deleted. Mistakes are fixed with a `REVERSAL`. Only `status`, `sui_digest`, `attempt_count`, `next_attempt_at`, `last_error` may change, and only by the worker.
- Take `created_at` once (UTC, milliseconds) in the API and use the same value in the row and in `proof_hash`.
- Transaction lists are ordered by `created_at DESC, id DESC`.

**API security (FE6)**
- Signing string: `X-Timestamp.METHOD.PATH_WITH_QUERY.sha256_hex(raw_body).IDEMPOTENCY_KEY` (the last part is empty when there is no `X-Idempotency-Key`). HMAC-SHA256, lowercase hex, compared with `crypto.timingSafeEqual`.
- Hash the **raw bytes** of the body before any JSON parsing. Use the request target exactly as sent.
- Check order: key/merchant (MSG18) → timestamp ±300 s (MSG17) → signature (MSG16) → validation (MSG33) → idempotency → business logic.
- Both SDK and server must pass the test vectors in `docs/api-spec.md` A.2.

**Anchoring (FE8)**
- The database is the source of truth. The chain stores only the transaction code and a 32-byte hash. No personal data, no balances.
- Only one running instance has `ENABLE_ANCHOR_WORKER=true`.
- Temporary errors (RPC down, network, no gas) are **not** attempts: the row stays `PENDING_ANCHOR`. Only other errors count, and after 5 retries the row is `FAILED` (final).

**MCP (BR-14)**
- Register only `get_balance`, `list_transactions` and (Should) `get_loyalty_rules`. Never register a tool that writes. A test asserts the tool list.

**Messages and errors**
- Every `MSGxx` lives only in `apps/api/src/lib/messages.ts` with its text and HTTP status. Do not hard-code message text elsewhere.
- Throw `AppError(code)`. The global handler returns `{code, message}`; any other error becomes MSG23 with no stack trace.

**Secrets and logs**
- Never commit or log: passwords, API secrets, signatures, session tokens, `SUI_PRIVATE_KEY`, `SECRET_ENCRYPTION_KEY`.
- API secrets are stored encrypted (AES-256-GCM, random 12-byte nonce) and shown once.
- Log request id, route, status and duration only.

## 6. How to work

1. Pick the next task in `docs/implementation-plan.md`. Read the SRS parts it lists before writing code.
2. Write the tests from the task's acceptance criteria first or together with the code. A task is done only when all its criteria pass.
3. Migrations are numbered plain SQL files. Never edit an applied migration; add a new one.
4. Branches: `main` (demo-ready), `develop`, `feature/*`, `hotfix/*`. Commit messages start with `[Feature]` or `[Fix]`.
5. Every pull request needs at least one reviewer. Describe which SRS items and which acceptance criteria it covers.
6. If you change behaviour, update the SRS or the matching doc in the same pull request.

## 7. Definition of done (for any pull request)

- `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
- New endpoints: role check, `merchant_id` isolation test, error codes match `api-spec.md`.
- No new feature outside the SRS; no leftover debug code or secrets.
- Docs updated when behaviour or schema changed.

## 8. Out of scope – do not build

No mainnet or multi-chain; no point transfer between merchants; no offline mode; no point expiry, tiers, campaigns or fraud detection; no rate limiting; no forgot-password email flow; no reversal through API or SDK; no customer creation through API or SDK, and no bulk import; no end-customer UI; no Redis, ClickHouse, Walrus, Seal, Enoki/zkLogin, Stripe, Socket.IO, gRPC or mTLS; SDK is not published to npm. Full list: SRS LI-01 to LI-16. Items marked **Should** (only `get_loyalty_rules`) are cut first when time runs short.

## 9. Quick reference

- Roles: `ADMIN`, `MERCHANT_OWNER`, `MERCHANT_STAFF`. Statuses: merchant `PENDING|ACTIVE|SUSPENDED`; transaction `PENDING_ANCHOR|ANCHORED|FAILED`; types `ISSUE|REDEEM|REVERSAL`.
- Codes: `TXN-YYYYMMDD-XXXXXXXX` (21 chars, UTC date), `MCH-XXXXXX`; customer code `^[A-Z0-9]{1,32}$` (lower case is rejected).
- Time zone for "today" and date filters: `Asia/Ho_Chi_Minh` (UTC+7). Everything stored and returned is UTC.
- Idempotency: required on issue and redeem, 24 h window, scope = API key (external) or user (portal). Same key + different request → MSG34.
- Reversal: Owner only, once per `ISSUE`/`REDEEM`, allowed for an inactive customer; MSG25 if balance would go below 0, MSG41 if above the ceiling, MSG26 if already reversed.
