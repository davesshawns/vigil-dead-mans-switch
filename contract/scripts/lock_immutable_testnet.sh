#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONTRACT_ID="vigilvault.vigilowner.testnet"
NEAR_RPC_URL="${NEAR_RPC_URL:-https://rpc.testnet.near.org}"
HASH_FILE="${HASH_FILE:-$CONTRACT_DIR/vigil_near.wasm.sha256}"
CURL_BIN="${CURL_BIN:-curl}"
NEAR_BIN="${NEAR_BIN:-near}"
DRY_RUN="${VIGIL_IMMUTABLE_LOCK_DRY_RUN:-1}"
CONFIRM="${VIGIL_IMMUTABLE_LOCK_CONFIRM:-}"
NO_CODE_HASH="11111111111111111111111111111111"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

rpc_query() {
  local payload="$1"
  "$CURL_BIN" --fail --silent --show-error --connect-timeout 10 --max-time 20 -H 'Content-Type: application/json' --data "$payload" "$NEAR_RPC_URL"
}

[[ "$DRY_RUN" == "0" || "$DRY_RUN" == "1" ]] || fail "VIGIL_IMMUTABLE_LOCK_DRY_RUN must be 0 or 1"
command -v jq >/dev/null || fail "jq is required"
command -v base64 >/dev/null || fail "base64 is required"
command -v sha256sum >/dev/null || fail "sha256sum is required"
test -s "$HASH_FILE" || fail "WASM hash file is missing: $HASH_FILE"

expected_hash="$(sed -n '1s/[[:space:]].*$//p' "$HASH_FILE")"
[[ "$expected_hash" =~ ^[0-9a-f]{64}$ ]] || fail "recorded WASM hash is malformed"

account_payload="$(jq -cn --arg account_id "$CONTRACT_ID" '{jsonrpc:"2.0",id:"account",method:"query",params:{request_type:"view_account",finality:"final",account_id:$account_id}}')"
account_response="$(rpc_query "$account_payload")"
jq -e '.error == null and (.result.code_hash | type == "string")' >/dev/null <<<"$account_response" || fail "unable to read the deployed contract account"
code_hash="$(jq -r '.result.code_hash' <<<"$account_response")"
[[ "$code_hash" != "$NO_CODE_HASH" ]] || fail "contract code is not deployed"

code_payload="$(jq -cn --arg account_id "$CONTRACT_ID" '{jsonrpc:"2.0",id:"code",method:"query",params:{request_type:"view_code",finality:"final",account_id:$account_id}}')"
code_response="$(rpc_query "$code_payload")"
jq -e '.error == null and (.result.code_base64 | type == "string")' >/dev/null <<<"$code_response" || fail "unable to download deployed contract code"
deployed_hash="$(jq -er '.result.code_base64' <<<"$code_response" | base64 --decode | sha256sum | sed -n '1s/[[:space:]].*$//p')"
[[ "$deployed_hash" == "$expected_hash" ]] || fail "deployed code does not match the reviewed WASM hash"

keys_payload="$(jq -cn --arg account_id "$CONTRACT_ID" '{jsonrpc:"2.0",id:"keys",method:"query",params:{request_type:"view_access_key_list",finality:"final",account_id:$account_id}}')"
keys_response="$(rpc_query "$keys_payload")"
jq -e '.error == null and (.result.keys | type == "array")' >/dev/null <<<"$keys_response" || fail "unable to read contract access keys"
total_keys="$(jq -r '.result.keys | length' <<<"$keys_response")"
full_access_keys="$(jq -r '[.result.keys[] | select(.access_key.permission == "FullAccess")] | length' <<<"$keys_response")"
[[ "$total_keys" == "1" && "$full_access_keys" == "1" ]] || fail "expected exactly one final full-access deployment key before immutable lock"
deployment_public_key="$(jq -er '.result.keys[0].public_key' <<<"$keys_response")"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Immutable-lock preflight passed."
  echo "Reviewed code is deployed and exactly one full-access key remains."
  echo "No key was deleted. Re-run only after review with:"
  echo "  VIGIL_IMMUTABLE_LOCK_DRY_RUN=0"
  echo "  VIGIL_IMMUTABLE_LOCK_CONFIRM=PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET"
  exit 0
fi

[[ "$CONFIRM" == "PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET" ]] || fail "immutable lock is disabled without the exact confirmation phrase"
command -v "$NEAR_BIN" >/dev/null || fail "near CLI is required"

"$NEAR_BIN" account delete-keys "$CONTRACT_ID" public-keys "$deployment_public_key" network-config testnet sign-with-keychain send

post_keys_response="$(rpc_query "$keys_payload")"
post_key_count="$(jq -er '.result.keys | length' <<<"$post_keys_response")"
[[ "$post_key_count" == "0" ]] || fail "immutable lock transaction completed but access keys remain"
echo "Immutable lock verified: the contract account has zero access keys."
