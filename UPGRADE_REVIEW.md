# Vigil code-only Testnet upgrade review

Date: 2026-11-07  
Primary account: `vigilvault.vigilowner.testnet`  
Network: NEAR Testnet  
Scope: review and preparation only

## Verdict

**GO for a separately authorized code-only upgrade using the reviewed script and exact candidate artifact. NO-GO for execution under this task.**

The procedure is technically ready because:

- the current deployment is still exactly the reviewed empty deployment;
- the fixed candidate is reproducible and matches its reviewed size, SHA-256, and NEAR code hash;
- the candidate deserializes and reserializes the exact deployed root state byte-for-byte;
- `vault_count == 0`, the raw state contains only the root `STATE` entry, and there are no pending-transfer or vault records requiring migration;
- NEAR's deploy-code action replaces contract code without calling the contract or modifying its key-value state;
- the proposed command uses the CLI's explicit `without-init-call` branch and contains no other action.

No upgrade, deployment, signature, broadcast, funding, transfer, contract mutation, or key operation was performed during this review.

---

## Addendum — authorized execution and verification (2026-11-09)

The upgrade authorized in the review above has been executed and independently verified.

### Executed transaction

- Transaction ID: `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`
- Signer and receiver: `vigilvault.vigilowner.testnet`
- Signing public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Actions: exactly one `DeployContract` containing the reviewed candidate bytes
- No `FunctionCall`, initializer, transfer, `AddKey`, `DeleteKey`, stake, or `DeleteAccount` action
- Root status and every receipt status: `SuccessValue` (final)
- Gas burned: 2.4 Tgas; transaction fee: 0.0002346494790566 NEAR

### Independent post-upgrade verification (final block)

| Check | Expected | Actual | Match |
|---|---|---|---|
| Deployed code hash | `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp` | `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp` | yes |
| Deployed WASM SHA-256 | `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` | `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` | yes |
| Deployed WASM size | 301,434 bytes | 301,434 bytes | yes |
| Raw state entries | 1 | 1 | yes |
| Raw state SHA-256 | `5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239` | `5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239` | yes |
| `get_allowed_tokens` | `[]` | `[]` | yes |
| `vault_count` | 0 | 0 | yes |
| Storage usage | 301,739 bytes | 301,739 bytes | yes |
| Locked balance | 0 | 0 | yes |
| Total access keys | 1 (unchanged by code-only upgrade) | 1 | yes |
| FullAccess keys | 1 | 1 | yes |
| FunctionCall keys | 0 | 0 | yes |
| Remaining public key | `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje` | `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje` | yes |
| Access-key nonce | 276434877000002 (incremented by 1) | 276434877000002 | yes |

Balance reconciliation: pre-upgrade `3997663397051245000000000` yoctoNEAR − post-upgrade `3995453016967018800000000` = `2210380084226200000000` yoctoNEAR, which equals tokens_burnt (`1975730605169600000000`) plus transaction fee (`234649479056600000000`). No unexplained balance difference.

State remained byte-identical (raw state SHA-256 unchanged), proving no initializer or state-writing method ran as part of the upgrade. The only expected change is the FullAccess key nonce increasing by one because it signed the upgrade.

### Immutable-lock preflight

The reviewed lock preflight (`contract/scripts/lock_immutable_testnet.sh`, dry run) passes against the upgraded account: reviewed code is deployed, `get_allowed_tokens == []`, `vault_count == 0`, and exactly one FullAccess key remains. **Key deletion was not executed** — it remains a separate explicitly authorized operation.

### Remaining custody note

One FullAccess key (`ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`) is still present. Until it is deleted and zero keys are independently verified, the account is not custody-immune and must not receive user funds.

## Reviewed artifacts

| Artifact | Size | SHA-256 | NEAR code hash |
|---|---:|---|---|
| Current Testnet code | 298281 bytes | `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8` | `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM` |
| Fixed local candidate | 301434 bytes | `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` | `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp` |

Reviewed candidate path:

```text
/home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract/target/wasm32-unknown-unknown/release/vigil_near.wasm
```

## Files and commands inspected

Files:

- `contract/scripts/deploy_testnet.sh`
- `contract/scripts/build_release.sh`
- `contract/scripts/lock_immutable_testnet.sh`
- `contract/scripts/tests/lock_immutable_testnet_test.sh`
- `contract/vigil_near.wasm.sha256`
- `contract/src/lib.rs`
- `contract/src/basic_tests.rs`
- `contract/src/callback_regression_tests.rs`
- `DEPLOYMENT_REPORT.md`
- `DEPLOYMENT_RUNBOOK.md`
- `HUMAN_READINESS_REPORT.md`
- `FINAL_REPORT.md`
- `contract/TESTNET.md`

CLI inspection commands:

```bash
near --version
near contract deploy --help
near contract deploy vigilvault.vigilowner.testnet use-file --help
near contract deploy vigilvault.vigilowner.testnet \
  use-file contract/target/wasm32-unknown-unknown/release/vigil_near.wasm \
  without-init-call --help
near contract deploy vigilvault.vigilowner.testnet \
  use-file contract/target/wasm32-unknown-unknown/release/vigil_near.wasm \
  without-init-call network-config testnet sign-with-keychain --help
near contract deploy vigilvault.vigilowner.testnet \
  use-file contract/target/wasm32-unknown-unknown/release/vigil_near.wasm \
  without-init-call network-config testnet sign-with-keychain send --help
```

Installed and reviewed CLI:

```text
near-cli-rs 0.30.1
```

The proposed script rejects every other CLI version. Version 0.30.1 exposes the explicit path:

```text
contract deploy → use-file → without-init-call → network-config → sign-with-keychain → send
```

`without-init-call` is the required mechanism. The historical `deploy_testnet.sh` is not suitable: it deliberately refuses existing code/state and uses `with-init-call new` for first deployment.

## Proposed script

Created:

```text
contract/scripts/upgrade_testnet_code_only.sh
```

Default read-only use:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
./scripts/upgrade_testnet_code_only.sh
```

The default is preflight-only. It cannot reach the NEAR deploy command because `VIGIL_TESTNET_UPGRADE_EXECUTE` defaults to `0`.

The separately approval-gated live invocation would be:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
VIGIL_TESTNET_UPGRADE_EXECUTE=1 ./scripts/upgrade_testnet_code_only.sh
```

After all checks pass, the script requires the operator to type this exact phrase immediately before submission:

```text
UPGRADE_VIGILVAULT_TO_7D18627D0BC42856E5C7A69DE4F87D3B94E9BD4B493AB9B026B6E1D2ED430C15
```

The script's only live command is:

```bash
near contract deploy vigilvault.vigilowner.testnet \
  use-file /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract/target/wasm32-unknown-unknown/release/vigil_near.wasm \
  without-init-call \
  network-config testnet \
  sign-with-keychain --signer-public-key ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje \
  send --wait-until final
```

Expected transaction:

- signer: `vigilvault.vigilowner.testnet`;
- receiver: `vigilvault.vigilowner.testnet`;
- signing key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`;
- actions: exactly one `DeployContract` action containing the reviewed candidate bytes;
- no `FunctionCall`, including no call to `new` or migration method;
- no transfer, stake, key, or account-deletion action.

## Fail-closed preflight

The script refuses to continue unless all of the following match exactly:

- account `vigilvault.vigilowner.testnet`;
- network `testnet` and RPC `https://rpc.testnet.near.org`;
- CLI `near-cli-rs 0.30.1`;
- fixed candidate path and checksum-file path;
- candidate is a regular file, not a symlink;
- candidate size 301434;
- candidate SHA-256 `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`;
- candidate code hash `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`;
- current code hash `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM`;
- downloaded current WASM size 298281 and reviewed SHA-256;
- account balance `3997663397051245000000000` yoctoNEAR;
- locked balance `0`;
- storage usage 298586;
- exact raw state entry count and hash;
- `get_allowed_tokens == []`;
- `vault_count == 0`;
- owner vault list empty, vault zero absent, and beneficiary list empty;
- exactly one FullAccess key and zero FunctionCall keys;
- exact public key and exact current access-key nonce.

All account, code, state, key, and view queries are pinned to the same final block hash. This avoids combining values from different chain snapshots.

Fresh successful preflight evidence:

```text
Final block: 276559433
Block hash: FP6K1Sg3APVj2wwJawm6MGNPTyw4jx512DUMX9g6KT53
Current WASM: 298281 bytes
Current SHA-256: 4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8
Candidate WASM: 301434 bytes
Candidate SHA-256: 7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15
Candidate code hash: 9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp
Raw state SHA-256: 5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239
Access keys: one FullAccess key, zero FunctionCall keys
Result: Preflight only; no transaction was signed or broadcast.
```

## Independent manual preflight

The script is the preferred reproducible preflight. An independent reviewer should also perform raw final RPC checks. First freeze one final block:

```bash
RPC=https://rpc.testnet.near.org
ACCOUNT=vigilvault.vigilowner.testnet
BLOCK_PAYLOAD="$(jq -cn '{jsonrpc:"2.0",id:"block",method:"block",params:{finality:"final"}}')"
BLOCK_RESPONSE="$(curl --fail --silent --show-error \
  -H 'Content-Type: application/json' --data "$BLOCK_PAYLOAD" "$RPC")"
BLOCK_HASH="$(jq -er '.result.header.hash' <<<"$BLOCK_RESPONSE")"
BLOCK_HEIGHT="$(jq -er '.result.header.height' <<<"$BLOCK_RESPONSE")"
printf '%s %s\n' "$BLOCK_HEIGHT" "$BLOCK_HASH"
```

Use that same `BLOCK_HASH` as `block_id` for `view_account`, `view_code`, `view_state`, `view_access_key_list`, and every `call_function` query. Required values before upgrade:

```text
amount = 3997663397051245000000000
locked = 0
storage_usage = 298586
code_hash = 68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM
deployed WASM SHA-256 = 4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8
deployed WASM size = 298281
raw state entries = 1
raw state SHA-256 = 5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239
allowed tokens = []
vault count = 0
vaults = []
vault 0 = null
beneficiaries = []
FullAccess keys = 1
FunctionCall keys = 0
public key = ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje
access-key nonce = 276434877000001
```

Local candidate verification:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
sha256sum -c vigil_near.wasm.sha256
stat -c '%s' target/wasm32-unknown-unknown/release/vigil_near.wasm
```

The NEAR code hash is base58 encoding of the 32-byte SHA-256 digest. The proposed script calculates it locally and requires `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`.

## State-preservation analysis

NEAR stores account code and contract key-value state separately. A successful `DeployContract` action replaces the account's code bytes; it does not execute the new code and does not clear or rewrite contract storage.

The candidate's top-level `VaultRegistry` field order and map prefixes match the exact deployed root `STATE` value. The only fallback fix adds data to `PendingTransfer` values. This would require migration if old serialized pending-transfer entries existed, because old values would lack the added field. They do not exist here:

- global `vault_count` is zero;
- the raw state has exactly one entry, key `STATE`;
- there are no `v`, `pt`, entitlement, claim, allowance, owner-index, or nonce entries;
- the candidate successfully deserializes the exact 78 deployed state bytes and serializes them back byte-for-byte.

Regression test:

```text
basic_tests::fixed_candidate_deserializes_the_exact_deployed_empty_state
```

Therefore no migration is necessary or permitted for this specific empty deployment. If the raw state entry count/hash, vault count, or any visible initialized state changes, the reviewed conclusion no longer applies and the procedure must stop.

## Post-upgrade verification

After a separately authorized upgrade, record the transaction hash and do not run the immutable-lock script yet.

### 1. Transaction and receipts

```bash
near transaction view-status <UPGRADE_TRANSACTION_HASH> network-config testnet
```

Required:

- final execution status is `Final`;
- signer and receiver are both `vigilvault.vigilowner.testnet`;
- signer key is the reviewed FullAccess key;
- transaction contains exactly one `DeployContract` action;
- there is no FunctionCall, initializer, transfer, AddKey, DeleteKey, stake, or DeleteAccount action;
- root status and every receipt status are successful;
- the deployed code digest corresponds to the fixed candidate.

Any failed, unknown, or non-final receipt is a STOP condition. Do not retry an uncertain transaction blindly; query its hash until final or determine the chain state independently.

### 2. Freeze a new final block

Repeat the raw RPC block-freezing procedure and pin every post-upgrade query to the same new final block.

Required post-upgrade account/code values:

```text
code_hash = 9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp
downloaded WASM SHA-256 = 7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15
downloaded WASM size = 301434
storage_usage = 301739
locked = 0
```

Storage usage should increase by exactly 3153 bytes, the candidate/current code-size difference. The account balance should decrease only by the transaction's actual burned fees. Under the required no-concurrent-activity assumption:

```text
pre-upgrade amount - post-upgrade amount = sum of tokens_burnt in the transaction and receipt outcomes
```

Any unexplained balance difference is a STOP condition.

### 3. Verify state remained byte-identical

Required:

```text
raw state entries = 1
raw state SHA-256 = 5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239
get_allowed_tokens = []
vault_count = 0
get_vaults(primary account) = []
get_vault(primary account, 0) = null
get_beneficiaries(primary account, 0) = []
```

An unchanged raw-state hash proves that no initializer or state-writing method ran as part of the upgrade.

### 4. Verify access keys

Required:

```text
total keys = 1
FullAccess keys = 1
FunctionCall keys = 0
public key = ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje
nonce = 276434877000002
```

The only expected key change is the FullAccess key nonce increasing by one because it signed the upgrade. The key and permission must remain present and unchanged. Any added, deleted, or permission-modified key is a STOP condition.

### 5. Stop before locking

Even after successful upgrade verification, stop. Immutable locking is a separate irreversible operation requiring its own fresh preflight and explicit authorization.

## Failure behavior and recovery

### Before key deletion

- If local preflight fails, no transaction is constructed or signed.
- If the operator confirmation is absent or incorrect, no transaction is submitted.
- If signing fails, chain state remains unchanged.
- A deploy action is executed atomically. If WASM validation, account authorization, storage/balance checks, or the receipt fails, the code replacement does not commit; the old contract remains installed. Transaction fees may still be burned.
- If the client loses the response after submission, the result is uncertain. Do not retry. Query the transaction hash, access-key nonce, and deployed code hash first.
- While the FullAccess key remains, a failed or incorrect upgrade can potentially be retried or corrected after a new review and authorization.

### After successful upgrade but before key deletion

The fixed code is active, initialized state remains available, and the FullAccess key still permits a separately authorized correction. This is the final recovery window.

### After permanent key deletion

There is no same-account upgrade, transfer, key recovery, or account-deletion path. A defect requires a new account and explicit migration design. This is why upgrade and immutable locking must never be combined in one transaction or approval: post-upgrade evidence must be independently reviewed while recovery is still possible.

## Risks and assumptions

- The procedure is valid only while the primary account remains unused and its exact frozen state matches the reviewed constants.
- The signer must have exclusive operational control during the upgrade window; no concurrent transaction may use the key.
- RPC responses must be from the fixed Testnet endpoint and one final block.
- `near-cli-rs 0.30.1` is the only reviewed CLI version for this command sequence.
- The script intentionally hardcodes balance, storage, raw-state hash, key nonce, current code, candidate code, account, network, and paths. Any legitimate drift requires a new review rather than bypassing the gate.
- No human lifecycle should be created on the primary account before immutable locking because the lock preflight requires `vault_count == 0` and vault records cannot be deleted.

## Verification performed during this review

```bash
cd contract
./scripts/build_release.sh
```

Result: candidate rebuilt reproducibly; size and SHA-256 matched the reviewed artifact.

```bash
cargo test --locked --target x86_64-unknown-linux-gnu
cargo clippy --locked --target x86_64-unknown-linux-gnu --all-targets -- -D warnings
```

Result: 48 Rust tests passed, 0 failed; Clippy passed with warnings denied.

```bash
./scripts/upgrade_testnet_code_only.sh
```

Result: read-only preflight passed at final block `276559433`; it explicitly reported that no transaction was signed or broadcast.

No live execution branch was entered.
