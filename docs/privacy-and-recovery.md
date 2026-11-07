# Vigil privacy and recovery boundary

## What is public

Vigil's NEAR contract state is public. Anyone can inspect:

- owner account IDs and owner-scoped vault IDs;
- tracked vault balances and total deposits;
- check-in intervals, last check-ins, and deadlines;
- beneficiary account IDs and percentage shares;
- fallback account IDs;
- inheritance trigger state and entitlement amounts;
- pending transfers, successful claims, and claim amounts;
- transaction senders, attached deposits, receipts, and callback outcomes.

The frontend's “My Vault” view is a usability boundary only. It is not access control or confidentiality. A backend, Supabase RLS policy, or restricted view method cannot make plaintext blockchain state private.

## Client-side encryption finding

Encrypting beneficiary IDs or percentages directly is incompatible with the current protocol because the contract must read those values to authorize claims and compute payouts. Encrypting them with an owner-only key also breaks inheritance when the owner is unavailable.

Commitment or zero-knowledge designs could hide some configuration before a claim, but they require a different contract and proof system. Claims still reveal recipients and transfer amounts, key loss can make recovery impossible, and a fallback path needs an independently recoverable secret.

## Safest viable design

Keep only public NEAR account IDs, percentages, balances, and deadlines on-chain. Never store names, legal documents, addresses, recovery instructions, seed phrases, or private keys.

Private legal or recovery instructions may be encrypted off-chain separately for each beneficiary. The ciphertext should be content-addressed, authenticated, and recoverable without the owner through a separately reviewed threshold, social-recovery, or time-release key process. The on-chain contract may store only a content hash in a future version; it must never depend on an owner-only decryption key for financial execution.

Vigil currently implements authorization and accounting isolation, not confidential inheritance.
