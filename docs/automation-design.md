# Vigil inheritance execution

## Current model

Inheritance triggering is permissionless and manual. After a vault's strict deadline, any account may call trigger_inheritance(owner, vault_id). The contract—not the caller—determines eligibility, snapshots the tracked balance, and computes fixed entitlements.

The caller cannot redirect funds, change beneficiaries, alter percentages, impersonate a claimant, or trigger before the deadline. Calls are safe to retry: an already-triggered vault rejects the duplicate.

Fallback recovery is also permissionless in timing but identity-restricted: only the configured fallback account can call claim_fallback, only after twice the interval, and only when no transfer is pending.

## Optional keeper architecture

An automation service may be added without contract privilege:

1. Read public vault IDs and overdue state from final RPC data.
2. Submit the same public trigger_inheritance(owner, vault_id) call available to every account.
3. Pay its own gas and storage deposit.
4. Treat NotEligible, AlreadyTriggered, and NotActive as terminal/idempotent outcomes.
5. Retry transport failures and unknown transaction status only after checking final state.
6. Never hold owner or beneficiary keys and never expose a withdrawal method.

Multiple independent keepers can run safely. A missed execution window delays claims but does not give the keeper custody or change the deadline. Fully automatic execution is impossible without some account submitting a transaction; the protocol therefore remains financially correct even when no keeper is available.
