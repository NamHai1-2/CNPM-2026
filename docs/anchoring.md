# OctaPoint – Sui Anchoring: Move Contract and Worker

Source of truth: SRS 3.2.2.2 and 3.2.5.3, BR-03, BR-11, BR-12, BR-13, BR-20, LI-02, LI-08. Sui **Testnet only**. The database is the source of truth; the chain stores proof only.

## 1. Move contract (`contracts/anchor`)

Design choices (all follow from SRS rules):
- **Who may write (SRS 3.2.2.2):** the registry is an *owned* object created in `init` and sent to the publisher (the platform wallet). Only the owner can pass an owned object to a transaction, so no other address can write anchors. No separate capability object is needed.
- **Duplicates rejected:** entries live in a `Table` keyed by the transaction id, so anchoring the same id twice aborts with `E_DUPLICATE`.
- **No balances, no personal data (BR-20):** only the transaction id (`TXN-…` code) and the 32-byte proof hash.
- An event is emitted for every anchor so the proof can be found through RPC.

Sketch (to be compiled and tested with `sui move build` and `sui move test`; adjust syntax to the installed Sui version):

```move
module octapoint::anchor;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

const E_DUPLICATE: u64 = 1;
const E_BAD_HASH: u64 = 2;

public struct AnchorRegistry has key {
    id: UID,
    entries: Table<String, vector<u8>>,   // tx_id -> proof_hash (32 bytes)
}

public struct Anchored has copy, drop {
    tx_id: String,
    proof_hash: vector<u8>,
    anchored_at_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        AnchorRegistry { id: object::new(ctx), entries: table::new(ctx) },
        ctx.sender(),
    );
}

public entry fun anchor(
    registry: &mut AnchorRegistry,
    tx_id: String,
    proof_hash: vector<u8>,
    clock: &Clock,
) {
    assert!(proof_hash.length() == 32, E_BAD_HASH);
    assert!(!registry.entries.contains(tx_id), E_DUPLICATE);
    registry.entries.add(tx_id, proof_hash);
    event::emit(Anchored { tx_id, proof_hash, anchored_at_ms: clock.timestamp_ms() });
}
```

Unit tests required:
1. anchoring a new id succeeds and emits `Anchored`;
2. anchoring the same id again aborts with `E_DUPLICATE` (1);
3. a hash that is not 32 bytes aborts with `E_BAD_HASH` (2).

Deployment (one time, by the team): publish the package to Testnet with the platform wallet, then copy the package id and the created `AnchorRegistry` object id into the environment (`SUI_PACKAGE_ID`, `SUI_REGISTRY_ID`).

## 2. Platform wallet (BR-13)

- One Ed25519 key pair. The private key (`suiprivkey…` format) is only in the server secret `SUI_PRIVATE_KEY`; never in the repository, logs or database.
- The wallet pays all gas and owns the registry. Fund it from the Testnet faucet; the worker logs a warning when the balance is low. Running out of gas never fails a transaction: rows wait until the wallet is refilled (step 4b).
- Because one wallet and one gas coin are used, transactions are sent **one at a time**.

## 3. Anchoring worker (FE8, UC-16)

Runs inside the API process, but only when `ENABLE_ANCHOR_WORKER=true`. **Exactly one running instance may have it enabled.** The row-claiming query below also protects against accidental double runs.

Every 30 seconds (`ANCHOR_INTERVAL_SECONDS`), unless the previous run is still working:

**1. Claim due rows** (short DB transaction, oldest first, with a lease so a crashed worker's rows come back):
```sql
WITH due AS (
  SELECT id FROM transactions
  WHERE status = 'PENDING_ANCHOR' AND next_attempt_at <= now()
  ORDER BY created_at, id
  LIMIT $1                       -- ANCHOR_BATCH_SIZE, default 20
  FOR UPDATE SKIP LOCKED
)
UPDATE transactions t
   SET next_attempt_at = now() + interval '2 minutes'      -- lease
  FROM due WHERE t.id = due.id
RETURNING t.id, t.code, t.proof_hash, t.attempt_count;
```

**2. For each claimed row, one at a time:** build and send a Sui transaction that calls `anchor(registry, code, proof_hash_bytes, clock)`:
- `target`: `${SUI_PACKAGE_ID}::anchor::anchor`
- arguments: the registry object `SUI_REGISTRY_ID`, the `code` as a string, the 32 bytes decoded from the hex `proof_hash`, the shared Clock object `0x6`.
- Wait for the result; success means the transaction effects status is `success`. The result `digest` is the `sui_digest`.

**3. Success:**
```sql
UPDATE transactions SET status = 'ANCHORED', sui_digest = $digest, last_error = NULL
 WHERE id = $id AND status = 'PENDING_ANCHOR';
```

**4. Contract abort `E_DUPLICATE` (1):** an earlier attempt already succeeded (for example the process stopped before saving). Find the digest with an GraphQL event query for the event type `${SUI_PACKAGE_ID}::anchor::Anchored`, newest events first, at most 20 pages of 50 events; match `tx_id` in the event data, take the `txDigest` of that event and save it as in step 3. If it cannot be found, treat it as a counted failure (step 4c).

**4b. Temporary infrastructure error** (network error or timeout, RPC unavailable or 5xx, RPC rate limit, insufficient gas or no gas coin, object-version conflict): this is **not** an attempt.
- Do not change `attempt_count`. Set `next_attempt_at = now() + interval '5 minutes'`, save a short `last_error` and log a warning (for gas: "platform wallet balance too low").
- **Stop the run.** The other rows claimed in this run come back when their lease ends.
- The row stays `PENDING_ANCHOR` for as long as the problem lasts. If a timeout hid a transaction that actually succeeded, the next try ends in `E_DUPLICATE` (step 4) and is repaired.

**4c. Any other failure** (contract abort other than `E_DUPLICATE`, invalid arguments, unexpected response): `attempt = attempt_count + 1`.
- If `attempt <= 5`: `attempt_count = attempt`, `next_attempt_at = now() + delay`, with delays **1, 2, 4, 8, 16 minutes** for attempts 1 to 5; store a short `last_error`.
- If `attempt = 6` (the initial try plus 5 retries): `status = 'FAILED'`, `attempt_count = 6`, `last_error` saved. `FAILED` is final (LI-08).

Balances are never touched by the worker (BR-11).

## 4. Rules to keep

- Never write personal data or balances on-chain (BR-20).
- The worker only updates `status`, `sui_digest`, `attempt_count`, `next_attempt_at`, `last_error`; the database trigger rejects anything else (BR-03).
- Throughput is not guaranteed (SRS NFR): with one transaction at a time, a large backlog simply drains over several runs.
- A Testnet reset can make old digests disappear from the Explorer; this is accepted for the MVP (LI-02). Keep a few freshly anchored sample transactions for the demo.

## 5. Manual verification (LI-08)

To check a transaction: take its ledger record, rebuild the canonical JSON and SHA-256 as in `db-schema.md` §4, then compare with the `proof_hash` shown in the `Anchored` event on the Sui Explorer page of the `sui_digest`.
