/// OctaPoint anchor registry (Sui Testnet only).
///
/// Stores only the transaction id (`TXN-...` code) and the 32-byte proof hash.
/// No balances and no personal data (BR-20).
///
/// Write access: the registry is an OWNED object sent to the publisher in `init`.
/// Only the owner can pass it to a transaction, so no other address can anchor.
module octapoint::anchor;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};

const E_DUPLICATE: u64 = 1;
const E_BAD_HASH: u64 = 2;

const HASH_LENGTH: u64 = 32;

public struct AnchorRegistry has key {
    id: UID,
    /// tx_id -> proof_hash (32 bytes)
    entries: Table<String, vector<u8>>,
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

/// Anchor one proof hash. Aborts with E_BAD_HASH if the hash is not 32 bytes,
/// and with E_DUPLICATE if `tx_id` was already anchored.
public entry fun anchor(
    registry: &mut AnchorRegistry,
    tx_id: String,
    proof_hash: vector<u8>,
    clock: &Clock,
) {
    assert!(proof_hash.length() == HASH_LENGTH, E_BAD_HASH);
    assert!(!registry.entries.contains(tx_id), E_DUPLICATE);
    registry.entries.add(tx_id, proof_hash);
    event::emit(Anchored {
        tx_id,
        proof_hash,
        anchored_at_ms: clock.timestamp_ms(),
    });
}

public fun contains(registry: &AnchorRegistry, tx_id: String): bool {
    registry.entries.contains(tx_id)
}

public fun proof_hash_of(registry: &AnchorRegistry, tx_id: String): vector<u8> {
    *registry.entries.borrow(tx_id)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
