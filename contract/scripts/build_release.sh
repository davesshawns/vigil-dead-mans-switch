#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WASM_RELATIVE="target/wasm32-unknown-unknown/release/vigil_near.wasm"
EXPECTED_RUSTC_COMMIT="58cf8f9c35b355199727627d07ae34a4e2846d67"

cd "$CONTRACT_DIR"

actual_rustc_commit="$(rustc -vV | sed -n 's/^commit-hash: //p')"
if [[ "$actual_rustc_commit" != "$EXPECTED_RUSTC_COMMIT" ]]; then
  echo "Refusing a release build with an unreviewed compiler." >&2
  echo "Expected rustc commit: $EXPECTED_RUSTC_COMMIT" >&2
  echo "Actual rustc commit:   $actual_rustc_commit" >&2
  exit 1
fi

if ! rustup target list --installed | grep -qx 'wasm32-unknown-unknown'; then
  echo "Missing Rust target: wasm32-unknown-unknown" >&2
  exit 1
fi

export CARGO_INCREMENTAL=0
export SOURCE_DATE_EPOCH=0

cargo fmt --all -- --check
cargo test --locked --target x86_64-unknown-linux-gnu
cargo clippy --locked --target x86_64-unknown-linux-gnu --all-targets -- -D warnings
cargo build --locked --target wasm32-unknown-unknown --release

test -s "$WASM_RELATIVE"

if [[ "${VERIFY_REPRODUCIBLE:-1}" == "1" ]]; then
  cargo build --locked --target wasm32-unknown-unknown --release --target-dir target/repro-a
  cargo build --locked --target wasm32-unknown-unknown --release --target-dir target/repro-b
  cmp --silent \
    target/repro-a/wasm32-unknown-unknown/release/vigil_near.wasm \
    target/repro-b/wasm32-unknown-unknown/release/vigil_near.wasm
fi

sha256sum "$WASM_RELATIVE"
stat -c '%n %s bytes' "$WASM_RELATIVE"
