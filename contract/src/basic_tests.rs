use super::*;
use near_sdk::test_utils::VMContextBuilder;

const START: u64 = 1_000_000_000_000;
const INTERVAL: u64 = 120_000_000_000;
const STORAGE_DEPOSIT: u128 = 10u128.pow(24);

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str, attached: u128, timestamp: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("vigil.near"))
        .predecessor_account_id(account(predecessor))
        .attached_deposit(near_sdk::NearToken::from_yoctonear(attached))
        .block_timestamp(timestamp);
    near_sdk::testing_env!(builder.build());
}

fn create(contract: &mut VaultRegistry) -> u64 {
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.create_vault(INTERVAL).0
}

#[test]
fn vault_ids_are_owner_scoped_and_monotonic() {
    let mut contract = VaultRegistry::new();
    let first = create(&mut contract);
    let second = create(&mut contract);
    assert_eq!((first, second), (0, 1));

    context("bob.near", STORAGE_DEPOSIT, START);
    assert_eq!(contract.create_vault(INTERVAL).0, 0);
}

#[test]
#[should_panic(expected = "InvalidInterval")]
fn short_interval_is_rejected() {
    context("alice.near", STORAGE_DEPOSIT, START);
    VaultRegistry::new().create_vault(1_000_000_000);
}

#[test]
fn beneficiary_rounding_assigns_dust_to_last_account() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        vec![
            (account("bob.near"), 33),
            (account("carol.near"), 33),
            (account("dave.near"), 34),
        ],
    );
    context("alice.near", 101, START);
    contract.deposit(vault_id);
    context("keeper.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.trigger_inheritance(account("alice.near"), vault_id);

    let beneficiaries = contract.get_beneficiaries(account("alice.near"), vault_id);
    assert_eq!(
        beneficiaries
            .iter()
            .map(|entry| entry.entitlement.0)
            .collect::<Vec<_>>(),
        vec![33, 33, 35]
    );
}

#[test]
fn percentage_floor_handles_u128_max_without_overflow() {
    assert_eq!(VaultRegistry::percentage_floor(u128::MAX, 100), u128::MAX);
    assert_eq!(
        VaultRegistry::percentage_floor(u128::MAX, 1),
        u128::MAX / 100
    );
}

#[test]
#[should_panic(expected = "DuplicateBeneficiary")]
fn duplicate_beneficiary_is_rejected() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        vec![(account("bob.near"), 50), (account("bob.near"), 50)],
    );
}

#[test]
#[should_panic(expected = "InvalidTotal")]
fn beneficiary_percentages_must_total_one_hundred() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        vec![(account("bob.near"), 50), (account("carol.near"), 40)],
    );
}

#[test]
fn zero_entitlement_does_not_block_distribution() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        vec![(account("bob.near"), 1), (account("carol.near"), 99)],
    );
    context("alice.near", 1, START);
    contract.deposit(vault_id);
    context("keeper.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.trigger_inheritance(account("alice.near"), vault_id);

    let beneficiaries = contract.get_beneficiaries(account("alice.near"), vault_id);
    assert_eq!(beneficiaries[0].entitlement.0, 0);
    assert_eq!(beneficiaries[1].entitlement.0, 1);

    context("bob.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.claim(account("alice.near"), vault_id);
    let after_zero_claim = contract.get_beneficiaries(account("alice.near"), vault_id);
    let bob = &after_zero_claim[0];
    assert!(bob.claimed);
    assert_eq!(bob.claimed_amount.0, 0);
    assert!(!bob.transfer_pending);
    assert_eq!(contract.vault_balance(account("alice.near"), vault_id).0, 1);
}

#[test]
#[should_panic(expected = "NoBeneficiaryOrFallback")]
fn funding_without_a_recovery_path_is_rejected() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", 100, START);
    contract.deposit(vault_id);
}

#[test]
fn funded_vault_cannot_remove_its_only_recovery_path() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_fallback(vault_id, Some(account("fallback.near")));
    context("alice.near", 100, START);
    contract.deposit(vault_id);

    context("alice.near", STORAGE_DEPOSIT, START + 1);
    let removal = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.set_fallback(vault_id, None);
    }));
    assert!(removal.is_err());
    assert_eq!(
        contract
            .get_vault(account("alice.near"), vault_id)
            .unwrap()
            .fallback_account,
        Some(account("fallback.near"))
    );

    context("alice.near", STORAGE_DEPOSIT, START + 1);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    context("alice.near", STORAGE_DEPOSIT, START + 1);
    contract.set_fallback(vault_id, None);
    assert_eq!(
        contract
            .get_vault(account("alice.near"), vault_id)
            .unwrap()
            .fallback_account,
        None
    );
}

#[test]
#[should_panic(expected = "NotBeneficiary")]
fn unauthorized_claim_is_rejected() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    context("alice.near", 100, START);
    contract.deposit(vault_id);
    context("keeper.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.trigger_inheritance(account("alice.near"), vault_id);
    context("mallory.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.claim(account("alice.near"), vault_id);
}

#[test]
fn exact_deadline_boundary_is_not_overdue() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    context("alice.near", 100, START);
    contract.deposit(vault_id);
    context("alice.near", 0, START + INTERVAL);
    assert!(!contract.is_overdue(account("alice.near"), vault_id));
    contract.ping(vault_id);
}

#[test]
fn owner_can_update_only_the_selected_vault_interval_before_expiry() {
    let mut contract = VaultRegistry::new();
    let first = create(&mut contract);
    let second = create(&mut contract);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(first, vec![(account("bob.near"), 100)]);
    context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(second, vec![(account("carol.near"), 100)]);
    context("alice.near", 100, START);
    contract.deposit(first);
    context("alice.near", 200, START);
    contract.deposit(second);

    context("alice.near", 0, START + 1);
    contract.set_check_in_interval(first, INTERVAL * 2);

    assert_eq!(
        contract
            .get_vault(account("alice.near"), first)
            .unwrap()
            .check_in_interval_ns
            .0,
        INTERVAL * 2
    );
    assert_eq!(
        contract
            .get_vault(account("alice.near"), second)
            .unwrap()
            .check_in_interval_ns
            .0,
        INTERVAL
    );
}
