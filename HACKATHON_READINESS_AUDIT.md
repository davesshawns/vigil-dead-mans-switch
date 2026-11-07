# Vigil NEAR readiness audit

## Current status

- Public multi-user native NEAR vault registry implemented.
- Up to 100 independently keyed vaults per NEAR account, with a bounded owner index.
- Wallet Selector identity, account switching, owner dashboard, beneficiary claims, and final receipt verification implemented.
- Contract deployment remains pending and requires explicit authorization.
- On-chain state is public; Vigil enforces authorization and accounting isolation, not confidential storage.

## Verified architecture

- Owner mutations derive the vault key from `predecessor_account_id`.
- The deployment signer has no application-level administrator role and cannot take user vault funds through a privileged method.
- Vault balances, beneficiaries, entitlements, claim markers, pending transfers, and storage reserves are isolated by owner account.
- Permissionless triggering is restricted to funded, configured vaults strictly past their deadline.
- The owner dashboard loads only the connected account's vault; beneficiary lookup is a separate public flow.
- There is no backend, database, or email/password authentication.

## Remaining Testnet evidence

1. Authorized deployment and atomic initialization.
2. Two-wallet creation and management receipts on Testnet.
3. Account-switching browser exercise against live state.
4. Normal multi-beneficiary claim receipts and final accounting.
5. Isolated failed-transfer harness receipts against a disposable deployment only.

See `docs/near-multi-user-architecture.md`, `SECURITY.md`, and `contract/TESTNET.md`.
