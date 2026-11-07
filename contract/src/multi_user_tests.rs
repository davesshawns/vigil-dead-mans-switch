use super::*;
use near_sdk::test_utils::VMContextBuilder;
use std::panic::{catch_unwind, AssertUnwindSafe};

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

fn create(contract: &mut VaultRegistry, owner: &str, timestamp: u64) -> u64 {
    context(owner, STORAGE_DEPOSIT, timestamp);
    contract.create_vault(INTERVAL).0
}

fn deposit(contract: &mut VaultRegistry, owner: &str, vault_id: u64, amount: u128, timestamp: u64) {
    context(owner, amount, timestamp);
    contract.deposit(vault_id);
}

fn configure(
    contract: &mut VaultRegistry,
    owner: &str,
    vault_id: u64,
    beneficiary: &str,
    timestamp: u64,
) {
    context(owner, STORAGE_DEPOSIT, timestamp);
    contract.set_beneficiaries(vault_id, vec![(account(beneficiary), 100)]);
}

#[test]
fn two_wallets_create_and_read_independent_vaults() {
    let mut contract = VaultRegistry::new();
    let alice_id = create(&mut contract, "alice.near", START);
    let bob_id = create(&mut contract, "bob.near", START + 10);

    let alice = contract.get_vault(account("alice.near"), alice_id).unwrap();
    let bob = contract.get_vault(account("bob.near"), bob_id).unwrap();

    assert_eq!(contract.vault_count(), 2);
    assert_eq!(alice.owner, account("alice.near"));
    assert_eq!(bob.owner, account("bob.near"));
    assert_eq!(alice.last_ping_ns.0, START);
    assert_eq!(bob.last_ping_ns.0, START + 10);
    assert!(alice.storage_reserved.0 > 0);
    assert!(bob.storage_reserved.0 > 0);
}

#[test]
fn one_wallet_can_create_multiple_independent_vaults() {
    let mut contract = VaultRegistry::new();
    let first = create(&mut contract, "alice.near", START);
    let second = create(&mut contract, "alice.near", START + 10);

    assert_eq!((first, second), (0, 1));
    assert_eq!(
        contract.get_vault_ids(account("alice.near")),
        vec![U64(0), U64(1)]
    );

    configure(
        &mut contract,
        "alice.near",
        first,
        "first-beneficiary.near",
        START + 20,
    );
    configure(
        &mut contract,
        "alice.near",
        second,
        "second-beneficiary.near",
        START + 30,
    );
    deposit(&mut contract, "alice.near", first, 400, START + 20);
    deposit(&mut contract, "alice.near", second, 900, START + 30);

    assert_eq!(contract.vault_balance(account("alice.near"), first).0, 400);
    assert_eq!(contract.vault_balance(account("alice.near"), second).0, 900);
    assert_eq!(
        contract.get_beneficiaries(account("alice.near"), first)[0].account_id,
        account("first-beneficiary.near")
    );
    assert_eq!(
        contract.get_beneficiaries(account("alice.near"), second)[0].account_id,
        account("second-beneficiary.near")
    );
}

#[test]
fn owner_vault_list_is_bounded_before_new_state_is_inserted() {
    let mut contract = VaultRegistry::new();
    let owner = account("alice.near");
    contract
        .owner_vault_ids
        .insert(owner.clone(), (0..MAX_VAULTS_PER_OWNER as u64).collect());
    contract
        .next_vault_id
        .insert(owner.clone(), MAX_VAULTS_PER_OWNER as u64);

    context("alice.near", STORAGE_DEPOSIT, START);
    let result = catch_unwind(AssertUnwindSafe(|| contract.create_vault(INTERVAL)));
    assert!(result.is_err());
    assert!(!contract.has_vault(owner, MAX_VAULTS_PER_OWNER as u64));
}

#[test]
fn owner_actions_are_confined_to_predecessor_and_vault_id() {
    let mut contract = VaultRegistry::new();
    let alice_id = create(&mut contract, "alice.near", START);
    let bob_id = create(&mut contract, "bob.near", START);
    configure(
        &mut contract,
        "alice.near",
        alice_id,
        "alice-beneficiary.near",
        START,
    );
    configure(
        &mut contract,
        "bob.near",
        bob_id,
        "bob-beneficiary.near",
        START,
    );
    deposit(&mut contract, "alice.near", alice_id, 400, START);
    deposit(&mut contract, "bob.near", bob_id, 900, START);

    let alice_before = contract.get_vault(account("alice.near"), alice_id).unwrap();
    context("bob.near", 0, START + 20);
    contract.ping(bob_id);
    let alice_after = contract.get_vault(account("alice.near"), alice_id).unwrap();
    let bob_after = contract.get_vault(account("bob.near"), bob_id).unwrap();
    assert_eq!(alice_after.last_ping_ns.0, alice_before.last_ping_ns.0);
    assert_eq!(alice_after.vault_balance.0, 400);
    assert_eq!(bob_after.last_ping_ns.0, START + 20);
    assert_eq!(bob_after.vault_balance.0, 900);
}

#[test]
fn another_owner_cannot_target_same_numeric_vault_id() {
    let mut contract = VaultRegistry::new();
    let alice_id = create(&mut contract, "alice.near", START);
    configure(
        &mut contract,
        "alice.near",
        alice_id,
        "beneficiary.near",
        START,
    );
    deposit(&mut contract, "alice.near", alice_id, 400, START);

    context("mallory.near", 0, START + 10);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.ping(alice_id))).is_err());

    context("mallory.near", STORAGE_DEPOSIT, START + 10);
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.set_beneficiaries(alice_id, vec![(account("mallory.near"), 100)]);
    }))
    .is_err());

    let vault = contract.get_vault(account("alice.near"), alice_id).unwrap();
    assert_eq!(vault.vault_balance.0, 400);
    assert_eq!(
        contract.get_beneficiaries(account("alice.near"), alice_id)[0].account_id,
        account("beneficiary.near")
    );
}

#[test]
fn trigger_storage_and_accounting_are_isolated_by_owner_and_vault() {
    let mut contract = VaultRegistry::new();
    let alice_first = create(&mut contract, "alice.near", START);
    let alice_second = create(&mut contract, "alice.near", START);
    let bob_id = create(&mut contract, "bob.near", START);
    configure(
        &mut contract,
        "alice.near",
        alice_first,
        "first-beneficiary.near",
        START,
    );
    configure(
        &mut contract,
        "alice.near",
        alice_second,
        "second-beneficiary.near",
        START,
    );
    configure(
        &mut contract,
        "bob.near",
        bob_id,
        "bob-beneficiary.near",
        START,
    );
    deposit(&mut contract, "alice.near", alice_first, 400, START);
    deposit(&mut contract, "alice.near", alice_second, 700, START);
    deposit(&mut contract, "bob.near", bob_id, 900, START);

    let second_before = contract
        .get_vault(account("alice.near"), alice_second)
        .unwrap();
    let bob_before = contract.get_vault(account("bob.near"), bob_id).unwrap();
    context("keeper.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    contract.trigger_inheritance(account("alice.near"), alice_first);

    assert!(contract.is_triggered(account("alice.near"), alice_first));
    assert!(!contract.is_triggered(account("alice.near"), alice_second));
    assert!(!contract.is_triggered(account("bob.near"), bob_id));
    assert_eq!(
        contract
            .get_vault(account("alice.near"), alice_second)
            .unwrap()
            .vault_balance
            .0,
        second_before.vault_balance.0
    );
    assert_eq!(
        contract
            .get_vault(account("bob.near"), bob_id)
            .unwrap()
            .storage_reserved
            .0,
        bob_before.storage_reserved.0
    );
    assert!(contract
        .entitlement
        .get(&"alice.near:0:first-beneficiary.near".to_string())
        .is_some());
    assert!(contract
        .entitlement
        .get(&"alice.near:1:first-beneficiary.near".to_string())
        .is_none());
}

#[test]
fn closing_one_vault_does_not_close_another() {
    let mut contract = VaultRegistry::new();
    let first = create(&mut contract, "alice.near", START);
    let second = create(&mut contract, "alice.near", START);
    configure(&mut contract, "alice.near", first, "bob.near", START);
    configure(&mut contract, "alice.near", second, "carol.near", START);
    deposit(&mut contract, "alice.near", first, 50, START);
    deposit(&mut contract, "alice.near", second, 75, START);

    context("alice.near", STORAGE_DEPOSIT, START + 1);
    contract.withdraw_all(first);

    assert!(
        !contract
            .get_vault(account("alice.near"), first)
            .unwrap()
            .active
    );
    let other = contract.get_vault(account("alice.near"), second).unwrap();
    assert!(other.active);
    assert_eq!(other.vault_balance.0, 75);
}

#[test]
fn early_automation_cannot_trigger_any_vault() {
    let mut contract = VaultRegistry::new();
    let vault_id = create(&mut contract, "alice.near", START);
    configure(
        &mut contract,
        "alice.near",
        vault_id,
        "beneficiary.near",
        START,
    );
    deposit(&mut contract, "alice.near", vault_id, 400, START);

    context("keeper.near", STORAGE_DEPOSIT, START + INTERVAL);
    let result = catch_unwind(AssertUnwindSafe(|| {
        contract.trigger_inheritance(account("alice.near"), vault_id);
    }));
    assert!(result.is_err());
    assert!(!contract.is_triggered(account("alice.near"), vault_id));
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        400
    );
}
