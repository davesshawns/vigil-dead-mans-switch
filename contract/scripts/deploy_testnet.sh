#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REQUESTED_CONTRACT_ID="${CONTRACT_ID:-vigilvault.vigilowner.testnet}"
CONTRACT_ID="vigilvault.vigilowner.testnet"
DEPLOY_SIGNER_ID="vigilvault.vigilowner.testnet"
WASM_PATH="${WASM_PATH:-$CONTRACT_DIR/target/wasm32-unknown-unknown/release/vigil_near.wasm}"
HASH_FILE="$CONTRACT_DIR/vigil_near.wasm.sha256"
REVIEWED_WASM_SHA256="0fb47a5ed96282711862a040c56dda801977d55a05ff2fd2b0d7bb2f0413e6db"
MIN_CONTRACT_BALANCE_YOCTO="3000000000000000000000000"
NO_CODE_HASH="11111111111111111111111111111111"
NEAR_RPC_URL="https://rpc.testnet.near.org"
PREFLIGHT_ONLY="${VIGIL_TESTNET_PREFLIGHT_ONLY:-0}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

decimal_gte() {
  local actual="${1#${1%%[!0]*}}"
  local minimum="${2#${2%%[!0]*}}"
  actual="${actual:-0}"
  minimum="${minimum:-0}"

  if (( ${#actual} != ${#minimum} )); then
    (( ${#actual} > ${#minimum} ))
  else
    [[ "$actual" == "$minimum" || "$actual" > "$minimum" ]]
  fi
}

[[ "$PREFLIGHT_ONLY" == "0" || "$PREFLIGHT_ONLY" == "1" ]] \
  || fail "VIGIL_TESTNET_PREFLIGHT_ONLY must be 0 or 1"

if [[ "$PREFLIGHT_ONLY" != "1" && "${VIGIL_TESTNET_DEPLOY_CONFIRM:-}" != "DEPLOY_VIGILVAULT_VIGILOWNER_TESTNET" ]]; then
  echo "Deployment is disabled by default." >&2
  echo "Review TESTNET.md, then explicitly set:" >&2
  echo "  VIGIL_TESTNET_DEPLOY_CONFIRM=DEPLOY_VIGILVAULT_VIGILOWNER_TESTNET" >&2
  exit 2
fi

[[ "$REQUESTED_CONTRACT_ID" == "$CONTRACT_ID" ]] \
  || fail "this primary deployment script is bound to $CONTRACT_ID"

[[ "$DEPLOY_SIGNER_ID" == "$CONTRACT_ID" ]] || fail "deployment signer must equal the contract account"

command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"
command -v near >/dev/null || fail "near CLI is required"
command -v sha256sum >/dev/null || fail "sha256sum is required"

test -s "$WASM_PATH" || fail "WASM is missing or empty: $WASM_PATH"
test -s "$HASH_FILE" || fail "WASM hash file is missing or empty: $HASH_FILE"

expected_hash="$(sed -n '1s/[[:space:]].*$//p' "$HASH_FILE")"
actual_hash="$(sha256sum "$WASM_PATH" | sed -n '1s/[[:space:]].*$//p')"
if [[ "$expected_hash" != "$REVIEWED_WASM_SHA256" || "$actual_hash" != "$REVIEWED_WASM_SHA256" ]]; then
  echo "WASM hash mismatch; refusing deployment." >&2
  echo "Reviewed: $REVIEWED_WASM_SHA256" >&2
  echo "Recorded: $expected_hash" >&2
  echo "Actual:   $actual_hash" >&2
  exit 1
fi

account_query="$(jq -cn --arg account_id "$CONTRACT_ID" '{jsonrpc:"2.0",id:"account",method:"query",params:{request_type:"view_account",finality:"final",account_id:$account_id}}')"
account_response="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
  -H 'Content-Type: application/json' --data "$account_query" "$NEAR_RPC_URL")"
jq -e '.jsonrpc == "2.0" and .id == "account" and (.error == null) and (.result | type == "object")' \
  >/dev/null <<<"$account_response" || fail "invalid account response from NEAR Testnet RPC"

code_hash="$(jq -er '.result.code_hash | select(type == "string")' <<<"$account_response")" \
  || fail "account response is missing code_hash"
[[ "$code_hash" == "$NO_CODE_HASH" ]] || fail "target account already has contract code; refusing to overwrite it"

account_balance="$(jq -er '.result.amount | select(type == "string" and test("^[0-9]+$"))' <<<"$account_response")" \
  || fail "account response is missing a valid balance"
decimal_gte "$account_balance" "$MIN_CONTRACT_BALANCE_YOCTO" \
  || fail "contract account must hold at least 3 NEAR before deployment"

state_query="$(jq -cn --arg account_id "$CONTRACT_ID" '{jsonrpc:"2.0",id:"state",method:"query",params:{request_type:"view_state",finality:"final",account_id:$account_id,prefix_base64:""}}')"
state_response="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
  -H 'Content-Type: application/json' --data "$state_query" "$NEAR_RPC_URL")"
jq -e '.jsonrpc == "2.0" and .id == "state" and (.error == null) and (.result.values | type == "array")' \
  >/dev/null <<<"$state_response" || fail "invalid state response from NEAR Testnet RPC"
state_entries="$(jq -r '.result.values | length' <<<"$state_response")"
[[ "$state_entries" == "0" ]] || fail "target account already has contract state; refusing to overwrite it"

# For `near contract deploy`, the target account is also the transaction signer.
# This lookup verifies that a matching full-access key is available without
# printing or reading any private credential material.
near account get-public-key from-keychain "$DEPLOY_SIGNER_ID" network-config testnet
near account view-account-summary "$CONTRACT_ID" network-config testnet now

if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  echo "Preflight passed; deployment was not attempted."
  exit 0
fi

near contract deploy "$CONTRACT_ID" \
  use-file "$WASM_PATH" \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' \
  attached-deposit '0 NEAR' \
  network-config testnet \
  sign-with-keychain \
  send

echo "Deployment submitted. The contract is NOT ready for user funds while its full-access key remains."
echo "Inspect every receipt, then run the immutable-lock dry run:"
echo "  VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 $CONTRACT_DIR/scripts/lock_immutable_testnet.sh"
