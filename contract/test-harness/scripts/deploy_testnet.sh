#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
HARNESS_ID="${HARNESS_ID:-}"
CONTROLLER_ID="${CONTROLLER_ID:-}"
VIGIL_CONTRACT_ID="${VIGIL_CONTRACT_ID:-}"
VAULT_OWNER_ID="${VAULT_OWNER_ID:-}"
VAULT_ID="${VAULT_ID:-0}"
DELETION_REFUND_ID="${DELETION_REFUND_ID:-}"
EXPECTED_VIGIL_CODE_HASH="${EXPECTED_VIGIL_CODE_HASH:-}"
NEAR_RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
WASM_PATH="${WASM_PATH:-$HARNESS_DIR/target/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm}"
HASH_FILE="${HASH_FILE:-$HARNESS_DIR/vigil_failed_transfer_harness.wasm.sha256}"
NO_CODE_HASH="11111111111111111111111111111111"
PRIMARY_VIGIL_CONTRACT_ID="vigilvault.vigilowner.testnet"

PROTECTED_DELETION_REFUND_ACCOUNTS=(
  "vigilvault.vigilowner.testnet"
  "dragon-vigil.testnet"
  "dragon-owner.testnet"
  "dragon-beneficiary1.testnet"
  "dragon-beneficiary2.testnet"
)

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

validate_account_id() {
  local variable_name="$1"
  local account_id="$2"

  if (( ${#account_id} < 2 || ${#account_id} > 64 )) ||
    [[ ! "$account_id" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]]; then
    fail "$variable_name is not a valid NEAR account ID: $account_id"
  fi
}

validate_code_hash() {
  local variable_name="$1"
  local code_hash="$2"

  if [[ "$code_hash" == "$NO_CODE_HASH" ]] ||
    [[ ! "$code_hash" =~ ^[1-9A-HJ-NP-Za-km-z]{43,44}$ ]]; then
    fail "$variable_name must be a non-empty deployed NEAR code hash in base58 format"
  fi
}

rpc_query() {
  local request_id="$1"
  local request_type="$2"
  local account_id="$3"
  local payload

  if [[ "$request_type" == "view_state" ]]; then
    payload="$(jq -cn \
      --arg id "$request_id" \
      --arg account_id "$account_id" \
      '{jsonrpc:"2.0",id:$id,method:"query",params:{request_type:"view_state",finality:"final",account_id:$account_id,prefix_base64:""}}')"
  else
    payload="$(jq -cn \
      --arg id "$request_id" \
      --arg account_id "$account_id" \
      '{jsonrpc:"2.0",id:$id,method:"query",params:{request_type:"view_account",finality:"final",account_id:$account_id}}')"
  fi

  curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
    -H 'Content-Type: application/json' --data "$payload" "$NEAR_RPC_URL"
}

verify_vigil_code_hash() {
  local response
  local actual_code_hash

  if ! response="$(rpc_query "vigil-code" "view_account" "$VIGIL_CONTRACT_ID")"; then
    fail "NEAR RPC request failed while verifying VIGIL_CONTRACT_ID"
  fi

  if ! jq -e . >/dev/null 2>&1 <<<"$response"; then
    fail "NEAR RPC returned malformed JSON while verifying VIGIL_CONTRACT_ID"
  fi

  if jq -e '.error != null' >/dev/null <<<"$response"; then
    if jq -e '.error.cause.name == "UNKNOWN_ACCOUNT"' >/dev/null <<<"$response"; then
      fail "VIGIL_CONTRACT_ID does not exist at finality final"
    fi
    fail "NEAR RPC returned an error while verifying VIGIL_CONTRACT_ID"
  fi

  if ! jq -e \
    '.jsonrpc == "2.0" and .id == "vigil-code" and (.result | type == "object") and (.result.code_hash | type == "string")' \
    >/dev/null <<<"$response"; then
    fail "NEAR RPC response is missing a valid result.code_hash for VIGIL_CONTRACT_ID"
  fi

  actual_code_hash="$(jq -r '.result.code_hash' <<<"$response")"
  validate_code_hash "deployed VIGIL code hash" "$actual_code_hash"

  if [[ "$actual_code_hash" != "$EXPECTED_VIGIL_CODE_HASH" ]]; then
    echo "Expected: $EXPECTED_VIGIL_CODE_HASH" >&2
    echo "Actual:   $actual_code_hash" >&2
    fail "deployed VIGIL code hash mismatch"
  fi
}

validate_rpc_result() {
  local request_id="$1"
  local response="$2"

  if ! jq -e . >/dev/null 2>&1 <<<"$response"; then
    fail "NEAR RPC returned malformed JSON for $request_id"
  fi
  if jq -e '.error != null' >/dev/null <<<"$response"; then
    fail "NEAR RPC returned an error for $request_id"
  fi
  if ! jq -e --arg id "$request_id" \
    '.jsonrpc == "2.0" and .id == $id and (.result | type == "object")' \
    >/dev/null <<<"$response"; then
    fail "NEAR RPC returned a malformed result for $request_id"
  fi
}

if [[ "${VIGIL_HARNESS_DEPLOY_CONFIRM:-}" != "DEPLOY_VIGIL_FAILURE_HARNESS_TESTNET" ]]; then
  echo "Harness deployment is disabled by default." >&2
  echo "Review README.md and ../../TESTNET.md, then explicitly set:" >&2
  echo "  VIGIL_HARNESS_DEPLOY_CONFIRM=DEPLOY_VIGIL_FAILURE_HARNESS_TESTNET" >&2
  exit 2
fi

command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"

required_variables=(
  HARNESS_ID
  CONTROLLER_ID
  VIGIL_CONTRACT_ID
  VAULT_OWNER_ID
  DELETION_REFUND_ID
  EXPECTED_VIGIL_CODE_HASH
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name}" ]]; then
    fail "$variable_name must be set"
  fi
done

account_variables=(
  HARNESS_ID
  CONTROLLER_ID
  VIGIL_CONTRACT_ID
  VAULT_OWNER_ID
  DELETION_REFUND_ID
)
for variable_name in "${account_variables[@]}"; do
  validate_account_id "$variable_name" "${!variable_name}"
done

[[ "$VAULT_ID" =~ ^[0-9]+$ ]] || fail "VAULT_ID must be a non-negative integer"

for ((left = 0; left < ${#account_variables[@]}; left++)); do
  for ((right = left + 1; right < ${#account_variables[@]}; right++)); do
    left_name="${account_variables[$left]}"
    right_name="${account_variables[$right]}"
    if [[ "${!left_name}" == "${!right_name}" ]]; then
      fail "$left_name must not equal $right_name"
    fi
  done
done

for protected_account in "${PROTECTED_DELETION_REFUND_ACCOUNTS[@]}"; do
  if [[ "$DELETION_REFUND_ID" == "$protected_account" ]]; then
    fail "DELETION_REFUND_ID must not be a protected account: $protected_account"
  fi
done

if [[ "$VIGIL_CONTRACT_ID" == "$PRIMARY_VIGIL_CONTRACT_ID" ]]; then
  fail "VIGIL_CONTRACT_ID must not target the primary Vigil contract: $PRIMARY_VIGIL_CONTRACT_ID"
fi

validate_code_hash "EXPECTED_VIGIL_CODE_HASH" "$EXPECTED_VIGIL_CODE_HASH"

# This remote identity check must succeed before inspecting or deploying to the
# harness account. A local WASM digest is not evidence of deployed code identity.
verify_vigil_code_hash

test -s "$WASM_PATH" || fail "harness WASM is missing or empty: $WASM_PATH"
test -s "$HASH_FILE" || fail "harness WASM hash file is missing or empty: $HASH_FILE"
expected_harness_hash="$(sed -n '1s/[[:space:]].*$//p' "$HASH_FILE")"
actual_harness_hash="$(sha256sum "$WASM_PATH" | sed -n '1s/[[:space:]].*$//p')"
if [[ -z "$expected_harness_hash" || "$actual_harness_hash" != "$expected_harness_hash" ]]; then
  echo "Expected: $expected_harness_hash" >&2
  echo "Actual:   $actual_harness_hash" >&2
  fail "harness WASM hash mismatch; refusing deployment"
fi

near account view-account-summary "$HARNESS_ID" network-config testnet now

if ! account_response="$(rpc_query "harness-account" "view_account" "$HARNESS_ID")"; then
  fail "NEAR RPC request failed while inspecting HARNESS_ID"
fi
validate_rpc_result "harness-account" "$account_response"
if ! code_hash="$(jq -er '.result.code_hash | select(type == "string")' <<<"$account_response")"; then
  fail "NEAR RPC response is missing HARNESS_ID code_hash"
fi
if [[ "$code_hash" != "$NO_CODE_HASH" ]]; then
  fail "HARNESS_ID already has contract code; refusing to overwrite it"
fi

if ! state_response="$(rpc_query "harness-state" "view_state" "$HARNESS_ID")"; then
  fail "NEAR RPC request failed while inspecting HARNESS_ID state"
fi
validate_rpc_result "harness-state" "$state_response"
if ! state_entries="$(jq -er '.result.values | select(type == "array") | length' <<<"$state_response")"; then
  fail "NEAR RPC response is missing HARNESS_ID state values"
fi
if [[ "$state_entries" != "0" ]]; then
  fail "HARNESS_ID already has contract state; refusing to overwrite it"
fi

init_args="$(jq -cn \
  --arg controller_id "$CONTROLLER_ID" \
  --arg vigil_contract_id "$VIGIL_CONTRACT_ID" \
  --arg vault_owner_id "$VAULT_OWNER_ID" \
  --argjson vault_id "$VAULT_ID" \
  --arg deletion_refund_id "$DELETION_REFUND_ID" \
  '{controller_id:$controller_id,vigil_contract_id:$vigil_contract_id,vault_owner_id:$vault_owner_id,vault_id:$vault_id,deletion_refund_id:$deletion_refund_id}')"

near contract deploy "$HARNESS_ID" \
  use-file "$WASM_PATH" \
  with-init-call new json-args "$init_args" \
  prepaid-gas '30 Tgas' \
  attached-deposit '0 NEAR' \
  network-config testnet \
  sign-with-keychain \
  send
