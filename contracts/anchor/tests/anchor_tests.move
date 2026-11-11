#[test_only]
module octapoint::anchor_tests;

use octapoint::anchor::{Self, AnchorRegistry, Anchored};
use std::string;
use sui::clock;
use sui::event;
use sui::test_scenario as ts;

const PUBLISHER: address = @0xA;

fun hash_of_len(n: u64): vector<u8> {
    let mut v = vector[];
    let mut i = 0;
    while (i < n) {
        v.push_back((i % 256) as u8);
        i = i + 1;
    };
    v
}

// 1. Anchoring a new id succeeds and emits `Anchored`.
#[test]
fun anchors_new_id_and_emits_event() {
    let mut sc = ts::begin(PUBLISHER);
    anchor::init_for_testing(sc.ctx());

    sc.next_tx(PUBLISHER);
    let mut registry = sc.take_from_sender<AnchorRegistry>();
    let clk = clock::create_for_testing(sc.ctx());
    let tx_id = string::utf8(b"TXN-20260101-AB12CD34");

    anchor::anchor(&mut registry, tx_id, hash_of_len(32), &clk);

    assert!(anchor::contains(&registry, tx_id));
    assert!(anchor::proof_hash_of(&registry, tx_id) == hash_of_len(32));
    assert!(event::events_by_type<Anchored>().length() == 1);

    clock::destroy_for_testing(clk);
    sc.return_to_sender(registry);
    sc.end();
}

// 2. Anchoring the same id again aborts with E_DUPLICATE (1).
#[test, expected_failure(abort_code = octapoint::anchor::E_DUPLICATE)]
fun duplicate_id_aborts() {
    let mut sc = ts::begin(PUBLISHER);
    anchor::init_for_testing(sc.ctx());

    sc.next_tx(PUBLISHER);
    let mut registry = sc.take_from_sender<AnchorRegistry>();
    let clk = clock::create_for_testing(sc.ctx());
    let tx_id = string::utf8(b"TXN-20260101-AB12CD34");

    anchor::anchor(&mut registry, tx_id, hash_of_len(32), &clk);
    anchor::anchor(&mut registry, tx_id, hash_of_len(32), &clk); // aborts here

    clock::destroy_for_testing(clk);
    sc.return_to_sender(registry);
    sc.end();
}

// 3. A hash that is not 32 bytes aborts with E_BAD_HASH (2).
#[test, expected_failure(abort_code = octapoint::anchor::E_BAD_HASH)]
fun bad_hash_length_aborts() {
    let mut sc = ts::begin(PUBLISHER);
    anchor::init_for_testing(sc.ctx());

    sc.next_tx(PUBLISHER);
    let mut registry = sc.take_from_sender<AnchorRegistry>();
    let clk = clock::create_for_testing(sc.ctx());

    anchor::anchor(&mut registry, string::utf8(b"TXN-20260101-AB12CD34"), hash_of_len(31), &clk);

    clock::destroy_for_testing(clk);
    sc.return_to_sender(registry);
    sc.end();
}
