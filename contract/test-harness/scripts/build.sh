#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WASM_RELATIVE="target/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm"
EXPECTED_RUSTC_COMMIT="58cf8f9c35b355199727627d07ae34a4e2846d67"
cd "$HARNESS_DIR"

actual_rustc_commit="$(rustc -vV | sed -n 's/^commit-hash: //p')"
if [[ "$actual_rustc_commit" != "$EXPECTED_RUSTC_COMMIT" ]]; then
  echo "Refusing a release build with an unreviewed compiler." >&2
  echo "Expected rustc commit: $EXPECTED_RUSTC_COMMIT" >&2
  echo "Actual rustc commit:   $actual_rustc_commit" >&2
  exit 1
fi

export CARGO_INCREMENTAL=0
export SOURCE_DATE_EPOCH=0

bash -n \
  scripts/build.sh \
  scripts/deploy_testnet.sh \
  scripts/tests/deploy_testnet_test.sh \
  scripts/tests/bin/curl \
  scripts/tests/bin/near
scripts/tests/deploy_testnet_test.sh
cargo fmt --all -- --check
cargo test --locked --target x86_64-unknown-linux-gnu
cargo clippy --locked --target x86_64-unknown-linux-gnu --all-targets -- -D warnings
cargo build --locked --target wasm32-unknown-unknown --release

if [[ "${VERIFY_REPRODUCIBLE:-1}" == "1" ]]; then
  cargo build --locked --target wasm32-unknown-unknown --release --target-dir target/repro-a
  cargo build --locked --target wasm32-unknown-unknown --release --target-dir target/repro-b
  cmp --silent \
    target/repro-a/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm \
    target/repro-b/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm
fi

sha256sum "$WASM_RELATIVE"
stat -c '%n %s bytes' "$WASM_RELATIVE"
