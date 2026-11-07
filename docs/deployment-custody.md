# Immutable NEAR deployment custody

## Security objective

The final contract account must have zero access keys. With no full-access or function-call keys, no operator can sign a transfer, delete the account, or replace the code. The contract then moves funds only through its reviewed methods.

This makes upgrades permanently impossible. A future upgradeable or governed deployment requires a separate contract design, explicit governance, migration tests, and a new audit. Vigil does not add a hidden administrator to preserve upgradeability.

## Required sequence

1. Build with the pinned compiler and verify the recorded SHA-256.
2. Confirm the fresh Testnet account has no code or state and exactly one deployment key.
3. Atomically deploy and initialize new {} using the guarded deployment script.
4. Do not publish the frontend or accept user deposits.
5. Verify the deployed bytecode SHA-256 matches the reviewed artifact.
6. Run the immutable-lock script in dry-run mode.
7. After separate human authorization, delete the final full-access key.
8. Verify the account has zero access keys.
9. Only then expose the contract to application users.

Preparation-only command:

    cd contract
    VIGIL_IMMUTABLE_LOCK_DRY_RUN=1 ./scripts/lock_immutable_testnet.sh

The state-changing path is disabled unless both of these exact values are supplied:

    VIGIL_IMMUTABLE_LOCK_DRY_RUN=0
    VIGIL_IMMUTABLE_LOCK_CONFIRM=PERMANENTLY_LOCK_VIGILVAULT_VIGILOWNER_TESTNET

Do not run the state-changing path until deployment, receipt inspection, code-hash verification, and an explicit final authorization. Losing the final key is intentional and irreversible.
