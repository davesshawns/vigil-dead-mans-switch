# Disposable failed-transfer harness

This Testnet-only contract exercises Vigil's real asynchronous transfer-failure callback without changing Vigil. It must be deployed only to disposable accounts and must target a separate disposable Vigil deployment.

## What it does

The harness is configured as the sole beneficiary of a small test vault. Its controller calls `prove_failed_claim`, which constructs this promise chain:

1. Delete the harness account and refund its remaining balance to the controller.
2. Call `claim` on the isolated Vigil contract as the now-deleted beneficiary account.
3. Let Vigil schedule a native NEAR transfer to that nonexistent account.
4. Let Vigil's private callback receive `PromiseError::Failed` and restore the tracked vault balance and claim markers.

The harness attaches 0.05 NEAR to `claim` for measured transient storage. **Because the refund recipient (the harness beneficiary account) has been deleted, storage refund receipts may also fail and leave raw NEAR balance on the isolated Vigil account, outside vault accounting.** This is an expected test-side-effect when using the failed-transfer harness.

**Do not reuse valuable accounts.** The harness must only be deployed to explicitly disposable, fully-funded Testnet accounts that you accept may have residual NEAR left after the experiment. The isolated Vigil account (`failure-vigil.*`) must be manually reclaimed by its key holder after the experiment to recover any remaining balance.

**Do not use the primary `vigilvault.vigilowner.testnet` deployment for this test.** The failed-transfer harness is designed exclusively for a separate disposable Vigil deployment. The deploy script and the harness contract both reject the primary contract ID.

The isolated contract account can later be deleted by its key holder to recover its remaining Testnet balance.

## Disposable account architecture

| Role | Suggested account |
|---|---|
| Isolated Vigil contract | `<disposable-vigil.testnet>` |
| Isolated vault owner | `<disposable-owner.testnet>` |
| Self-deleting harness beneficiary | `<disposable-harness.testnet>` |
| Controller | `<disposable-controller.testnet>` |
| Disposable deletion refund | `<disposable-refund.testnet>` |

Suggested temporary liquidity is approximately 7.5 NEAR: 4 NEAR for the isolated Vigil account, 1.5 NEAR for the isolated owner and small vault principal, and 2 NEAR for harness code storage, the 0.05 NEAR claim storage payment, and gas. Most remaining balances are recoverable from the disposable accounts after evidence is captured.

## Build

```bash
./scripts/build.sh
sha256sum -c vigil_failed_transfer_harness.wasm.sha256
```

Artifact:

```text
target/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm
134048 bytes
SHA256 aeca941730a1daec699954c03c4c0474f105134c4e9e66c2198bf8a2cc6bc9b7
```

The build pins the reviewed compiler commit, runs shell syntax checks, 36 mocked deployment-safety tests, formatting, 5 Rust unit tests, Clippy with warnings denied, and compares two clean release builds.

## Deploy after explicit authorization only

First deploy the normal Vigil WASM to an already-created and funded isolated account using a separately reviewed disposable-deployment procedure. Do not use `../scripts/deploy_testnet.sh`; that primary script is intentionally bound to `vigilvault.vigilowner.testnet`.

Then deploy and atomically initialize the harness:

```bash
cd test-harness
export HARNESS_ID='<disposable-harness.testnet>'
export CONTROLLER_ID='<disposable-controller.testnet>'
export VIGIL_CONTRACT_ID='<disposable-vigil.testnet>'
export VAULT_OWNER_ID='<disposable-owner.testnet>'
export VAULT_ID='0'
export DELETION_REFUND_ID='<disposable-refund.testnet>'
# Set this from the independently reviewed deployment record. It is the
# base58 code_hash returned by NEAR view_account, not a local SHA-256 digest.
export EXPECTED_VIGIL_CODE_HASH='<reviewed deployed code_hash>'
export VIGIL_HARNESS_DEPLOY_CONFIRM=DEPLOY_VIGIL_FAILURE_HARNESS_TESTNET
./scripts/deploy_testnet.sh
```

Before inspecting or deploying to the harness account, the deploy script queries
NEAR Testnet JSON-RPC with `query` / `view_account` for `VIGIL_CONTRACT_ID` and
requires the returned deployed `code_hash` to equal
`EXPECTED_VIGIL_CODE_HASH`. It fails closed on transport errors, RPC errors,
missing accounts, malformed results, missing hashes, no deployed code, and hash
mismatches. The local harness WASM SHA-256 check is separate and is never used
as proof of the deployed Vigil contract's identity.

All five configured account roles must be pairwise distinct. The target Vigil
contract must not be `vigilvault.vigilowner.testnet`, and the deletion refund
target must not be one of the protected primary accounts listed in the contract
and deploy script. The deploy script does not create or fund accounts.

Run the safety tests without network or account access:

```bash
./scripts/tests/deploy_testnet_test.sh
```

## Real Testnet proof

Create and fund a 60-second vault on the isolated Vigil deployment, assign the harness account 100%, wait until overdue, and trigger inheritance. Record the pre-claim `get_vault` and `get_beneficiaries` results.

Then call:

```bash
near contract call-function as-transaction '<disposable-harness.testnet>' \
  prove_failed_claim json-args '{}' \
  prepaid-gas '250 Tgas' attached-deposit '0 NEAR' \
  sign-as '<disposable-controller.testnet>' network-config testnet sign-with-keychain send
```

Inspect the returned transaction and every receipt:

```bash
near transaction view-status '<HARNESS_TRANSACTION_HASH>' network-config testnet
```

Required receipt evidence:

- harness account deletion succeeds;
- chained Vigil `claim` executes as the disposable harness beneficiary;
- Vigil's transfer to that deleted account fails;
- Vigil's private callback succeeds.

Required post-state evidence:

- `vault_balance` equals its pre-claim value;
- `pending_count` is zero;
- the harness beneficiary has `claimed = false`;
- `transfer_pending = false`;
- `claimed_amount = 0`;
- the original entitlement remains;
- `next_transfer_nonce` increased, proving the failed attempt cannot be replayed under the same transfer ID.

Optionally recreate the harness account as a normal account and retry the restored claim to show it can complete. Do this only after separate authorization.

## What this proves

After a real authorized run, it proves NEAR receipt ordering can produce the intended transfer failure and that the deployed Vigil bytecode restores the matching tracked claim state. It does not prove Mainnet behavior, frontend behavior, arbitrary token transfers, account-creation safety, or every possible protocol failure. Local unit tests prove only promise construction and controller access until Testnet receipts exist.
