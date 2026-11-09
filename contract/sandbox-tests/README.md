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

The explicit target-feature set is required with the pinned Rust 1.99 toolchain. Its defaults emit newer WebAssembly features that the NEAR sandbox rejects during preparation.

## Host requirements

The near-workspaces sandbox downloads a precompiled `near-sandbox` binary (nearcore 2.14.0 in this suite) that requires **GLIBC 2.39**. The development host in this repository is Ubuntu 22.04 (GLIBC 2.38) and **cannot** execute the sandbox locally. The sandbox suite is therefore run by CI on `ubuntu-24.04` (see `.github/workflows/sandbox-tests.yml`), which ships GLIBC 2.39.

On a GLIBC 2.39+ host (or in CI):

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene
RUSTFLAGS='-C linker=/usr/bin/gcc -C link-arg=-fuse-ld=bfd' \
cargo test --manifest-path contract/sandbox-tests/Cargo.toml \
  --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
```

Sandbox execution also needs permission to bind loopback sockets.

## Dependency note

This suite pins `near-workspaces = "0.24"`, which pulls `near-sandbox 0.4.0` defaulting to nearcore 2.14.0. The contract is built with `near-sdk 5.30.0` (nearcore 2.14). The older `near-workspaces 0.22.x` line defaults to nearcore 2.13.4 and rejects the contract's WASM imports with `Link Error: unknown or invalid import`.

## Coverage

Native multi-user/multi-vault isolation, cross-owner rejection, independent vault withdrawal, time advancement, simultaneous inheritance claims, callback-forgery rejection, FT deposits, failed FT allowance and claim callback restoration, recipient registration, retry, and final FT inheritance.

