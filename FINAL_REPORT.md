# Vigil NEAR production-preparation report

Date: 2026-11-06

## Overall verdict: PARTIALLY COMPLETE

The native-NEAR implementation is now a public, multi-user, multi-vault protocol with owner-scoped authorization, asynchronous transfer recovery, wallet account isolation, reproducible builds, and guarded immutable deployment preparation.

It is not yet the full repository-defined USDC product: NEP-141 USDC and living allowances remain unimplemented pending explicit token/economic decisions. Deployment and key removal were intentionally not performed. NEAR state also cannot satisfy a confidentiality requirement.

## Security fixes completed

- Pending claim callbacks now block withdrawal and deactivation. A failed callback restores only its matching claim and vault to an active, retryable triggered state.
- Claim, withdrawal, and fallback callbacks use owner/vault/nonce transfer IDs, private callback authorization, matching pending markers, and replay/stale/cross-vault no-op behavior.
- Concurrent claims reserve fixed entitlements before transfers and cannot overdraw the tracked balance.
- Deposits are rejected after inheritance triggers, including the zero-balance state after all claims have been reserved or completed.
- A funded vault must always have beneficiaries or a fallback account. Funding without recovery is rejected, and a fallback-only funded vault cannot remove its final recovery path.
- Rounded zero entitlements no longer block the whole inheritance snapshot or schedule an invalid zero-value transfer.
- Per-owner vault creation is capped at 100 before state insertion, bounding owner-list views.

## Multi-user and multi-vault design

- Vault identity is `(owner AccountId, owner-scoped vault_id)`.
- `create_vault`, `deposit`, `ping`, `set_check_in_interval`, `set_beneficiaries`, `set_fallback`, and `withdraw_all` derive the owner from `env::predecessor_account_id()`.
- Each owner has a monotonic ID sequence starting at zero and an independent bounded vault index.
- Claims, entitlements, successful-claim records, transfer nonces, pending transfers, and storage reserves include both owner and vault ID.
- Closing one vault does not alter another vault for the same owner.
- Triggering is permissionless only strictly after the contract-computed deadline. The caller cannot redirect funds or change allocation.
- Claims require the predecessor to be a beneficiary of the exact vault; fallback recovery requires the exact configured fallback account.
- There is no contract administrator, upgrade method, or privileged withdrawal method.

Primary implementation files:

- `contract/src/lib.rs`
- `contract/src/basic_tests.rs`
- `contract/src/multi_user_tests.rs`
- `contract/src/callback_regression_tests.rs`
- `src/near/config.ts`, `client.ts`, `hooks.ts`, `session.ts`, `types.ts`, `NearProvider.tsx`
- `src/components/VaultDashboard.tsx`, `BeneficiaryView.tsx`, `WalletButton.tsx`, `ExploreView.tsx`, `TransactionHistory.tsx`
- `src/near/WalletSelector.real.integration.test.tsx`, `NearProvider.integration.test.tsx`, `hooks.test.tsx`, `client.test.ts`, `session.test.ts`
- `contract/scripts/build_release.sh`, `deploy_testnet.sh`, `lock_immutable_testnet.sh`
- `contract/test-harness/`
- `docs/deployment-custody.md`, `privacy-and-recovery.md`, `financial-scope-decision.md`, `automation-design.md`, `near-multi-user-architecture.md`

## Verification executed

Main NEAR contract:

- `cargo fmt --all -- --check` — passed.
- `cargo test --locked --target x86_64-unknown-linux-gnu` — 36/36 passed.
- `cargo clippy --locked --target x86_64-unknown-linux-gnu --all-targets -- -D warnings` — passed.
- `./scripts/build_release.sh` — passed; two release builds matched byte-for-byte.
- `sha256sum -c vigil_near.wasm.sha256` — passed.

Frontend:

- `bun run typecheck` — passed.
- `bun run test` — 5 files, 13/13 tests passed.
- `bun run build` — passed; 2,791 modules transformed.
- Non-mutating type-aware and standard Oxlint commands — passed.
- The real-selector integration test uses Wallet Selector core and `WalletSelectorProvider` with an in-memory wallet implementation; connect propagation, A → B → A switching, and disconnect passed without mocking the React hook.

Legacy Solidity regression suite:

- `/tmp/vigil-build-tools/node_modules/@foundry-rs/forge-linux-amd64/bin/forge test` — 10 suites, 87/87 passed.
- `/usr/bin/forge` was not used because it is an unrelated genomics executable.

Failed-transfer harness and deployment preparation:

- `contract/test-harness/scripts/build.sh` — 36/36 shell safety cases and 5/5 Rust tests passed; Clippy and reproducibility passed.
- `contract/scripts/tests/lock_immutable_testnet_test.sh` — passed.
- `VIGIL_TESTNET_PREFLIGHT_ONLY=1 ./scripts/deploy_testnet.sh` — passed after read-only RPC access was allowed. It verified the final artifact hash, empty code/state, 4 NEAR balance, and keychain public-key availability. Deployment was not attempted.

Not executed:

- NEAR sandbox lifecycle tests: no `near-sandbox` binary or near-workspaces harness is installed in this environment.
- A real browser redirect/signing flow with MyNearWallet and funded A/B accounts: requires an authorized deployed contract and interactive wallets.
- Live failed-transfer harness execution: deliberately requires disposable Testnet accounts and a separate disposable Vigil deployment.

## Artifacts

Main contract:

```text
contract/target/wasm32-unknown-unknown/release/vigil_near.wasm
242050 bytes
SHA-256 0fb47a5ed96282711862a040c56dda801977d55a05ff2fd2b0d7bb2f0413e6db
```

Failed-transfer harness:

```text
contract/test-harness/target/wasm32-unknown-unknown/release/vigil_failed_transfer_harness.wasm
134048 bytes
SHA-256 aeca941730a1daec699954c03c4c0474f105134c4e9e66c2198bf8a2cc6bc9b7
```

Compiler: Rust 1.99.1, commit `58cf8f9c35b355199727627d07ae34a4e2846d67`.

## Deployment-key custody

The prepared production model is immutable:

1. Build and review the pinned WASM.
2. Deploy and initialize only to the fixed fresh Testnet account.
3. Keep the frontend closed to deposits.
4. Download and verify deployed bytecode.
5. Run the immutable-lock dry run.
6. Under separate explicit authorization, remove the final full-access key.
7. Verify the account has zero access keys before public use.

Zero keys permanently prevent signed account transfers, account deletion, and code replacement. Upgrades then become impossible. A future governed upgrade requires a separately designed contract, governance process, migration plan, and audit; no hidden administrator was introduced.

Current read-only state: `vigilvault.vigilowner.testnet` has no contract code, 4 NEAR, and one full-access key. It must not receive user funds in that state.

## Privacy boundary

NEAR state is public. Owner IDs, vault IDs, balances, deposits, intervals, last check-ins, deadlines, beneficiaries, percentages, fallback accounts, entitlements, pending transfers, claims, and receipts remain observable.

Frontend filtering or future database RLS cannot make plaintext on-chain data private. Owner-only encryption would break inheritance when the owner is unavailable. The safest current design keeps only public payment configuration on-chain and stores any private legal/recovery material off-chain with beneficiary-recoverable threshold, social-recovery, or time-release encryption. Genuine confidential beneficiaries require a materially different commitment/zero-knowledge architecture.

## Native NEAR versus USDC

Native NEAR remains the active asset because the repository does not identify the exact NEP-141 USDC contract, immutable allowlist policy, token storage-registration payer, unregistered-beneficiary behavior, or coexistence policy for native NEAR.

The legacy Solidity contract confirms intended USDC and living-allowance functionality, but implementing those without the missing decisions would change custody and economic semantics. A future NEP-141 version must use `ft_transfer_call`/`ft_on_transfer` deposits, return unused tokens, validate `(owner, vault_id)`, handle token registration, and use private idempotent payout callbacks. Living allowances need per-beneficiary accrual and pending-transfer state.

## Remaining blockers by severity

1. **Critical operational:** the undeployed target still has a full-access key. Do not accept funds until deployment verification and zero-key immutable lock are complete.
2. **High product:** NEP-141 USDC and living allowances are not implemented; the exact token and economic decisions are unresolved.
3. **High architectural:** on-chain beneficiary and balance confidentiality is impossible in the current plaintext design.
4. **Medium validation:** sandbox and real MyNearWallet browser lifecycle evidence remain outstanding.
5. **Medium storage economics:** permanent vault/index/entitlement/successful-claim records are not deleted, so their storage reserves are not refunded.
6. **Low frontend:** the production bundle is large and dependency code emits Vite `eval` warnings; builds still pass.

## Next validation commands

Read-only/local checks:

```bash
cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene/contract
./scripts/build_release.sh
sha256sum -c vigil_near.wasm.sha256
VIGIL_TESTNET_PREFLIGHT_ONLY=1 ./scripts/deploy_testnet.sh

cd /home/acknowlege/Desktop/usdc_dead_mans_switch_vault_tssene
bun run typecheck
bun run test
bun run build
```

No deployment, key deletion, account creation, transfer, commit, or push was performed.
