# contracts/anchor – OctaPoint Move contract (T11)

Spec: `docs/anchoring.md` §1–2. Sui **Testnet only**.

## Build and test

```bash
cd contracts/anchor
sui move build
sui move test
```

Expected: 3 tests pass (`anchors_new_id_and_emits_event`, `duplicate_id_aborts`, `bad_hash_length_aborts`).

## Publish to Testnet (one time, with the platform wallet)

```bash
sui client switch --env testnet
sui client active-address          # must be the platform wallet
sui client faucet                  # fund it if the balance is low
sui client publish --gas-budget 100000000
```

From the output, copy two ids:

- `PackageID` under **Published Objects** -> `SUI_PACKAGE_ID`
- the **Created Object** whose type ends in `::anchor::AnchorRegistry` -> `SUI_REGISTRY_ID`
  (it is owned by the publisher address)

Add them to the server environment and, as empty placeholders, to `.env.example`:

```
SUI_PACKAGE_ID=
SUI_REGISTRY_ID=
```

Do not commit real ids with a private key. `SUI_PRIVATE_KEY` stays only in the server secret (BR-13).

## Optional smoke test on Testnet

```bash
sui client call \
  --package $SUI_PACKAGE_ID --module anchor --function anchor \
  --args $SUI_REGISTRY_ID '"TXN-20260101-SMOKE001"' \
         "[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]" \
         0x6 \
  --gas-budget 10000000
```

Running it a second time with the same id must abort with code 1 (`E_DUPLICATE`).
The Explorer page of the digest should show an `Anchored` event.

## Done criteria (T11)

- [ ] `sui move build` succeeds
- [ ] the 3 unit tests pass
- [ ] package id and registry id published on Testnet and written to the environment
