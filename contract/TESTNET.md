# Vigil NEAR Testnet deployment handoff

Deployment remains pending. These procedures are preparation only unless a human separately authorizes a state-changing command.

## Fixed target

- Network: NEAR Testnet
- Contract account: vigilvault.vigilowner.testnet
- Initializer: new {}
- Upgrade model after lock: immutable

The contract has no application administrator. The contract account's full-access deployment key remains protocol-level custody until it is deleted.

## Build

    cd contract
    ./scripts/build_release.sh
    sha256sum -c vigil_near.wasm.sha256

The guarded build checks formatting, tests, Clippy, the pinned Rust compiler, locked dependencies, and byte-for-byte reproducibility.

## Read-only deployment preflight

    VIGIL_TESTNET_PREFLIGHT_ONLY=1 ./scripts/deploy_testnet.sh

The preflight verifies:

- the reviewed local WASM hash;
- the hardcoded Testnet target;
- no existing code or contract state;
- sufficient contract-account balance;
- availability of the deployment key without printing private material.

## Deployment

Do not run without separate authorization:

    export VIGIL_TESTNET_DEPLOY_CONFIRM=DEPLOY_VIGILVAULT_VIGILOWNER_TESTNET
    ./scripts/deploy_testnet.sh

The script atomically deploys and initializes new {}. It does not create user vaults.

## Mandatory immutable lock

Do not expose the frontend or accept deposits after deployment until the final access key is removed.

Preparation-only:

    VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 ./scripts/lock_immutable_testnet.sh

The dry run downloads deployed code, compares its SHA-256 with vigil_near.wasm.sha256, and requires exactly one remaining full-access key.

The irreversible key-deletion path requires both:

    VIGIL_IMMUTABLE_LOCK_DRY_RUN=0
    VIGIL_IMMUTABLE_LOCK_CONFIRM=PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET

It must be executed only under separate human authorization. After success, the script verifies that zero access keys remain. Upgrades, direct transfers, and account deletion then become impossible.

## Read-only API verification

Expected immediately after initialization:

    near contract call-function as-read-only vigilvault.vigilowner.testnet vault_count json-args '{}' network-config testnet now

Expected result: 0.

For an owner with no vaults:

    near contract call-function as-read-only vigilvault.vigilowner.testnet get_vault_ids json-args '{"owner":"<OWNER.testnet>"}' network-config testnet now

Expected result: [].

## Required lifecycle evidence

Use at least two funded user wallets and separate beneficiary/fallback accounts.

1. Owner A creates vault IDs 0 and 1.
2. Owner B creates its own vault ID 0.
3. Deposits and beneficiary changes affect only the predecessor and selected vault ID.
4. Closing A/0 leaves A/1 and B/0 unchanged.
5. Exact-deadline trigger fails; deadline-plus-one trigger succeeds.
6. Concurrent claims cannot exceed the snapshot.
7. Callback success in reverse order leaves pending_count zero.
8. Callback replay and wrong-vault callback are no-ops.
9. Withdrawal while a claim is pending fails.
10. A failed claim restores an active, retryable triggered vault.
11. Fallback recovery fails before twice the interval and while claims are pending.
12. Failed fallback transfer restores the residual balance.
13. Storage deposits and refunds match final receipts.
14. Account switching A → B → A displays the correct vault list and selected vault.

Inspect every transaction and receipt. Function-call success alone is not proof that asynchronous transfers succeeded.

## Failed-transfer harness

The harness requires a disposable Vigil deployment and now accepts VAULT_ID, defaulting to 0:

    export VAULT_ID=0

Never point the harness at vigilvault.vigilowner.testnet. See test-harness/README.md.
