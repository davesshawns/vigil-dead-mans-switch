#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_SCRIPT="$HARNESS_DIR/scripts/deploy_testnet.sh"
MOCK_BIN="$SCRIPT_DIR/bin"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf -- "$TEST_TMP"' EXIT

EXPECTED_HASH="$(printf '2%.0s' {1..44})"
MISMATCH_HASH="$(printf '3%.0s' {1..44})"
TEST_WASM="$TEST_TMP/harness.wasm"
TEST_HASH_FILE="$TEST_TMP/harness.wasm.sha256"
MOCK_NEAR_LOG="$TEST_TMP/near.log"
OUTPUT_FILE="$TEST_TMP/output.log"

printf '%s' 'test harness wasm' >"$TEST_WASM"
sha256sum "$TEST_WASM" >"$TEST_HASH_FILE"

BASE_ENV=(
  "PATH=$MOCK_BIN:$PATH"
  "HARNESS_ID=failure-harness.testnet"
  "CONTROLLER_ID=controller.testnet"
  "VIGIL_CONTRACT_ID=vigil-contract.testnet"
  "VAULT_OWNER_ID=vault-owner.testnet"
  "DELETION_REFUND_ID=refund.testnet"
  "EXPECTED_VIGIL_CODE_HASH=$EXPECTED_HASH"
  "MOCK_ACTUAL_CODE_HASH=$EXPECTED_HASH"
  "MOCK_MISMATCH_CODE_HASH=$MISMATCH_HASH"
  "MOCK_NEAR_LOG=$MOCK_NEAR_LOG"
  "NEAR_RPC_URL=https://rpc.invalid.test"
  "WASM_PATH=$TEST_WASM"
  "HASH_FILE=$TEST_HASH_FILE"
  "VIGIL_HARNESS_DEPLOY_CONFIRM=DEPLOY_VIGIL_FAILURE_HARNESS_TESTNET"
)

LAST_STATUS=0
LAST_OUTPUT=""
TEST_COUNT=0

run_deploy() {
  : >"$MOCK_NEAR_LOG"
  : >"$OUTPUT_FILE"
  set +e
  env "${BASE_ENV[@]}" "$@" bash "$DEPLOY_SCRIPT" >"$OUTPUT_FILE" 2>&1
  LAST_STATUS=$?
  set -e
  LAST_OUTPUT="$(<"$OUTPUT_FILE")"
}

pass() {
  TEST_COUNT=$((TEST_COUNT + 1))
  printf 'ok %d - %s\n' "$TEST_COUNT" "$1"
}

assert_failure() {
  local name="$1"
  local expected_message="$2"
  shift 2

  run_deploy "$@"
  if [[ "$LAST_STATUS" == "0" ]]; then
    printf 'not ok - %s: unexpectedly succeeded\n%s\n' "$name" "$LAST_OUTPUT" >&2
    exit 1
  fi
  if [[ "$LAST_OUTPUT" != *"$expected_message"* ]]; then
    printf 'not ok - %s: missing message %q\n%s\n' "$name" "$expected_message" "$LAST_OUTPUT" >&2
    exit 1
  fi
  if [[ -s "$MOCK_NEAR_LOG" ]]; then
    printf 'not ok - %s: invoked near before failing\n' "$name" >&2
    exit 1
  fi
  pass "$name"
}

assert_failure \
  "missing expected code hash" \
  "EXPECTED_VIGIL_CODE_HASH must be set" \
  "EXPECTED_VIGIL_CODE_HASH="
assert_failure \
  "missing contract account" \
  "VIGIL_CONTRACT_ID does not exist" \
  "MOCK_RPC_MODE=missing_account"
assert_failure \
  "RPC transport failure" \
  "NEAR RPC request failed" \
  "MOCK_RPC_MODE=rpc_failure"
assert_failure \
  "RPC error response" \
  "NEAR RPC returned an error" \
  "MOCK_RPC_MODE=rpc_error"
assert_failure \
  "malformed RPC response" \
  "NEAR RPC returned malformed JSON" \
  "MOCK_RPC_MODE=malformed"
assert_failure \
  "RPC response missing code hash" \
  "missing a valid result.code_hash" \
  "MOCK_RPC_MODE=missing_hash"
assert_failure \
  "mismatched code hash" \
  "deployed VIGIL code hash mismatch" \
  "MOCK_RPC_MODE=mismatch"

run_deploy "MOCK_RPC_MODE=matching"
if [[ "$LAST_STATUS" != "0" ]]; then
  printf 'not ok - matching code hash: failed\n%s\n' "$LAST_OUTPUT" >&2
  exit 1
fi
if ! grep -Fq "contract deploy failure-harness.testnet" "$MOCK_NEAR_LOG"; then
  printf 'not ok - matching code hash: mocked deploy was not reached\n' >&2
  exit 1
fi
pass "matching code hash"

ACCOUNT_VARIABLES=(
  HARNESS_ID
  CONTROLLER_ID
  VIGIL_CONTRACT_ID
  VAULT_OWNER_ID
  DELETION_REFUND_ID
)
declare -A ACCOUNT_VALUES=(
  [HARNESS_ID]="failure-harness.testnet"
  [CONTROLLER_ID]="controller.testnet"
  [VIGIL_CONTRACT_ID]="vigil-contract.testnet"
  [VAULT_OWNER_ID]="vault-owner.testnet"
  [DELETION_REFUND_ID]="refund.testnet"
)

for ((left = 0; left < ${#ACCOUNT_VARIABLES[@]}; left++)); do
  for ((right = left + 1; right < ${#ACCOUNT_VARIABLES[@]}; right++)); do
    left_name="${ACCOUNT_VARIABLES[$left]}"
    right_name="${ACCOUNT_VARIABLES[$right]}"
    assert_failure \
      "$left_name overlaps $right_name" \
      "$left_name must not equal $right_name" \
      "$right_name=${ACCOUNT_VALUES[$left_name]}"
  done
done

PROTECTED_ACCOUNTS=(
  vigilvault.vigilowner.testnet
  dragon-vigil.testnet
  dragon-owner.testnet
  dragon-beneficiary1.testnet
  dragon-beneficiary2.testnet
)
for protected_account in "${PROTECTED_ACCOUNTS[@]}"; do
  assert_failure \
    "protected deletion refund $protected_account" \
    "DELETION_REFUND_ID must not be a protected account" \
    "DELETION_REFUND_ID=$protected_account"
done


assert_failure \
  "primary Vigil target" \
  "VIGIL_CONTRACT_ID must not target the primary Vigil contract" \
  "VIGIL_CONTRACT_ID=vigilvault.vigilowner.testnet"

for variable_name in "${ACCOUNT_VARIABLES[@]}"; do
  assert_failure \
    "missing $variable_name" \
    "$variable_name must be set" \
    "$variable_name="
  assert_failure \
    "malformed $variable_name" \
    "$variable_name is not a valid NEAR account ID" \
    "$variable_name=INVALID..ACCOUNT"
done

assert_failure \
  "malformed expected code hash" \
  "EXPECTED_VIGIL_CODE_HASH must be a non-empty deployed NEAR code hash" \
  "EXPECTED_VIGIL_CODE_HASH=not-a-code-hash"

assert_failure \
  "malformed vault ID" \
  "VAULT_ID must be a non-negative integer" \
  "VAULT_ID=-1"

printf '1..%d\n' "$TEST_COUNT"
