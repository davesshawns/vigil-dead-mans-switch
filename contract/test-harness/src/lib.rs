use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

// Accounts that are protected from being used as deletion_refund_id
const PROTECTED_ACCOUNTS: &[&str] = &[
    "vigilvault.vigilowner.testnet",
    "dragon-vigil.testnet",
    "dragon-owner.testnet",
    "dragon-beneficiary1.testnet",
    "dragon-beneficiary2.testnet",
];
const PRIMARY_VIGIL_CONTRACT_ID: &str = "vigilvault.vigilowner.testnet";

const CLAIM_GAS: Gas = Gas::from_tgas(150);
// This is deliberately small because storage refunds sent to the deleted
// harness account will also fail. The entire exercise runs against an isolated
// disposable Vigil deployment whose account balance can be recovered later.
const CLAIM_STORAGE_DEPOSIT: NearToken = NearToken::from_yoctonear(50_000_000_000_000_000_000_000);
// Every role must use a distinct account. The deletion refund target must also
// be disposable and outside the protected production/test accounts below.

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FailedTransferHarness {
    controller_id: AccountId,
    vigil_contract_id: AccountId,
    vault_owner_id: AccountId,
    vault_id: u64,
    deletion_refund_id: AccountId,
}

#[near]
impl FailedTransferHarness {
    #[init]
    pub fn new(
        controller_id: AccountId,
        vigil_contract_id: AccountId,
        vault_owner_id: AccountId,
        vault_id: u64,
        deletion_refund_id: AccountId,
    ) -> Self {
        let harness = Self {
            controller_id,
            vigil_contract_id,
            vault_owner_id,
            vault_id,
            deletion_refund_id,
        };
        harness.validate_configuration();
        harness
    }

    /// Deletes this disposable account first, then calls Vigil as the now-
    /// nonexistent beneficiary. Vigil's native transfer must fail and its
    /// private callback must restore the entitlement and vault balance.
    ///
    /// Configuration is revalidated immediately before the destructive action,
    /// including after any future state migration or contract upgrade.
    pub fn prove_failed_claim(&self) -> Promise {
        self.validate_configuration();

        assert_eq!(
            env::predecessor_account_id(),
            self.controller_id,
            "ControllerOnly"
        );

        let claim_args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
            "owner": self.vault_owner_id,
            "vault_id": self.vault_id,
        }))
        .expect("SerializeClaimArgs");

        Promise::new(env::current_account_id())
            .delete_account(self.deletion_refund_id.clone())
            .then(Promise::new(self.vigil_contract_id.clone()).function_call(
                "claim".to_string(),
                claim_args,
                CLAIM_STORAGE_DEPOSIT,
                CLAIM_GAS,
            ))
    }

    fn validate_configuration(&self) {
        assert_ne!(
            self.vigil_contract_id.as_str(),
            PRIMARY_VIGIL_CONTRACT_ID,
            "vigil_contract_id must not target the primary Vigil contract"
        );

        let harness_id = env::current_account_id();
        let accounts = [
            ("harness_id", &harness_id),
            ("controller_id", &self.controller_id),
            ("vigil_contract_id", &self.vigil_contract_id),
            ("vault_owner_id", &self.vault_owner_id),
            ("deletion_refund_id", &self.deletion_refund_id),
        ];

        for left in 0..accounts.len() {
            for right in (left + 1)..accounts.len() {
                assert_ne!(
                    accounts[left].1, accounts[right].1,
                    "{} must not equal {}",
                    accounts[left].0, accounts[right].0
                );
            }
        }

        for protected in PROTECTED_ACCOUNTS {
            if self.deletion_refund_id.as_str() == *protected {
                panic!(
                    "deletion_refund_id must not be a protected account: {}",
                    self.deletion_refund_id
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::mock::MockAction;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn set_context(current: &str, predecessor: &str) {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(account(current))
            .predecessor_account_id(account(predecessor));
        near_sdk::testing_env!(context.build());
    }

    #[test]
    fn schedules_self_deletion_before_the_claim_callback() {
        set_context("failure.beneficiary.testnet", "controller.testnet");

        let harness = FailedTransferHarness::new(
            account("controller.testnet"),
            account("vigil.testnet"),
            account("failure-owner.testnet"),
            0,
            account("refund.testnet"),
        );
        drop(harness.prove_failed_claim());

        let receipts = get_created_receipts();
        assert!(receipts.iter().any(|receipt| {
            receipt.receiver_id == account("failure.beneficiary.testnet")
                && receipt.actions.iter().any(|action| {
                    matches!(
                        action,
                        MockAction::DeleteAccount { beneficiary_id, .. }
                            if beneficiary_id == &account("refund.testnet")
                    )
                })
        }));
        assert!(receipts.iter().any(|receipt| {
            receipt.receiver_id == account("vigil.testnet")
                && receipt.actions.iter().any(|action| {
                    matches!(
                        action,
                        MockAction::FunctionCallWeight {
                            method_name,
                            attached_deposit,
                            prepaid_gas,
                            ..
                        } if method_name == b"claim"
                            && *attached_deposit == CLAIM_STORAGE_DEPOSIT
                            && *prepaid_gas == CLAIM_GAS
                    )
                })
        }));
    }

    #[test]
    #[should_panic(expected = "ControllerOnly")]
    fn rejects_unauthorized_controller() {
        set_context("failure.beneficiary.testnet", "mallory.testnet");

        let _ = FailedTransferHarness::new(
            account("controller.testnet"),
            account("vigil.testnet"),
            account("failure-owner.testnet"),
            0,
            account("refund.testnet"),
        )
        .prove_failed_claim();
    }

    #[test]
    fn rejects_every_overlapping_account_pair() {
        let base_accounts = [
            "failure-harness.testnet",
            "controller.testnet",
            "vigil.testnet",
            "vault-owner.testnet",
            "refund.testnet",
        ];

        for left in 0..base_accounts.len() {
            for right in (left + 1)..base_accounts.len() {
                let mut accounts = base_accounts;
                accounts[right] = accounts[left];
                set_context(accounts[0], "caller.testnet");

                let result = std::panic::catch_unwind(|| {
                    FailedTransferHarness::new(
                        account(accounts[1]),
                        account(accounts[2]),
                        account(accounts[3]),
                        0,
                        account(accounts[4]),
                    )
                });

                assert!(
                    result.is_err(),
                    "overlap pair ({left}, {right}) was accepted"
                );
            }
        }
    }

    #[test]
    fn rejects_every_protected_deletion_refund_account() {
        for protected in PROTECTED_ACCOUNTS {
            set_context("failure-harness.testnet", "caller.testnet");
            let result = std::panic::catch_unwind(|| {
                FailedTransferHarness::new(
                    account("controller.testnet"),
                    account("vigil.testnet"),
                    account("vault-owner.testnet"),
                    0,
                    account(protected),
                )
            });

            assert!(
                result.is_err(),
                "protected refund account was accepted: {protected}"
            );
        }
    }

    #[test]
    #[should_panic(expected = "vigil_contract_id must not target the primary Vigil contract")]
    fn rejects_primary_vigil_contract() {
        set_context("failure-harness.testnet", "caller.testnet");
        let _ = FailedTransferHarness::new(
            account("controller.testnet"),
            account(PRIMARY_VIGIL_CONTRACT_ID),
            account("vault-owner.testnet"),
            0,
            account("refund.testnet"),
        );
    }
}
