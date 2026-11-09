#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONTRACT_ID="vigilvault.vigilowner.testnet"
NETWORK_NAME="testnet"
NEAR_RPC_URL="https://rpc.testnet.near.org"
WASM_PATH="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/vigil_near.wasm"
HASH_FILE="$CONTRACT_DIR/vigil_near.wasm.sha256"
EXECUTE="${VIGIL_TESTNET_UPGRADE_EXECUTE:-0}"

EXPECTED_NEAR_CLI_VERSION="near-cli-rs 0.30.1"
EXPECTED_CURRENT_WASM_SIZE="298281"
EXPECTED_CURRENT_WASM_SHA256="4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8"
EXPECTED_CURRENT_CODE_HASH="68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM"
EXPECTED_CANDIDATE_WASM_SIZE="301434"
EXPECTED_CANDIDATE_WASM_SHA256="7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15"
EXPECTED_CANDIDATE_CODE_HASH="9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp"
EXPECTED_BALANCE_YOCTO="3997663397051245000000000"
EXPECTED_STORAGE_USAGE="298586"
EXPECTED_RAW_STATE_ENTRIES="1"
EXPECTED_RAW_STATE_SHA256="5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239"
EXPECTED_PUBLIC_KEY="ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje"
EXPECTED_ACCESS_KEY_NONCE="276434877000001"
EXPECTED_CONFIRMATION="UPGRADE_VIGILVAULT_TO_7D18627D0BC42856E5C7A69DE4F87D3B94E9BD4B493AB9B026B6E1D2ED430C15"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

rpc() {
  local payload="$1"
  if ! curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
    -H 'Content-Type: application/json' --data "$payload" "$NEAR_RPC_URL"; then
    fail "NEAR Testnet RPC request failed"
  fi
}

call_view_at_block() {
  local block_hash="$1"
  local method_name="$2"
  local args_json="$3"
  local args_base64
  local payload
  args_base64="$(printf '%s' "$args_json" | base64 -w0)"
  payload="$(jq -cn \
    --arg account_id "$CONTRACT_ID" \
    --arg block_id "$block_hash" \
    --arg method_name "$method_name" \
    --arg args_base64 "$args_base64" \
    '{jsonrpc:"2.0",id:$method_name,method:"query",params:{request_type:"call_function",block_id:$block_id,account_id:$account_id,method_name:$method_name,args_base64:$args_base64}}')"
  rpc "$payload"
}

near_code_hash() {
  local wasm_path="$1"
  node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const digest = crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest();
    let value = BigInt("0x" + digest.toString("hex"));
    let encoded = "";
    while (value > 0n) {
      encoded = alphabet[Number(value % 58n)] + encoded;
      value /= 58n;
    }
    for (const byte of digest) {
      if (byte !== 0) break;
      encoded = "1" + encoded;
    }
    process.stdout.write(encoded || "1");
  ' "$wasm_path"
}

[[ "$EXECUTE" == "0" || "$EXECUTE" == "1" ]] \
  || fail "VIGIL_TESTNET_UPGRADE_EXECUTE must be 0 or 1"

for dependency in curl jq base64 sha256sum stat node near; do
  command -v "$dependency" >/dev/null || fail "$dependency is required"
done

actual_near_version="$(near --version)"
[[ "$actual_near_version" == "$EXPECTED_NEAR_CLI_VERSION" ]] \
  || fail "unsupported NEAR CLI version: expected '$EXPECTED_NEAR_CLI_VERSION', got '$actual_near_version'"

expected_wasm_path="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/vigil_near.wasm"
[[ "$WASM_PATH" == "$expected_wasm_path" ]] || fail "candidate path differs from the reviewed path"
test -f "$WASM_PATH" || fail "candidate WASM is missing: $WASM_PATH"
test ! -L "$WASM_PATH" || fail "candidate WASM must not be a symbolic link"
test -f "$HASH_FILE" || fail "candidate checksum file is missing: $HASH_FILE"

read -r recorded_hash recorded_path < "$HASH_FILE"
[[ "$recorded_hash" == "$EXPECTED_CANDIDATE_WASM_SHA256" ]] \
  || fail "recorded candidate checksum differs from the reviewed checksum"
[[ "$recorded_path" == "target/wasm32-unknown-unknown/release/vigil_near.wasm" ]] \
  || fail "recorded candidate path differs from the reviewed path"

candidate_size="$(stat -c '%s' "$WASM_PATH")"
candidate_hash="$(sha256sum "$WASM_PATH" | sed -n '1s/[[:space:]].*$//p')"
candidate_code_hash="$(near_code_hash "$WASM_PATH")"
[[ "$candidate_size" == "$EXPECTED_CANDIDATE_WASM_SIZE" ]] || fail "candidate WASM size mismatch"
[[ "$candidate_hash" == "$EXPECTED_CANDIDATE_WASM_SHA256" ]] || fail "candidate WASM checksum mismatch"
[[ "$candidate_code_hash" == "$EXPECTED_CANDIDATE_CODE_HASH" ]] || fail "candidate NEAR code hash mismatch"
echo "Local candidate verification passed. Reading one frozen final Testnet block..."

block_payload="$(jq -cn '{jsonrpc:"2.0",id:"block",method:"block",params:{finality:"final"}}')"
block_response="$(rpc "$block_payload")"
jq -e '.error == null and (.result.header.hash | type == "string") and (.result.header.height | type == "number")' \
  >/dev/null <<<"$block_response" || fail "unable to select a final Testnet block"
snapshot_block_hash="$(jq -er '.result.header.hash' <<<"$block_response")"
snapshot_block_height="$(jq -er '.result.header.height' <<<"$block_response")"
echo "Frozen final block: $snapshot_block_height ($snapshot_block_hash)"

account_payload="$(jq -cn --arg account_id "$CONTRACT_ID" --arg block_id "$snapshot_block_hash" '{jsonrpc:"2.0",id:"account",method:"query",params:{request_type:"view_account",block_id:$block_id,account_id:$account_id}}')"
keys_payload="$(jq -cn --arg account_id "$CONTRACT_ID" --arg block_id "$snapshot_block_hash" '{jsonrpc:"2.0",id:"keys",method:"query",params:{request_type:"view_access_key_list",block_id:$block_id,account_id:$account_id}}')"
state_payload="$(jq -cn --arg account_id "$CONTRACT_ID" --arg block_id "$snapshot_block_hash" '{jsonrpc:"2.0",id:"state",method:"query",params:{request_type:"view_state",block_id:$block_id,account_id:$account_id,prefix_base64:""}}')"
code_payload="$(jq -cn --arg account_id "$CONTRACT_ID" --arg block_id "$snapshot_block_hash" '{jsonrpc:"2.0",id:"code",method:"query",params:{request_type:"view_code",block_id:$block_id,account_id:$account_id}}')"

account_response="$(rpc "$account_payload")"
keys_response="$(rpc "$keys_payload")"
state_response="$(rpc "$state_payload")"
code_response="$(rpc "$code_payload")"
echo "Account, key, raw-state, and deployed-code responses received."

for response_name in account keys state code; do
  response_value="${response_name}_response"
  jq -e --arg block_hash "$snapshot_block_hash" '.error == null and .result.block_hash == $block_hash' \
    >/dev/null <<<"${!response_value}" || fail "$response_name query did not return the frozen final block"
done

current_code_hash="$(jq -er '.result.code_hash' <<<"$account_response")"
current_balance="$(jq -er '.result.amount | select(type == "string" and test("^[0-9]+$"))' <<<"$account_response")"
current_locked="$(jq -er '.result.locked | select(type == "string" and test("^[0-9]+$"))' <<<"$account_response")"
current_storage_usage="$(jq -er '.result.storage_usage' <<<"$account_response")"
[[ "$current_code_hash" == "$EXPECTED_CURRENT_CODE_HASH" ]] || fail "current deployed code hash changed"
[[ "$current_balance" == "$EXPECTED_BALANCE_YOCTO" ]] || fail "account balance changed from the reviewed preflight"
[[ "$current_locked" == "0" ]] || fail "account locked balance is unexpected"
[[ "$current_storage_usage" == "$EXPECTED_STORAGE_USAGE" ]] || fail "account storage usage changed from the reviewed preflight"

current_wasm_hash="$(jq -er '.result.code_base64' <<<"$code_response" | base64 --decode | sha256sum | sed -n '1s/[[:space:]].*$//p')"
current_wasm_size="$(jq -er '.result.code_base64' <<<"$code_response" | base64 --decode | wc -c | tr -d '[:space:]')"
[[ "$current_wasm_hash" == "$EXPECTED_CURRENT_WASM_SHA256" ]] || fail "downloaded deployed WASM checksum changed"
[[ "$current_wasm_size" == "$EXPECTED_CURRENT_WASM_SIZE" ]] || fail "downloaded deployed WASM size changed"

total_keys="$(jq -er '.result.keys | length' <<<"$keys_response")"
full_access_keys="$(jq -er '[.result.keys[] | select(.access_key.permission == "FullAccess")] | length' <<<"$keys_response")"
function_call_keys="$(jq -er '[.result.keys[] | select(.access_key.permission | type == "object")] | length' <<<"$keys_response")"
actual_public_key="$(jq -er '.result.keys[0].public_key' <<<"$keys_response")"
actual_key_nonce="$(jq -er '.result.keys[0].access_key.nonce' <<<"$keys_response")"
[[ "$total_keys" == "1" && "$full_access_keys" == "1" && "$function_call_keys" == "0" ]] \
  || fail "access-key configuration changed"
[[ "$actual_public_key" == "$EXPECTED_PUBLIC_KEY" ]] || fail "the remaining FullAccess key changed"
[[ "$actual_key_nonce" == "$EXPECTED_ACCESS_KEY_NONCE" ]] || fail "the remaining FullAccess key nonce changed"

raw_state_entries="$(jq -er '.result.values | length' <<<"$state_response")"
raw_state_hash="$(jq -cS '.result.values | sort_by(.key) | map({key,value})' <<<"$state_response" | sha256sum | sed -n '1s/[[:space:]].*$//p')"
[[ "$raw_state_entries" == "$EXPECTED_RAW_STATE_ENTRIES" ]] || fail "raw contract-state entry count changed"
[[ "$raw_state_hash" == "$EXPECTED_RAW_STATE_SHA256" ]] || fail "raw contract state changed"

tokens_response="$(call_view_at_block "$snapshot_block_hash" get_allowed_tokens '{}')"
vault_count_response="$(call_view_at_block "$snapshot_block_hash" vault_count '{}')"
vaults_response="$(call_view_at_block "$snapshot_block_hash" get_vaults '{"owner":"vigilvault.vigilowner.testnet"}')"
vault_response="$(call_view_at_block "$snapshot_block_hash" get_vault '{"owner":"vigilvault.vigilowner.testnet","vault_id":0}')"
beneficiaries_response="$(call_view_at_block "$snapshot_block_hash" get_beneficiaries '{"owner":"vigilvault.vigilowner.testnet","vault_id":0}')"
echo "Initialized-state view responses received."

for response_name in tokens vault_count vaults vault beneficiaries; do
  response_value="${response_name}_response"
  jq -e --arg block_hash "$snapshot_block_hash" '.error == null and .result.block_hash == $block_hash' \
    >/dev/null <<<"${!response_value}" || fail "$response_name view did not return the frozen final block"
done

allowed_tokens="$(jq -ce '.result.result | implode | fromjson' <<<"$tokens_response")"
vault_count="$(jq -er '.result.result | implode | fromjson' <<<"$vault_count_response")"
vaults="$(jq -ce '.result.result | implode | fromjson' <<<"$vaults_response")"
vault="$(jq -c '.result.result | implode | fromjson' <<<"$vault_response")"
beneficiaries="$(jq -ce '.result.result | implode | fromjson' <<<"$beneficiaries_response")"
[[ "$allowed_tokens" == "[]" ]] || fail "allowed token state changed"
[[ "$vault_count" == "0" ]] || fail "vault_count is no longer zero"
[[ "$vaults" == "[]" ]] || fail "unexpected owner vault state exists"
[[ "$vault" == "null" ]] || fail "unexpected vault zero state exists"
[[ "$beneficiaries" == "[]" ]] || fail "unexpected beneficiary state exists"

echo "Code-only upgrade preflight passed at final block $snapshot_block_height ($snapshot_block_hash)."
echo "Current deployed WASM: $current_wasm_size bytes, SHA-256 $current_wasm_hash"
echo "Candidate WASM: $candidate_size bytes, SHA-256 $candidate_hash"
echo "Candidate NEAR code hash: $candidate_code_hash"
echo "State: allowed_tokens=[], vault_count=0, raw state SHA-256 $raw_state_hash"
echo "Access keys: exactly one FullAccess key, $actual_public_key"

if [[ "$EXECUTE" == "0" ]]; then
  echo "Preflight only; no transaction was signed or broadcast."
  exit 0
fi

echo
echo "LIVE TESTNET CODE-ONLY UPGRADE REQUESTED."
echo "This will submit exactly one DeployContract action to $CONTRACT_ID."
echo "It will not call new, migrate state, transfer funds, or change access keys."
echo "Type the exact confirmation below immediately before submission:"
echo "  $EXPECTED_CONFIRMATION"
read -r confirmation
[[ "$confirmation" == "$EXPECTED_CONFIRMATION" ]] || fail "upgrade confirmation did not match; nothing was submitted"

near contract deploy "$CONTRACT_ID" \
  use-file "$WASM_PATH" \
  without-init-call \
  network-config "$NETWORK_NAME" \
  sign-with-keychain --signer-public-key "$EXPECTED_PUBLIC_KEY" \
  send --wait-until final

echo "Upgrade command returned. STOP: independently verify the transaction and final chain state before any further operation."
