# Vigil financial scope decision

## Repository evidence

The legacy Arc implementation and project memory define Vigil as a USDC product with living allowances, fallback recovery, interval updates, and one vault per wallet. The newer NEAR implementation was intentionally written for native NEAR.

That evidence does not establish which NEP-141 USDC contract, network, registration policy, or upgrade model should replace native NEAR. Converting the deployed accounting model without those decisions would be an irreversible economic change.

## Current production-preparation scope

The current NEAR contract remains native-NEAR-only.

Implemented:

- multiple owner-scoped vaults;
- predecessor-derived owner authorization;
- beneficiary inheritance;
- owner-configurable check-in intervals;
- fallback residual recovery after twice the interval;
- measured storage charges and refunds;
- asynchronous transfer rollback and replay protection.

Not implemented:

- NEP-141/USDC deposits and payouts;
- living allowances;
- automatic scheduled transactions.

## Required USDC decision

Before implementing USDC, select:

1. the exact NEP-141 token contract per network;
2. whether the immutable contract supports one fixed token or an immutable initialization-time allowlist;
3. who pays token storage registration for the Vigil contract and beneficiaries;
4. behavior when a beneficiary is not registered;
5. whether native NEAR remains supported for storage and gas only.

A safe NEP-141 design must use ft_transfer_call plus ft_on_transfer for deposits, include (owner, vault_id) in the validated message, reject unsupported tokens, account only the accepted amount, and return unused tokens through the standard resolver. Claims, withdrawals, allowances, and fallback recovery must use ft_transfer with private callbacks that restore the matching vault on failure.

## Living allowance blocker

Native or NEP-141 living allowances require per-beneficiary accrual and pending-transfer state. A single global last_release is unsafe with asynchronous partial failures: successful recipients could be paid twice if the period is rolled back, while failed recipients could lose an installment if it is not.

The next version should track each beneficiary's released periods and pending nonce independently. This is a product and storage-cost change and is not silently approximated in the current contract.
