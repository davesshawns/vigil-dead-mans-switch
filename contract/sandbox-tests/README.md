# Vigil local NEAR sandbox tests

These tests deploy Vigil and a mock NEP-141 contract only to disposable local near-workspaces accounts. They never use the fixed Testnet deployment account.

Build both WASM artifacts first:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
./scripts/build_release.sh

cd mock-ft
RUSTFLAGS='-C target-feature=-reference-types,-multivalue,-bulk-memory' \
CARGO_INCREMENTAL=0 SOURCE_DATE_EPOCH=0 \
cargo build --locked --target wasm32-unknown-unknown --release
```

The explicit target-feature set is required with the pinned Rust 1.99 toolchain. Its defaults emit newer WebAssembly features that the current NEAR sandbox rejects during preparation.

On a host whose standard runtime can execute the near-workspaces sandbox binary:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd' \
cargo test --manifest-path contract/sandbox-tests/Cargo.toml \
  --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

This environment has GLIBC 2.38, while the downloaded sandbox binary requires GLIBC 2.39. The verified run used an isolated official GLIBC 2.39 runtime and this temporary wrapper path:

```bash
NEAR_SANDBOX_BIN_PATH=/tmp/vigil-near-sandbox-wrapper \
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd' \
cargo test --manifest-path contract/sandbox-tests/Cargo.toml \
  --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

The wrapper launches `/tmp/vigil-near-sandbox-complete/Linux-x86_64/near-sandbox` with the loader and libraries under `/tmp/vigil-glibc-2.39`. Those temporary compatibility binaries are intentionally not committed. Sandbox execution also needs permission to bind loopback sockets.

Coverage includes native multi-user/multi-vault isolation, cross-owner rejection, independent vault withdrawal, time advancement, simultaneous inheritance claims, callback-forgery rejection, FT deposits, failed FT allowance and claim callback restoration, recipient registration, retry, and final FT inheritance.

