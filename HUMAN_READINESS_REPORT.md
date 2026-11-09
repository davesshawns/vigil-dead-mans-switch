# Vigil human-readiness report

Date: 2026-11-07 (review); updated 2026-11-09 (authorized upgrade executed and verified)  
Network: NEAR Testnet  
Primary account: `vigilvault.vigilowner.testnet`

## Readiness verdicts

| Gate | Verdict | Evidence |
|---|---|---|
| 1. Deployment verified | **YES** | Fresh final RPC queries and transaction-status verification reproduce the recorded account, code, initializer state, empty registry, and key set. |
| 2. Immutable | **NO** | One FullAccess key remains. No key operation was executed. |
| 3. Contract security reviewed | **REVIEW COMPLETE; FIXED CANDIDATE NOW DEPLOYED** | The complete lifecycle and callbacks were reviewed. The high-severity fallback failure-restoration defect is fixed in the candidate and that candidate is now the deployed artifact (tx `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`, code hash `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`). |
| 4. Lifecycle tested | **LOCAL/SANDBOX YES; REAL TESTNET NO** | 49 Rust tests and 3 complete disposable sandbox tests pass. No real Testnet vault, deposit, transfer, or claim was created during this work. |
| 5. Human testing ready | **CONDITIONAL — code gate resolved, custody gate pending** | The fixed candidate is deployed and verified, so the frontend code-hash half of the release gate now resolves. The primary account still retains its FullAccess key, so the zero-key half of the gate still blocks wallet-signed actions. No separately approved real Testnet lifecycle has been completed. |
| 6. Production ready | **NO** | This is Testnet-only, custody is not immutable (one FullAccess key remains), and human lifecycle evidence remains outstanding. |

The original review performed no deployment, upgrade, initializer call, signed transaction, funding, transfer, vault creation, or access-key change. The authorized code-only upgrade executed on 2026-11-09 is recorded in `UPGRADE_REVIEW.md` (Addendum) and is limited to replacing contract code; no state migration, fund transfer, or key change occurred.

## 1. Independent deployment verification

The original deployment transaction was independently queried:

- Transaction: `DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY`
- Signer and receiver: `vigilvault.vigilowner.testnet`
- Signing public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Actions: deploy contract, then call `new`
- Initializer bytes: `{"allowed_tokens":[]}`
- Initializer SHA-256: `2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4`
- Initialization gas/deposit: 30 Tgas / 0 NEAR
- Final status: `Final`, root and every receipt successful
- Execution block: `276534759`
- Final receipt block: `276534760`

Fresh final-state evidence (historical, superseded artifact):

- Account query block: `276550388`
- Access-key query block: `276550394`
- View-call blocks: `276550407` through `276550432`
- Deployed NEAR code hash: `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM`
- Downloaded WASM SHA-256: `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8`
- Downloaded WASM size: 298281 bytes
- Balance: `3997663397051245000000000` yoctoNEAR
- Storage usage: 298586 bytes
- `get_allowed_tokens`: `[]`
- `vault_count`: `0`
- `get_vaults({owner: "vigilvault.vigilowner.testnet"})`: `[]`
- `get_vault({owner: "vigilvault.vigilowner.testnet", vault_id: 0})`: `null`
- `get_beneficiaries({owner: "vigilvault.vigilowner.testnet", vault_id: 0})`: `[]`
- Access keys: one FullAccess, zero FunctionCall
- Remaining key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`

The downloaded bytes match the historical approved deployment hash and size in `DEPLOYMENT_REPORT.md`. This artifact is superseded and has been replaced by the authorized code-only upgrade recorded in section 1b.

### 1b. Authorized code-only upgrade verification (2026-11-09)

The reviewed upgrade was executed with separate explicit authorization and independently verified against final Testnet data.

- Transaction: `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`
- Signer and receiver: `vigilvault.vigilowner.testnet`
- Signing public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Actions: exactly one `DeployContract` containing the reviewed candidate bytes; no `FunctionCall`, initializer, transfer, `AddKey`, `DeleteKey`, stake, or `DeleteAccount` action
- Root status and every receipt status: `SuccessValue` (final)
- Gas burned: 2.4 Tgas; transaction fee: 0.0002346494790566 NEAR

Verified post-upgrade final-state values:

- Deployed NEAR code hash: `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp` (matches reviewed candidate)
- Downloaded WASM SHA-256: `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`
- Downloaded WASM size: 301,434 bytes
- Balance: `3995453016967018800000000` yoctoNEAR (reconciled: pre-upgrade balance − tokens_burnt − transaction fee)
- Storage usage: 301,739 bytes (increased by exactly 3,153 bytes, the candidate/current code-size difference)
- Locked balance: 0
- Raw state entries: 1
- Raw state SHA-256: `5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239` (unchanged)
- `get_allowed_tokens`: `[]`
- `vault_count`: `0`
- `get_vaults({owner: "vigilvault.vigilowner.testnet"})`: `[]`
- `get_vault({owner: "vigilvault.vigilowner.testnet", vault_id: 0})`: `null`
- `get_beneficiaries({owner: "vigilvault.vigilowner.testnet", vault_id: 0})`: `[]`
- Access keys: one FullAccess, zero FunctionCall
- Remaining key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Access-key nonce: `276434877000002` (incremented by exactly 1, the expected effect of signing the upgrade)

The unchanged raw-state hash proves that no initializer or state-writing method ran as part of the upgrade. The fallback callback-restoration defect is now fixed in the deployed artifact.

The downloaded bytes match the historical approved deployment hash and size in `DEPLOYMENT_REPORT.md`. The active local release artifact intentionally no longer matches the deployed code because it contains the callback fix described below. No unexpected on-chain configuration, vault, beneficiary, code, balance, storage, or access-key change was observed.

### Artifact distinction

| Artifact | Size | SHA-256 | NEAR code hash | Status |
|---|---:|---|---|---|
| Original Testnet deployment | 298281 | `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8` | `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM` | Superseded; replaced by the authorized upgrade in tx `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`. |
| Fixed local candidate | 301434 | `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` | `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp` | Reproducible, passes sandbox, **deployed and independently verified on Testnet**. |

The earlier 301755-byte local candidate is superseded and must not be deployed. Rust 1.99 emitted WebAssembly features rejected by NEAR with `PrepareError(Deserialization)`. The release build now explicitly disables `reference-types`, `multivalue`, and `bulk-memory`; the resulting candidate deploys successfully in the local NEAR sandbox.

## 2. Immutable-lock preflight

### Exact operation

After, and only after, the fixed artifact is separately deployed and independently verified, the operation prepared by `contract/scripts/lock_immutable_testnet.sh` is:

```bash
near account delete-keys vigilvault.vigilowner.testnet \
  public-keys ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje \
  network-config testnet sign-with-keychain send
```

This command is recorded for human review only. It was not run.

### Authorization and current paths

- The same remaining FullAccess key must authorize its deletion.
- There are no FunctionCall keys and no second account key.
- The contract has no administrator, upgrade method, privileged withdrawal, or internal key-management method.
- Until deletion, this FullAccess key can replace code, transfer the account's liquid balance, add/delete keys, or delete the account.

### Preconditions enforced by the lock script

The dry run verifies final chain data for:

1. the exact primary account;
2. deployed code bytes matching `contract/vigil_near.wasm.sha256`;
3. initialized `get_allowed_tokens == []`;
4. `vault_count == 0`;
5. exactly one key and that key being FullAccess.

The current dry run now passes against the upgraded account:

```text
Immutable-lock preflight passed.
Reviewed code is deployed and exactly one full-access key remains.
No key was deleted. Re-run only after review with:
  VIGIL_IMMUTABLE_LOCK_DRY_RUN=0
  VIGIL_IMMUTABLE_LOCK_CONFIRM=PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET
```

The fixed candidate is now deployed and verified, so the code-hash precondition is satisfied. The only remaining precondition is `vault_count == 0`, which holds. Permanent key deletion remains a separate explicitly authorized operation and has **not** been executed.

### Result and irreversibility

The expected successful post-condition is exactly zero access keys. Contract methods remain callable because users sign calls from their own NEAR accounts; the contract account does not need a key to execute receipts.

Deleting the last key is irreversible under this architecture. It permanently removes ordinary code upgrades, account-signed transfers, account deletion, adding replacement keys, and same-account recovery. No recovery path exists if a later contract defect is found. A new contract account and user migration would be required.

## 3. Contract lifecycle and security review

### Ownership and isolation

- Native owner mutations derive the owner exclusively from `env::predecessor_account_id()`.
- Vault IDs are monotonic within an owner namespace; two owners may independently own vault ID `0`.
- One owner may create up to 100 vaults. Closing or mutating one vault does not affect another.
- Beneficiaries, entitlements, claim markers, allowance schedules, pending transfers, storage reserves, and transfer nonces are keyed by owner and vault ID.
- Public trigger and claim methods accept an owner/vault pair, but transfer destinations and eligibility come from stored vault configuration, not caller-supplied recipients.

### Lifecycle behavior

- Vaults start active and unfunded. An unfunded vault does not become overdue.
- Funding is rejected until at least beneficiaries or a fallback account exists. The first accepted deposit starts the clock.
- A heartbeat is owner-only, vault-specific, requires a positive balance, and succeeds at the exact deadline boundary.
- Inheritance is permissionless only when `now > deadline`; equality is not expired.
- Triggering snapshots the balance, computes fixed entitlements, and assigns percentage-rounding dust to the last beneficiary.
- Each beneficiary may claim only its own stored entitlement. Claim state is reserved before the asynchronous transfer.
- Fallback is identity-restricted and requires `now > last_ping + 2 * interval`; equality is not ready. It can sweep the entire remaining balance when no transfer is pending.
- Owner withdrawal is allowed only before inheritance, before expiry for a funded vault, and with no pending transfer. It permanently deactivates that vault.
- Changing the interval does not perform a heartbeat. The deadline remains based on `last_ping_ns`, so shortening the interval may immediately make the vault overdue.
- Living allowances are per beneficiary, non-accumulating, and retryable after failure. Permissionless release requires the period to be due; the owner can deliberately release early. Configuration changes restart current beneficiary schedules.
- The native-only initializer permanently disables FT vault creation and refunds every attempted FT deposit from an unallowed token.

### Asynchronous transfer safety in the fixed candidate

- Claims, allowances, withdrawals, and fallback transfers reserve balance before scheduling.
- Pending counts prevent withdrawal, reconfiguration, inheritance, or fallback races where required.
- Callback records bind owner, vault ID, nonce, transfer kind, recipient, amount, asset, and the operation-specific marker.
- Only self-callbacks are accepted.
- Missing, replayed, stale, cross-owner, cross-vault, mismatched-recipient, and mismatched-amount callbacks are no-ops.
- Concurrent claims cannot reserve more than the tracked vault balance.
- Failed claim, allowance, and withdrawal callbacks restore the matching balance and retryable state.

### High-severity deployed-version defect fixed locally

The deployed artifact allows `claim_fallback` to activate inheritance before beneficiaries trigger it. If that fallback transfer fails, the deployed callback restores the balance and active flag but leaves `inheritance_triggered = true` and a snapshot without entitlement records. Beneficiary claims then fail with `NoEntitlement`, making recovery dependent on the fallback retrying.

The local candidate records whether fallback initiated inheritance. On failure it restores:

- `active = true`;
- `inheritance_triggered = false`;
- `distributable_snapshot = 0`;
- the full vault balance;
- pending markers/counts.

The regression test `failed_pretrigger_fallback_restores_the_beneficiary_trigger_path` proves that a later keeper can trigger inheritance, entitlements are created, and a beneficiary can claim. This changes deployed behavior, so a separately reviewed code-only upgrade is required.

### Storage and accounting

- Arithmetic uses checked addition, subtraction, and multiplication.
- Percentage calculation avoids multiplying the entire `u128` balance by the percentage and is tested at `u128::MAX`.
- Measured state growth is charged to the caller; excess attached storage deposit is refunded.
- State release decreases the vault's recorded reserve and refunds the payer.
- Token transfer deposits, when generic FT code is exercised in sandbox, are retained and refunded on failure.
- Vault and owner-index records are permanent. There is no vault deletion or complete storage-reserve reclamation after closure; this is an economic limitation, not hidden recoverable storage.

### Remaining limitations and findings

1. **Critical — current custody:** the primary account still has one FullAccess key.
2. **High — deployed code:** the primary account still runs the fallback callback bug; it must not be funded or immutable-locked.
3. **High — irreversible release evidence:** no real-wallet Testnet lifecycle has run against the fixed candidate.
4. **Medium — observability:** the NEAR contract emits no structured event logs. Investigation relies on transaction receipts and state views.
5. **Medium — permanent state:** closed vault records and owner indexes are not deleted; users do not recover all creation storage.
6. **Medium — fallback semantics:** after twice the interval, fallback may sweep all remaining funds, including unclaimed beneficiary residual. This is documented but must be understood by users.
7. **Medium — public state:** owners, vault IDs, balances, deadlines, beneficiaries, fallback accounts, entitlements, and claim activity are public.
8. **Low — frontend bundle:** legacy Arc/Circle dependencies remain in the repository and increase install/build surface, although the active NEAR UI is native-only and the production build is tree-shaken. Cleanup should be a separate reviewed change.

No additional critical or high-severity defect was found in the fixed candidate during this review. That statement is limited to source review and the executed tests; it is not a formal third-party audit.

## 4. Verification executed

### Contract release build

```bash
cd contract
./scripts/build_release.sh
sha256sum -c vigil_near.wasm.sha256
```

Result:

- formatting: passed;
- Rust unit tests: 47 passed, 0 failed;
- Clippy with warnings denied: passed;
- release build: passed;
- two independent release target directories: byte-identical;
- candidate size: 301434 bytes;
- candidate SHA-256: `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`;
- candidate NEAR code hash: `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`.

### Disposable NEAR sandbox lifecycle

```bash
NEAR_SANDBOX_BIN_PATH=/tmp/vigil-near-sandbox-wrapper \
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd' \
cargo test --manifest-path contract/sandbox-tests/Cargo.toml \
  --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

Result: 3 passed, 0 failed. The final run used freshly rebuilt NEAR-compatible Vigil and mock-FT WASM artifacts. Coverage includes native multi-user/multi-vault isolation, unauthorized mutations, independent withdrawal, time advancement, concurrent claims, private callback rejection, FT deposit/refund, failed claim and allowance restoration, recipient registration, retry, and final distribution.

### Failed-transfer harness

```bash
cd contract/test-harness
./scripts/build.sh
```

Result:

- shell safety tests: 36 passed;
- Rust tests: 5 passed;
- formatting and Clippy: passed;
- reproducible build: passed;
- harness size: 136943 bytes;
- harness SHA-256: `d38c9975830401d479eb816c1fee6658c1d674d24922d3df1f8af2050e882017`.

The harness is prohibited from targeting the primary Vigil account.

### Immutable-lock preparation

```bash
cd contract
bash -n scripts/lock_immutable_testnet.sh scripts/tests/lock_immutable_testnet_test.sh
scripts/tests/lock_immutable_testnet_test.sh
VIGIL_ALLOWED_TOKENS_JSON='[]' VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 \
  ./scripts/lock_immutable_testnet.sh
```

Result: script tests passed. The live read-only dry run rejected the outdated deployed artifact as required. No key operation was attempted.

### Frontend

```bash
bun run typecheck
bun run test
./node_modules/.bin/oxlint --type-aware src
./node_modules/.bin/oxlint src vite.config.ts vitest.config.ts
bun run build
```

Result:

- typecheck: passed;
- tests: 18 passed across 5 files;
- lint: passed;
- production build: passed;
- output JS: 2114.63 kB, gzip 621.00 kB;
- non-fatal warnings: dependency `eval` usage and a chunk larger than 500 kB.

Coverage includes connect, disconnect, session restoration, A → B → A account switching, account-scoped queries, transaction receipt verification, and the release gate requiring the reviewed code hash plus zero keys. Browser tests use the real Wallet Selector provider with an in-process test wallet module; no external wallet was asked to sign.

### Legacy Solidity reference

```bash
/home/acknowlege/.foundry/bin/forge test
```

Result: 87 passed, 0 failed, 0 skipped. This is parity/reference evidence only and does not validate the NEAR deployment.

### Tests not executed

- No real Testnet wallet signing or complete vault lifecycle: separately authorized live transactions and funding are required.
- No primary-account upgrade: prohibited in this task.
- No immutable-lock transaction: prohibited and currently unsafe.
- No mainnet checks: the approved product scope is Testnet only.

## 5. Human-use Testnet plan

Use disposable Testnet identities with no valuable balances:

- owner A;
- owner B for cross-owner rejection;
- beneficiary A and beneficiary B;
- fallback account;
- keeper/trigger account;
- a separately approved disposable contract/harness environment for intentional transfer failure.

Do not perform pre-lock lifecycle tests on the primary account: `vault_count` is monotonic and the immutable-lock script intentionally requires the primary deployment to remain unused with `vault_count == 0`. If real Testnet lifecycle validation is required before locking the primary, deploy the exact candidate to a separate disposable Testnet contract under separate approval.

### Approval-gated scenario

1. Verify the disposable deployment bytes equal candidate SHA-256 `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` and initializer is `{"allowed_tokens":[]}`.
2. Connect owner A, create vault 0, and record the exact storage charge/refund and deadline.
3. Configure two beneficiaries with a rounding-sensitive split such as 33%/67%, plus a fallback account.
4. Deposit a deliberately small native NEAR amount. Confirm the first deposit resets `last_ping_ns`, tracked balance equals the deposit, and no FT option is available.
5. Perform a heartbeat before and exactly at a controlled deadline boundary; verify `last_ping_ns` and the new deadline.
6. Change the interval and verify the deadline is based on the existing last heartbeat, not the configuration transaction.
7. Create a second vault for owner A and vault 0 for owner B. Attempt cross-owner configuration, heartbeat, deposit, and withdrawal; every attempt must fail without state change.
8. Advance/wait beyond owner A's first-vault deadline. Confirm heartbeat/configuration/owner withdrawal fail and a keeper can trigger only after the strict boundary.
9. Verify the immutable snapshot, both exact entitlements, and that rounding dust goes to the last beneficiary.
10. Initiate both claims close together. Confirm no overdraw, each recipient receives exactly its entitlement, callbacks may complete in either order, and duplicate claims fail.
11. In the isolated failure environment, make a recipient transfer fail. Confirm balance, claim marker, pending count, and retry eligibility restore exactly once; replay/mismatched callbacks must be no-ops.
12. Test a failed pre-trigger fallback transfer, then trigger inheritance and complete a beneficiary claim. This is the regression path absent from the deployed artifact.
13. Leave residual funds until strictly after twice the interval. Verify only the configured fallback can sweep, equality is rejected, pending claims block fallback, and a successful sweep deactivates the vault.
14. Test insufficient balance, zero amount, invalid percentages, duplicates, missing recovery path, short intervals, early trigger, unauthorized beneficiary, and inactive-vault calls.
15. Reconcile wallet balances, gas, storage refunds, contract tracked balance, pending counts, claim totals, and final state from final RPC data and receipts.

Every transaction hash, receipt outcome, block timestamp, state view, and before/after account balance must be recorded. A root transaction success is insufficient if any receipt failed.

## 6. Human experience and documentation

The active UI now communicates:

- native NEAR and Testnet-only scope;
- public on-chain state;
- manual/permissionless inheritance triggering after the strict deadline;
- fallback sweep timing and residual-fund consequences;
- failed-payout retry behavior in the reviewed candidate;
- owner key-loss consequences and absence of an administrator;
- gas and measured storage deposits/refunds;
- irreversible close and inheritance actions;
- interval changes not being heartbeats and potentially causing immediate expiry;
- a fail-closed human-testing banner.

Wallet writes are blocked unless final chain data shows both the reviewed candidate code hash and exactly zero access keys. The currently deployed contract therefore cannot receive wallet-signed actions through the UI even if someone prematurely deletes its key.

Known human-experience gaps:

- transaction history is local/account-scoped convenience data, not an indexer-backed canonical event history;
- the contract emits no NEP-297-style events;
- users must know the public owner account and vault ID to find a beneficiary claim;
- there is no pause, lost-wallet recovery, beneficiary notification, or automatic keeper service;
- the frontend attaches a conservative 1 NEAR to storage-bearing calls and depends on contract refunds of measured excess;
- large legacy dependencies increase initial download/build size.

## 7. Exact remaining actions

1. Independently review the fallback fix, build-feature pin, candidate bytes, SHA-256, and code hash.
2. Prepare and review a code-only Testnet upgrade procedure. It must deploy the candidate without calling `new`; the existing initialized empty state must remain unchanged. The current initial-deployment script intentionally refuses overwriting deployed code and is not an upgrade script.
3. Obtain explicit authorization for the exact code-only upgrade transaction and signer. Do not combine this approval with key deletion.
4. After upgrade, independently verify every receipt, downloaded bytes, code hash, `get_allowed_tokens == []`, `vault_count == 0`, empty vault/beneficiary state, balance/storage, and unchanged one-key configuration.
5. Run the immutable-lock dry run. It must pass against the fixed candidate and exactly one expected FullAccess key.
6. If human lifecycle validation is required before irreversible primary locking, perform the plan above on a separately approved disposable Testnet deployment of the exact candidate.
7. Obtain a separate explicit approval for deleting the final primary key. Record the irreversible consequences.
8. Execute only the reviewed lock script, then independently verify exactly zero access keys and unchanged code/state.
9. Re-query the frontend release gate from final RPC data. Only then expose the primary contract to human testers.
10. Conduct a separately approved small-balance primary Testnet smoke test and retain every transaction/receipt/state record.

Until actions 1–9 are complete, the correct release status is **NOT READY FOR HUMAN TESTING**.
