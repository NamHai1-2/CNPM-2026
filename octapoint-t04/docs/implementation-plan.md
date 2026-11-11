# OctaPoint – Implementation Plan (task order and acceptance criteria)

Use this file to cut the work into tasks. Each task lists the SRS parts it implements (read those first), the WBS item, and what must be true before it is "done". Do the tasks in order; a task may start when the ones it depends on are done.

Rules for every task: follow `CLAUDE.md`; do not add features that are not in the SRS; add automated tests for the listed criteria; open a pull request with at least one reviewer (SRS 6.2).

| # | Task | SRS / docs | WBS | Depends on |
|---|---|---|---|---|
| T00 | Repo scaffold: tooling, `docker-compose.yml`, CI, `messages.ts`, `errors.ts`, `config.ts`, migration runner, test helpers | config-and-deploy §1–2b | – | – |
| T01 | Database migrations, migration runner, seed Admin | db-schema §2–3, §7 | 2.3, 5.2 | T00 |
| T02 | Auth, sessions, account settings | 3.2.1.1, 3.2.1.4, api-spec B.1–B.2 | 1.1, 1.2, 1.3 | T01 |
| T03 | Merchant registration, approve/suspend, tenant isolation | 3.2.1.1–2, BR-01, BR-18 | 2.1, 2.2, 2.3 | T02 |
| T04 | Staff accounts and API keys | 3.2.1.3, 3.2.3.3, CR-07 | 6.1 | T03 |
| T05 | Customers | 3.2.3.1, BR-04 | 3.1 | T03 |
| T06 | Loyalty rules | 3.2.2.1, BR-07, BR-22 | 4.1, 4.2 | T03 |
| T07 | Points engine: issue, redeem, idempotency, proof hash, codes | 3.2.3.2, BR-05/06/10/17, db-schema §4–5 | 3.2, 3.3, 3.4, 4.3, 5.1, 6.3 | T05, T06 |
| T08 | Ledger view and reversal | 3.2.5.1–2, BR-03, BR-21 | 5.2, 5.3 | T07 |
| T09 | API Gateway (HMAC) and external endpoints | 3.2.3.4, api-spec A | 6.2 | T04, T07 |
| T10 | Dashboards | 3.2.6, db-schema §6 | 7.2 | T07 |
| T11 | Move contract, tests, publish to Testnet | anchoring §1–2 | 8.1 | T00 |
| T12 | Anchoring worker | anchoring §3–4, 3.2.5.3 | 8.2, 8.3 | T07, T11 |
| T13 | Web portal screens | 3.1.2–3.1.6, api-spec B | 7.1, 7.3, 7.4 | T02 and each API it calls |
| T14 | TypeScript SDK | 3.2.3.5, api-spec C.2 | 9.1–9.3 | T09 |
| T15 | MCP server | 3.2.4.1, api-spec C.1 | 10.1, 10.2 | T14 |
| T16 | Manual test checklist and report, UAT, docs, deployment | SRS II.2, II.3 | 11, 12 | all |

T13 is built screen by screen while the matching API tasks finish (login with T02, merchants with T03, customers with T05, and so on).

## Acceptance criteria

**T00** – On a clean clone, `pnpm install`, `pnpm lint`, `pnpm typecheck` and `pnpm test:unit` pass, and `pnpm test` passes once `docker compose up -d db` is running. `messages.ts` has MSG01–MSG41 and a test compares it with the SRS table and the HTTP table in `api-spec.md`; unknown errors return MSG23 without a stack trace; `GET /health` answers `{"status":"ok"}`; `config.ts` fails with a readable list when a value is wrong; the HMAC test vectors of `api-spec.md` A.2 pass in `hmac.test.ts`; the CI workflow is green on the first pull request.

**T01** – `0001_init.sql` (already generated from `db-schema.md`) applies on an empty PostgreSQL 16 database, and the tests in `apps/api/test/db/` pass. Tests use `createTestDatabase()`; never `TRUNCATE`/`DELETE` to clean up. Tests prove: updating a ledger field other than the retry fields fails; deleting or truncating `transactions` fails; a second `REVERSAL` for the same original fails; a reversal of a `REVERSAL` fails; a negative balance fails; changing an `ANCHORED` row's status fails. Seed refuses to create a second Admin.

**T02** – Login with correct data returns the role-based redirect (MSG03). Wrong password and inactive user both return MSG02. Correct password for a `PENDING` or `SUSPENDED` merchant returns MSG15. A session older than 8 hours, a logged-out session, a deactivated user and a suspended merchant all return MSG35 on the next request. Password change enforces CR-08 and MSG36 and revokes other sessions.

**T03** – Registration creates a `PENDING` merchant with an `MCH-` code and one Owner; duplicate email → MSG31. Approve/suspend follow the allowed transitions in 3.2.1.2 only; suspend sets active keys to `SUSPENDED`, approve restores them but never touches `REVOKED` keys. Test: a user of merchant A can never read or change merchant B data through any endpoint.

**T04** – Staff creation (MSG28, MSG31, CR-08), deactivation ends the user's sessions. API key creation returns the secret once; the database holds only the encrypted secret; a 6th active/suspended key → MSG40; revoked keys are permanent. Audit rows exist for each action in CR-04.

**T05** – Create with and without phone; duplicate code → MSG27; duplicate phone within the same merchant → MSG38, but the same phone in another merchant is allowed; code format and case rules (CR-02); code cannot be changed; deactivate/reactivate is Owner-only and writes an audit row.

**T06** – Values must be positive integers ≤ 1,000,000; saving writes an audit row; before the first save, issue and redeem return MSG32.

**T07** – All of the following, each as an automated test:
- `points = floor(amount / earn_ratio)`; 0 → MSG24; rule change affects only later transactions and the rule used is stored in the transaction.
- Redeem below the minimum → MSG09 (even if the balance is also too low); balance too low → MSG08; the balance never goes below 0.
- **Concurrency:** 20 parallel redeems against a balance that covers only 5 → exactly 5 succeed and the final balance is correct.
- **Idempotency:** the same key and payload sent twice (also at the same time) creates one transaction and returns the same response; same key with another payload → MSG34; missing key → MSG33; a failed request can be retried with the same key.
- `proof_hash` matches the test vector in `db-schema.md` §4; `code` is `TXN-YYYYMMDD-` plus 8 characters and a code collision is retried.
- Inactive customer → MSG39; calculated points above 1,000,000 → MSG33; balance above 1,000,000,000 → MSG33; the remainder of the division is not carried over (15,000 at ratio 10,000 → 1 point).
- The `created_at` stored in the row is exactly the value used in `proof_hash`.
- Balance consistency query in `db-schema.md` §6 holds after the tests.

**T08** – Ledger shows the fields in 3.2.5.1 including who performed each transaction; filters and UTC+7 dates work; Admin sees all merchants read-only. Reversal: only Owner; ISSUE reversal with too little balance → MSG25; second reversal → MSG26 (also when two requests run at the same time: one succeeds, one fails); a `REVERSAL` cannot be reversed; the original row is unchanged; reversal works whatever the anchoring status of the original and for an inactive customer; reversing a `REDEEM` that would push the balance above 1,000,000,000 → MSG41; ledger pages never repeat or skip a row when several transactions have the same `created_at`.

**T09** – `lib/hmac.ts` and `lib/request-target.ts` already exist from T00; this task wires them into the gateway (raw body bytes before JSON parsing; request target from the Node `req.url`, as sent). The three signature test vectors in `api-spec.md` A.2 pass (vector 3: same signature with another idempotency key → MSG16). Failures return MSG18, MSG17, MSG16 in that order; ±300 s window is exact; a suspended or revoked key and a suspended merchant return MSG18; the merchant comes only from the key; each endpoint returns the documented body and status; replaying a signed `POST` unchanged returns the saved response, and replaying it with a different idempotency key fails with MSG16; neither creates a second transaction.

**T10** – Dashboard numbers equal the queries in `db-schema.md` §6 on seeded data, including reversals; "today" uses UTC+7 around midnight.

**T11** – Contract builds; the three unit tests in `anchoring.md` §1 pass; package and registry ids are published on Testnet and written to the environment.

**T12** – With Testnet reachable, a new transaction becomes `ANCHORED` with a digest within about two worker runs; the digest opens in the Explorer. With the RPC URL broken or the wallet out of gas, rows stay `PENDING_ANCHOR`, `attempt_count` does not change, the run stops after the first error and the rows are tried again after 5 minutes (testable through a test setting); once the problem is fixed they become `ANCHORED`. For a non-temporary error (for example a forced contract abort) a row is retried after 1, 2, 4, 8, 16 minutes and becomes `FAILED` after the 6th failed attempt; balances never change. Two worker runs at the same time never process the same row. A duplicate abort ends as `ANCHORED` with the existing digest.

**T13** – Every screen in SRS 3.1.2 and 3.1.4 exists with the role-based menu in 3.1.6; secrets are shown once with MSG11; the Issue/Redeem dialog sends an idempotency key and is disabled while submitting; toasts use the MSG texts; desktop-first, English only.

**T14** – Passes the signature test vectors; adds idempotency keys automatically and signs them; exposes `serverTime` on MSG17; throws `OctaPointError` with the MSG code; README sample runs against a local API.

**T15** – Only the tools in `api-spec.md` C.1 are registered (a test asserts the tool list); credentials error → MSG18; a lower-case customer code is upper-cased before the call; works from an MCP client such as Claude Desktop.

**T16** – Test checklist covers every UC and every BR; the demo script (register → approve → set rule → create API key → add customer → issue → redeem → view ledger/digest → SDK call → MCP query) passes twice in a row on the deployed system; a pre-anchored sample transaction is prepared for the demo.

## Cross-cutting scenarios to include in the manual test checklist

| Scenario | Expected |
|---|---|
| Merchant suspended while a staff session and an API key are active | next portal request MSG35, API call MSG18, queued transactions still anchor (BR-18) |
| Approve after suspend | non-revoked keys work again, revoked key stays revoked |
| Owner revokes a key during use | next signed call MSG18 |
| Rule saved while a transaction is in flight | the transaction uses the rule it read after locking the customer |
| POS timeout then retry with the same idempotency key | one transaction |
| Reverse an ISSUE after the customer spent the points | MSG25, no change |
| Testnet unreachable for a long time | rows stay `PENDING_ANCHOR` and are retried every 5 minutes (never `FAILED`), portal shows only the status, demo uses the prepared sample |
| Platform wallet out of gas | same as above plus a warning in the log; refill from the faucet and the rows anchor by themselves |
| Captured signed POST replayed with another idempotency key | MSG16, nothing created |

## Schedule note

After the SRS fixes, Must work is 414 man-hours (SRS II.1). Build order above keeps FE1–FE6 first (Sprint 3) and FE7–FE10, testing and deployment second (Sprint 4); T11 can start early in parallel because it only depends on T00. If time runs short, cut only the Should item (`get_loyalty_rules`, T15) first; anything else needs a scope decision with the supervisor.
