# Changes made after the Ready-for-Dev review

## Security
- **Idempotency key is now signed.** Signing string = `timestamp.METHOD.PATH.sha256(body).idempotency_key`. A captured POST replayed with another key now fails with MSG16. Test vectors recomputed (3 vectors) in `api-spec.md` A.2. SRS 3.2.3.4, BR-10, SDK and tasks T09/T14 updated.

## Anchoring
- **Temporary errors no longer cause `FAILED`.** Network/RPC down and wallet out of gas do not count as attempts; the row stays `PENDING_ANCHOR` and is retried every 5 minutes, and the run stops after the first such error. Only other errors count and end in `FAILED` after 5 retries. Updated: SRS (LI-08, BR-12, 3.2.5.3, goal 3, reliability), `anchoring.md` §2–3, T12, cross-cutting scenarios.
- Duplicate-abort lookup is bounded (newest first, 20 pages of 50 events).

## Data and business rules
- ERD redrawn from `db-schema.md` → `erd-v2.svg` (all 9 tables, all columns; transaction code is 21 characters, not 19). Same diagram is in `db-schema.md` §1.
- Issue: calculated points above 1,000,000 → MSG33 (DB CHECK on `transactions.points` aligned to 1,000,000).
- New **MSG41**: reversing a REDEEM must not push the balance above 1,000,000,000.
- Reversal is allowed for an inactive customer.
- Rounding remainder is not carried over (stated in BR-17).
- `created_at` is generated once by the API and used for both the row and `proof_hash`.
- Lists ordered by `created_at DESC, id DESC` (indexes updated); invalid `page` → MSG33.
- Audit log now also covers customer deactivation/reactivation and password changes.
- Idempotency `request_hash` definition aligned between BR-10 and `db-schema.md`.

## Operations and usability
- `reset:password` script defined (LI-14); backup note added to the deployment guide.
- MSG17 now returns `server_time`; SDK exposes `serverTime`.
- MCP tools upper-case the customer code before calling the API.
- New LI-16 (customers created in the portal only) and a clearer LI-13 (Staff cannot reverse).

## Diagrams
- `ContextD.drawio.svg`: "Idempotency Key (optional)" → "Idempotency Key (issue/redeem)".
- `adminSF.drawio.svg`: approve label now "Pending or Suspended to Active". Open both in draw.io once to check the label still fits its box.
- Use-case diagram, merchant screen flow: not changed (use-case text could not be read from the file).

## New file
- `CLAUDE.md` (put it in the repo root; the other documents go in `docs/`). The SRS is renamed `PROJECT_REPORT_FIXED.md` to match the references in the other files.

## Decisions I made (change if you disagree)
Temporary errors never fail a transaction; reversal allowed for inactive customers; remainder lost; points ceiling → MSG33; admin password reset by script rather than a new screen. Not changed because they are scope decisions: rate limiting, MCP read-only key scope, customer creation via API.

---

# Round 2 – project scaffold (T00) and remaining gaps

## Added (code and tooling)
- Root: `package.json` (pnpm version, dev tools, scripts `lint`, `typecheck`, `test`, `test:unit`, `db:up`), `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `docker-compose.yml` (PostgreSQL 16), `.github/workflows/ci.yml`.
- `apps/api`: `package.json`, tsconfigs, `vitest.config.ts`, `src/index.ts`, `app.ts` (health, request id, error handler, 404), `env.ts` (root `.env`), `config.ts` (zod), `lib/messages.ts` (MSG01–MSG41 generated from the SRS), `errors.ts`, `logger.ts`, `hmac.ts`, `request-target.ts`, `password-policy.ts`, `password.ts`, `prompt.ts`, `db/client.ts`, `db/migrate.ts`, `db/migrations/0001_init.sql` (generated from `db-schema.md` §2–3), `scripts/seed-admin.ts`, `scripts/reset-password.ts`.
- Tests: unit (messages vs SRS and api-spec, errors, HMAC vectors, request target, password policy and hashing, config, app) and database (migrations, ledger protection, constraints, tenant isolation, idempotency scope).
- `apps/web` (Next.js placeholder with the `/api/*` proxy), `packages/sdk` and `packages/mcp` (empty packages with the right names).

## Decisions
- One `.env` in the repository root, loaded with `process.loadEnvFile`; real environment variables always win.
- DB tests create a throw-away database per file because the ledger cannot be truncated.
- Passwords are pre-hashed with SHA-256 before BCrypt so that 64-character passwords are not cut at 72 bytes.
- `bigint` columns are read as JavaScript numbers (all values are far below 2^53).
- Unknown API routes return HTTP 404 with MSG33.
- Migrations record a checksum; editing an applied file fails the run.
- `tsx` is a normal dependency so `migrate` and the scripts run on the host.

## Fixed in documents
- `db-schema.md` §5: advisory lock key now casts `scope_id::text`.
- `anchoring.md` §3: claim query orders by `created_at, id`.
- `api-spec.md`: unknown routes documented.
- `config-and-deploy.md`: layout, `TEST_DATABASE_URL`, `.env` loading, local development and test rules, password pre-hash.
- `implementation-plan.md`: T00, T01 and T09 criteria updated. `CLAUDE.md` and `README.md`: commands and testing rule.
- New `spikes.md`: four checks that need real services (Vercel proxy, Sui wallet, hosted PostgreSQL, sleeping hosts).

## Not verified here (no network, no PostgreSQL in the authoring environment)
`pnpm install`, TypeScript compilation, ESLint, the tests that import hono, zod, postgres or bcryptjs, all database tests, the interactive `reset:password` prompt, the CI workflow and the Next.js app. The pure-logic tests (messages, errors, HMAC vectors, request target, password policy) were run with a small stand-in for vitest.

---

# Round 3 – Jira plan
- `docs/jira-plan.md`: cách tổ chức Jira (epic, story, sub-task, workflow, Definition of Done), lịch Sprint 3 và 4, và thẻ công việc cho T02–T16 (người làm, người xem lại, đầu vào, đầu ra, mô tả, cách làm, nghiệm thu).
- `docs/jira-import.csv`: 12 epic, 19 story và 19 sub-task "Code review" để nhập vào Jira (chưa thử trên Jira thật).
- T07 tách thành T07a và T07b, T13 thành T13a và T13b, T16 thành T16a, T16b và T16c để chia việc cho nhiều người.

---

# Round 4 – ready for GitHub
- Added `.gitattributes` (LF line endings on every machine) and made the migration checksum ignore line endings, so a Windows checkout does not break `migrate` for teammates (new test `migrate.test.ts`).
- Default database port is 5433 everywhere (`docker-compose.yml`, `.env.example`, README, docs). `eslint.config.mjs` knows `URL`. CI uses `--frozen-lockfile` and `pnpm-lock.yaml` is part of the repository.
- `docs/github-setup.md`: push, branch protection, onboarding of members, daily workflow.
- `docs/ai-prompts.md` and `types.ts` aligned with the earlier document changes: temporary Sui errors (T12), signed idempotency key and `serverTime` (T09, T14), points ceiling (T07a), reversal for inactive customers (T08), upper-cased MCP customer code (T15), audit actions for customers and password changes. `writeAudit` now belongs to T02.

---

# Round 5 – T02 (login, session, account settings)
- Added `src/middleware/auth.ts` (requireSession, requireRole, requireCsrfHeader, requireMerchantId), `src/services/auth.ts`, `src/services/audit.ts`, `src/routes/portal/auth.ts` (login, logout, me, change-password), `src/routes/index.ts` (route registry), `src/lib/http.ts` (parseJsonBody), `src/types.ts` unchanged.
- `app.ts` now uses `AppEnv` and accepts optional `routes`; `index.ts` registers the routes.
- Test helpers `test/helpers/app.ts` and `test/helpers/auth.ts`; tests in `test/db/auth.test.ts`.
- Decision: an unknown email still runs one BCrypt comparison with a dummy hash, so the response time does not reveal whether the account exists.

- T02 fix after the first typecheck: `withTransaction(sql, fn)` in `db/client.ts` replaces `sql.begin` in services (TransactionSql is not assignable to Sql); `auth.test.ts` helper `send` is async; new test `transaction.test.ts`.

---

# Round 6 – T03 (registration, approve/suspend, shared helpers)
- Added `lib/codes.ts` (generateMerchantCode, generateTxCode), `lib/pg-errors.ts` (isUniqueViolation), `services/merchants.ts`, `routes/portal/registration.ts`, `routes/portal/admin-merchants.ts`; two route lines in `routes/index.ts`.
- Tests: `test/unit/codes.test.ts`, `test/unit/pg-errors.test.ts`, `test/db/merchants.test.ts`, helper `test/helpers/tenant.ts` (createTwoMerchants).
- Decisions: an unknown or malformed merchant id and a forbidden status change both answer MSG33 (no "merchant not found" message exists); register returns `{}` with 201; approve and suspend return the merchant view; request logging is silent when NODE_ENV is "test".
