# Vigil immutable native-NEAR Testnet deployment runbook

> **Human-readiness hold (current):** the fixed candidate is now deployed and independently verified (tx `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`, code hash `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`). **One FullAccess key still remains** — do not accept user funds or execute permanent key deletion until zero access keys are independently verified after a separately authorized immutable lock. The code-only upgrade is complete; the lock is not.

The reviewed code-only upgrade is documented in `UPGRADE_REVIEW.md` and has been executed under separate explicit authorization. The immutable-lock script (`contract/scripts/lock_immutable_testnet.sh`) passes in dry-run mode against the upgraded account. Permanent key deletion remains unauthorized without separate explicit approval.

Deployment and initialization completed in transaction `DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY` (superseded artifact); the code-only upgrade completed in transaction `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`. Do not rerun the deployment step. This runbook records the reviewed procedures. Funding, transfers, and key deletion remain unauthorized without separate approval.

## 1. Deployed scope (current, post-upgrade)

- Network: NEAR Testnet only
- Contract account: `vigilvault.vigilowner.testnet`
- Asset enabled for this deployment: native NEAR only
- Immutable token allowlist: exactly `[]`
- Canonical initializer: `{"allowed_tokens":[]}`
- Initializer SHA-256: `2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4`
- Deployed WASM SHA-256: `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`
- Deployed WASM size: 301,434 bytes
- Deployed NEAR code hash: `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`
- Upgrade transaction: `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`
- Allowance minimum: 60 seconds
- Final custody policy: zero FullAccess keys and zero function-call keys (**pending** — one FullAccess key remains)

Historical original deployment (superseded, retained for audit):

- Original deployment transaction: `DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY`
- Original WASM SHA-256: `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8`
- Original WASM size: 298,281 bytes
- Original NEAR code hash: `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM`

The generic reviewed contract contains NEP-141 code, but the empty immutable allowlist makes `create_ft_vault` reject every token and makes `ft_on_transfer` refund every attempted FT deposit. NEP-141 cannot be enabled later on this deployment. Supporting an FT would require a separately reviewed new contract deployment.

There is no FT registration step, Circle dependency, issuer freeze/denylist dependency, administrator, upgrade method, or privileged withdrawal.

## 2. Local build and verification

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
./scripts/build_release.sh
sha256sum -c vigil_near.wasm.sha256
stat -c '%n %s bytes' target/wasm32-unknown-unknown/release/vigil_near.wasm
```

Expected result for the current fixed local candidate: 301434 bytes and SHA-256 `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`.

Verify the canonical initializer locally:

```bash
VIGIL_ALLOWED_TOKENS_JSON='[]'
INIT_ARGS="$(jq -cn --argjson tokens "$VIGIL_ALLOWED_TOKENS_JSON" '{allowed_tokens:$tokens}')"
printf '%s\n' "$INIT_ARGS"
printf '%s' "$INIT_ARGS" | sha256sum
```

Expected JSON: `{"allowed_tokens":[]}`. Expected SHA-256: `2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4`.

### Approval checkpoint 1

Record the exact target, artifact hash, initializer JSON/hash, and zero-key final policy. Stop if any value differs.

## 3. Historical read-only deployment preflight

This section records the original empty-account deployment procedure. It is not an upgrade command and now fails closed because the target already contains code and state.

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
VIGIL_ALLOWED_TOKENS_JSON='[]' \
VIGIL_TESTNET_PREFLIGHT_ONLY=1 \
./scripts/deploy_testnet.sh
```

The script is bound to the reviewed account, WASM hash, empty allowlist, and native-only initializer hash. It must report:

- no deployed contract code;
- zero contract-state entries;
- at least 3 NEAR account balance;
- one available deployment key without exposing private material;
- initializer JSON `{"allowed_tokens":[]}`;
- initializer SHA-256 `2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4`;
- `Preflight passed; deployment was not attempted.`

Read access keys independently:

```bash
KEYS_PAYLOAD="$(jq -cn '{jsonrpc:"2.0",id:"keys",method:"query",params:{request_type:"view_access_key_list",finality:"final",account_id:"vigilvault.vigilowner.testnet"}}')"
curl --fail --silent --show-error -H 'Content-Type: application/json' \
  --data "$KEYS_PAYLOAD" https://rpc.testnet.near.org | \
  jq '{block_height:.result.block_height,total_keys:(.result.keys|length),full_access_keys:([.result.keys[]|select(.access_key.permission=="FullAccess")]|length),function_call_keys:([.result.keys[]|select(.access_key.permission|type=="object")]|length)}'
```

Expected before deployment: exactly one FullAccess key and zero function-call keys. Stop if code/state already exists or the key set differs.

### Approval checkpoint 2

Deployment is a live signed transaction. Obtain separate explicit approval for the exact artifact, native-only initializer, target account, and signer before continuing.

## 4. Live deployment command — do not run during preparation

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
export VIGIL_ALLOWED_TOKENS_JSON='[]'
export VIGIL_INIT_ARGS_SHA256='2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4'
export VIGIL_TESTNET_DEPLOY_CONFIRM='DEPLOY_VIGILVAULT_VIGILOWNER_TESTNET'
./scripts/deploy_testnet.sh
```

The script refuses a non-empty token array, incorrect initializer hash, existing code/state, artifact mismatch, target override, or missing confirmation. Save and inspect the transaction hash, status, logs, every receipt, and final block. Do not accept deposits yet.

## 5. Post-deployment verification

Verify initialized state:

```bash
near contract call-function as-read-only \
  vigilvault.vigilowner.testnet get_allowed_tokens json-args '{}' \
  network-config testnet now

near contract call-function as-read-only \
  vigilvault.vigilowner.testnet vault_count json-args '{}' \
  network-config testnet now
```

Required results: `get_allowed_tokens` returns exactly `[]`; `vault_count` returns `0`.

Download and independently hash deployed code:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
DEPLOYED_WASM=/tmp/vigil-deployed-testnet.wasm
CODE_PAYLOAD="$(jq -cn '{jsonrpc:"2.0",id:"code",method:"query",params:{request_type:"view_code",finality:"final",account_id:"vigilvault.vigilowner.testnet"}}')"
curl --fail --silent --show-error -H 'Content-Type: application/json' \
  --data "$CODE_PAYLOAD" https://rpc.testnet.near.org | \
  jq -er '.result.code_base64' | base64 --decode > "$DEPLOYED_WASM"
sha256sum "$DEPLOYED_WASM"
sha256sum -c vigil_near.wasm.sha256
cmp --silent "$DEPLOYED_WASM" target/wasm32-unknown-unknown/release/vigil_near.wasm
```

Expected deployed SHA-256: `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15` (the reviewed fixed candidate, now deployed). The historical original artifact SHA-256 was `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8` and is superseded.

## 6. Immutable-lock dry run

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
VIGIL_ALLOWED_TOKENS_JSON='[]' \
VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 \
./scripts/lock_immutable_testnet.sh
```

The script verifies deployed code bytes, `get_allowed_tokens == []`, `vault_count == 0`, and exactly one final FullAccess key with no additional key.

The dry run now passes against the upgraded account (`Immutable-lock preflight passed`). Do not use the live key-deletion branch without checkpoint 3 approval.

### Approval checkpoint 3 — irreversible

Confirm that the artifact and initializer match, no repair is required, no access key other than the reviewed deployment key exists, and permanent immutability is approved. Removing the last key eliminates code upgrades, signed account transfers, account deletion, and key-based recovery.

## 7. Permanent key deletion — do not run without checkpoint 3 approval

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
export VIGIL_ALLOWED_TOKENS_JSON='[]'
export VIGIL_IMMUTABLE_LOCK_DRY_RUN=0
export VIGIL_IMMUTABLE_LOCK_CONFIRM='PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET'
./scripts/lock_immutable_testnet.sh
```

The script deletes the one key read from final chain state and requires the post-transaction key count to be zero.

Independently verify:

```bash
KEYS_PAYLOAD="$(jq -cn '{jsonrpc:"2.0",id:"keys",method:"query",params:{request_type:"view_access_key_list",finality:"final",account_id:"vigilvault.vigilowner.testnet"}}')"
curl --fail --silent --show-error -H 'Content-Type: application/json' \
  --data "$KEYS_PAYLOAD" https://rpc.testnet.near.org | \
  jq '{total_keys:(.result.keys|length),keys:.result.keys}'
```

Expected: `total_keys: 0`. No function-call key is required.

## 8. Release gate

Do not publish the contract for user deposits until deployment receipts, deployed-code comparison, `get_allowed_tokens == []`, empty initial state, immutable-lock dry run, separately approved key deletion, and independent zero-key verification are recorded. A small-balance Testnet lifecycle is a separate authorized post-deployment step.
