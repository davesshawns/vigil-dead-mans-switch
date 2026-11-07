# Vigil security model

## Authority

The NEAR contract is the financial authority. The frontend is an untrusted transaction composer and state viewer.

Owner mutations derive the owner from env::predecessor_account_id() and operate only within that account's vault-ID namespace. No contract method grants an administrator the ability to withdraw user funds, alter beneficiaries, trigger early, or impersonate a claimant.

Native NEAR deposits are accepted only after the owner configures beneficiaries or a fallback account. This prevents an expired, funded vault from having no authorized recovery path.

The deployment account is safe only after every access key is removed. Before that, a full-access key can transfer account funds, delete the account, or replace code. The immutable-lock process is a mandatory precondition for public use.

## Vault and callback isolation

- Storage, balances, beneficiaries, fallback accounts, entitlements, claim markers, and transfer nonces are scoped by owner and vault ID.
- Withdrawals reject triggered vaults and any vault with a pending transfer.
- Fallback recovery rejects any pending transfer.
- Claims reserve their exact entitlement before scheduling a transfer.
- Callbacks are private and bind owner, vault ID, nonce, kind, recipient, and pending marker.
- Failed transfers restore the matching balance and a usable vault state.
- Replay, stale callbacks, owner mismatch, and cross-vault mismatch are no-ops.

## Wallet handling

- NEAR Wallet Selector and MyNearWallet are used on Testnet.
- The application never requests or stores private keys or seed phrases.
- Transactions explicitly use the active signer.
- Query keys include account and vault ID.
- Account changes remount the session, and in-flight completion checks the selector's active account before updating visible state.
- Local transaction history is scoped by network, contract, and signer and is never authoritative.

## Privacy

All contract state and transaction activity are public. Frontend filtering and database row-level security cannot provide on-chain confidentiality. See docs/privacy-and-recovery.md.

## Asset boundary

The current contract holds native NEAR. It does not implement NEP-141/USDC or living allowances. See docs/financial-scope-decision.md.

## Backend

There is no backend or financial database. Any future service must verify a fresh domain-bound wallet signature, derive the account from that signature, and enforce row-level authorization. It must not accept a request-body owner ID as authentication.

## Deployment checklist

1. Run the full contract, harness, frontend, and legacy regression suites.
2. Rebuild twice with the pinned compiler and verify the SHA-256.
3. Deploy and initialize only to the reviewed Testnet account.
4. Verify receipts and downloaded code before accepting deposits.
5. Run the immutable-lock dry run.
6. Under separate authorization, remove the final full-access key.
7. Verify zero access keys before publishing the contract ID.
8. Complete two-owner, multi-vault, claim, fallback, storage-refund, and failed-transfer sandbox/Testnet exercises.
