#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
LOCK_SCRIPT="$CONTRACT_DIR/scripts/lock_immutable_testnet.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf -- "$TEST_TMP"' EXIT

TEST_WASM="$TEST_TMP/vigil.wasm"
HASH_FILE="$TEST_TMP/vigil.wasm.sha256"
MOCK_CURL="$TEST_TMP/curl"
MOCK_NEAR="$TEST_TMP/near"
NEAR_LOG="$TEST_TMP/near.log"

printf '%s' 'reviewed vigil wasm' >"$TEST_WASM"
sha256sum "$TEST_WASM" >"$HASH_FILE"
CODE_BASE64="$(base64 -w0 "$TEST_WASM")"

cat >"$MOCK_CURL" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
payload=""
while (($#)); do
  if [[ "$1" == "--data" ]]; then
    payload="$2"
    shift 2
  else
    shift
  fi
done
if [[ "$payload" == *'"view_account"'* ]]; then
  printf '%s' '{"jsonrpc":"2.0","id":"account","result":{"code_hash":"DeployedCodeHash111111111111111111111111111"}}'
elif [[ "$payload" == *'"view_code"'* ]]; then
  printf '{"jsonrpc":"2.0","id":"code","result":{"code_base64":"%s"}}' "$MOCK_CODE_BASE64"
elif [[ "$payload" == *'"view_access_key_list"'* ]]; then
  printf '%s' '{"jsonrpc":"2.0","id":"keys","result":{"keys":[{"public_key":"ed25519:11111111111111111111111111111111","access_key":{"permission":"FullAccess"}}]}}'
else
  exit 2
fi
MOCK

cat >"$MOCK_NEAR" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$MOCK_NEAR_LOG"
MOCK
chmod +x "$MOCK_CURL" "$MOCK_NEAR"

output="$(MOCK_CODE_BASE64="$CODE_BASE64" MOCK_NEAR_LOG="$NEAR_LOG" CURL_BIN="$MOCK_CURL" NEAR_BIN="$MOCK_NEAR" HASH_FILE="$HASH_FILE" VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 bash "$LOCK_SCRIPT")"
[[ "$output" == *"Immutable-lock preflight passed."* ]]
[[ ! -s "$NEAR_LOG" ]]

set +e
MOCK_CODE_BASE64="$CODE_BASE64" MOCK_NEAR_LOG="$NEAR_LOG" CURL_BIN="$MOCK_CURL" NEAR_BIN="$MOCK_NEAR" HASH_FILE="$HASH_FILE" VIGIL_IMMUTABLE_LOCK_DRY_RUN=0 bash "$LOCK_SCRIPT" >"$TEST_TMP/live.log" 2>&1
status=$?
set -e
[[ "$status" != "0" ]]
grep -Fq "exact confirmation phrase" "$TEST_TMP/live.log"
[[ ! -s "$NEAR_LOG" ]]

echo "immutable lock preparation tests passed"
