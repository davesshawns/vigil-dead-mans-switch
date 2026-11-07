# Vigil NEAR multi-user architecture

## Storage model

Vault identity is the pair (owner account ID, owner-scoped vault ID). Each owner's IDs are monotonic and begin at zero. Each owner is limited to 100 vaults so full owner-list views remain gas-bounded.

The registry stores:

- vaults keyed by owner:vault_id;
- an ordered vault-ID list per owner;
- a next-vault-ID counter per owner;
- claim and entitlement keys scoped by owner:vault_id:beneficiary;
- pending transfer keys scoped by owner:vault_id:nonce.

The numeric vault ID is never treated as globally unique.

## Authorization

create_vault, deposit, ping, set_check_in_interval, set_beneficiaries, set_fallback, and withdraw_all derive the owner from env::predecessor_account_id(). A caller can supply a vault ID only within its own owner namespace.

trigger_inheritance is permissionless only after the named vault's deadline. claim requires the predecessor to be a beneficiary of that exact vault. claim_fallback requires the predecessor to be the configured fallback account and the time to exceed twice that vault's interval.

There is no application administrator.

## Transfer isolation

Claims deduct fixed entitlements before scheduling transfers. Pending counts block withdrawal and fallback recovery. Withdrawal is also forbidden after inheritance triggers.

Callbacks validate the owner, vault ID, nonce, transfer kind, recipient, and matching pending marker. Failed callbacks restore only the affected vault; replayed or mismatched callbacks are no-ops.

## Frontend isolation

The owner vault-list query is keyed by connected account. The selected-vault query is keyed by account and vault ID. Changing accounts remounts the wallet session, while in-flight transaction completion checks the selector's currently active account before updating visible session state. Account-scoped query keys and history prevent A → B → A switches from reusing another account's vault data.

The claim flow explicitly selects public owner and vault ID. It does not imply confidentiality.

## Deployment authority

The source contract contains no owner or upgrade method. The final account must also have zero NEAR access keys. Until the deployment key is removed, it remains protocol-level custody capable of transferring account balance or replacing code.

The immutable deployment process is documented in deployment-custody.md.
