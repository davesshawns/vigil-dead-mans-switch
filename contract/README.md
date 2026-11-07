# Vigil NEAR contract

Vigil is a shared, multi-user registry for native-NEAR inheritance vaults.

## Identity and vault IDs

Each account has an independent, monotonic vault-ID sequence beginning at zero. Storage keys are owner account plus vault ID; IDs are not globally unique by themselves.

Owner methods accept a vault ID but never accept a target owner. The affected owner is always env::predecessor_account_id(). Public trigger, claim, fallback, and view methods accept both owner and vault ID because they operate on another account's public vault.

## Lifecycle

1. create_vault creates an unfunded vault and returns its owner-scoped ID.
2. set_beneficiaries, set_fallback, and set_check_in_interval configure only that vault; at least one beneficiary or fallback account is required before funding.
3. deposit attaches native NEAR as vault principal. Deposits without a recovery path are rejected, and the first deposit starts the deadline clock.
4. ping refreshes only the selected funded vault.
5. trigger_inheritance is permissionless strictly after the deadline and fixes beneficiary entitlements.
6. claim transfers one beneficiary's entitlement asynchronously. A rounded zero entitlement is recorded without scheduling a zero-value transfer.
7. claim_fallback lets only the configured fallback account sweep residual funds after twice the interval and only when no transfer is pending.
8. withdraw_all permanently closes an untriggered vault. It is rejected while any callback is pending.

Closing one vault does not alter another vault owned by the same account.

## Asynchronous transfer safety

Pending transfer IDs contain owner, vault ID, and a monotonically increasing per-vault nonce. Each callback verifies:

- self-call authorization;
- owner, vault ID, nonce, and transfer-ID agreement;
- the exact claim, withdrawal, or fallback marker;
- that the record still exists.

Missing, replayed, stale, cross-owner, and cross-vault callbacks do nothing. Failed transfers restore only the matching amount and leave the vault recoverable. Concurrent claims deduct fixed entitlements before scheduling transfers and cannot overdraw the tracked balance.

## Storage

State-growing methods measure env::storage_usage(), charge the caller at env::storage_byte_cost(), add the measured amount to the affected vault's storage reserve, and refund excess. Callback cleanup refunds released transient storage to the transfer recipient. Deposits are principal, not storage payments.

Permanent owner indexes, vault records, entitlements, and successful claim history are not deleted.

## Public methods

Owner-scoped mutations:

- create_vault
- deposit(vault_id)
- ping(vault_id)
- set_check_in_interval(vault_id, check_in_interval_ns)
- set_beneficiaries(vault_id, beneficiaries)
- set_fallback(vault_id, fallback_account)
- withdraw_all(vault_id)

Public inheritance methods:

- trigger_inheritance(owner, vault_id)
- claim(owner, vault_id)
- claim_fallback(owner, vault_id)

Views:

- get_vault_ids(owner)
- get_vaults(owner)
- get_vault(owner, vault_id)
- get_beneficiaries(owner, vault_id)
- has_vault(owner, vault_id)
- vault_balance(owner, vault_id)
- is_triggered(owner, vault_id)
- is_overdue(owner, vault_id)
- vault_count

## Build and test

    cargo fmt --all -- --check
    cargo test --locked --target x86_64-unknown-linux-gnu
    cargo clippy --locked --target x86_64-unknown-linux-gnu --all-targets -- -D warnings
    ./scripts/build_release.sh

The release script pins the compiler, uses Cargo.lock, builds twice, and compares the WASM artifacts byte-for-byte.

## Known boundaries

- Native NEAR only; no NEP-141/USDC yet.
- No living allowance because safe partial-failure accounting requires per-beneficiary accrual state.
- Public state is not private.
- Triggering requires a transaction; an optional keeper has no privileges.
- No migration or upgrade method. The production-preparation design removes every contract-account access key after deployment, making the code immutable.
