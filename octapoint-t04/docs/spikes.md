# Early spikes (do these before the tasks that depend on them)

Three assumptions in the design cannot be proven from this repository alone. Each is a small experiment (1–2 hours). Record the result in a line at the bottom of this file and fix the documents if the assumption is wrong.

| # | Assumption | Needed by | How to check | Pass when |
|---|---|---|---|---|
| S1 | A Vercel rewrite to the API host passes `Set-Cookie` and the `X-Requested-With` header unchanged, so the session cookie is first-party. | T02, T13 | Deploy the placeholder `apps/web` and the API (`GET /health`). Add a temporary route that sets a cookie `HttpOnly; Secure; SameSite=Lax` and one that echoes the header. Call both through `https://<vercel-app>/api/...` in a browser. | The cookie shows under the Vercel domain and is sent back on the next call; the header arrives. |
| S2 | The platform wallet can get Testnet gas and publish the Move package. | T11, T12 | Install the Sui CLI, create the wallet, request Testnet SUI from the faucet, run `sui client publish` on `contracts/anchor`. | Package id and `AnchorRegistry` object id are known; the wallet holds gas. Faucet limits are noted. |
| S3 | The chosen PostgreSQL host allows `CREATE EXTENSION citext` and `pg_advisory_xact_lock`. | T01 | Run `pnpm --filter api migrate` against the hosted database from your computer. | Migration finishes without errors. |
| S4 | The hosting plan wakes up fast enough for a demo (Render/Railway free tiers sleep). | T16 | Leave the API idle for the sleep period, then call `/health` and time it. | Known wake-up time; the demo plan includes a warm-up call. |

Already covered by automated tests (no spike needed): the signature test vectors, `requestTarget` (path and query as sent), password hashing of long passwords, the immutable ledger, and tenant constraints.

One thing to check again in T09 with a real request: the gateway must take the request target from Node's `req.url` (available as `c.env.incoming.url` with `@hono/node-server`) and hash the **raw body bytes** before parsing JSON. `lib/request-target.ts` already accepts both that form and a full URL.

## Results

_(add one line per spike: date, who, result)_
