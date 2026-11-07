use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use std::panic::{catch_unwind, AssertUnwindSafe};

const START: u64 = 1_000_000_000_000;
const INTERVAL: u64 = 120_000_000_000;
const STORAGE_DEPOSIT: u128 = 10u128.pow(24);

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str, current: &str, attached: u128, timestamp: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .predecessor_account_id(account(predecessor))
        .current_account_id(account(current))
        .attached_deposit(near_sdk::NearToken::from_yoctonear(attached))
        .block_timestamp(timestamp);
    near_sdk::testing_env!(builder.build());
}

fn owner_context(owner: &str, attached: u128, timestamp: u64) {
    context(owner, "vigil.near", attached, timestamp);
}

fn callback_context() {
    context("vigil.near", "vigil.near", 0, START + INTERVAL + 1);
}

fn create_vault(contract: &mut VaultRegistry, owner: &str) -> u64 {
    owner_context(owner, STORAGE_DEPOSIT, START);
    contract.create_vault(INTERVAL).0
}

fn setup_triggered(balance: u128) -> (VaultRegistry, u64) {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        vec![(account("bob.near"), 50), (account("carol.near"), 50)],
    );
    owner_context("alice.near", balance, START);
    contract.deposit(vault_id);
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.trigger_inheritance(account("alice.near"), vault_id);
    (contract, vault_id)
}

fn claim(contract: &mut VaultRegistry, vault_id: u64, beneficiary: &str) {
    context(
        beneficiary,
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.claim(account("alice.near"), vault_id);
}

#[test]
#[should_panic(expected = "InsufficientStorage")]
fn measured_storage_deposit_is_required() {
    owner_context("alice.near", 0, START);
    VaultRegistry::new().create_vault(INTERVAL);
}

#[test]
fn measured_storage_reserve_is_recorded_per_vault() {
    let mut contract = VaultRegistry::new();
    let first = create_vault(&mut contract, "alice.near");
    let second = create_vault(&mut contract, "alice.near");
    let first_reserve = contract
        .get_vault(account("alice.near"), first)
        .unwrap()
        .storage_reserved
        .0;
    let second_reserve = contract
        .get_vault(account("alice.near"), second)
        .unwrap()
        .storage_reserved
        .0;
    assert!(first_reserve > 0);
    assert!(second_reserve > 0);

    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(first, vec![(account("bob.near"), 100)]);
    assert!(
        contract
            .get_vault(account("alice.near"), first)
            .unwrap()
            .storage_reserved
            .0
            > first_reserve
    );
    assert_eq!(
        contract
            .get_vault(account("alice.near"), second)
            .unwrap()
            .storage_reserved
            .0,
        second_reserve
    );
}

#[test]
fn create_vault_refunds_excess_storage_deposit() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    let owner = account("alice.near");
    let required = contract
        .get_vault(owner.clone(), vault_id)
        .unwrap()
        .storage_reserved
        .0;
    let expected_refund = STORAGE_DEPOSIT - required;

    assert!(get_created_receipts().iter().any(|receipt| {
        receipt.receiver_id == owner
            && receipt.actions.iter().any(|action| {
                matches!(
                    action,
                    MockAction::Transfer { deposit, .. }
                        if deposit.as_yoctonear() == expected_refund
                )
            })
    }));
}

#[test]
fn unfunded_vault_does_not_expire_and_first_deposit_starts_clock() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    let owner = account("alice.near");
    let funded_at = START + INTERVAL + 10;

    owner_context("alice.near", STORAGE_DEPOSIT, funded_at);
    assert!(!contract.is_overdue(owner.clone(), vault_id));
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);

    owner_context("alice.near", 100, funded_at);
    contract.deposit(vault_id);
    let vault = contract.get_vault(owner.clone(), vault_id).unwrap();
    assert_eq!(vault.last_ping_ns.0, funded_at);
    assert_eq!(vault.deadline_ns.0, funded_at + INTERVAL);

    owner_context("alice.near", 0, funded_at + INTERVAL + 1);
    assert!(contract.is_overdue(owner, vault_id));
}

#[test]
#[should_panic(expected = "InsufficientStorage")]
fn beneficiary_growth_requires_storage_deposit() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", 0, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
}

#[test]
#[should_panic(expected = "InsufficientStorage")]
fn entitlement_growth_requires_storage_deposit() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    context("keeper.near", "vigil.near", 0, START + INTERVAL + 1);
    contract.trigger_inheritance(account("alice.near"), vault_id);
}

#[test]
fn pending_claim_prevents_withdrawal_and_failed_callback_remains_recoverable() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.trigger_inheritance(account("alice.near"), vault_id);

    claim(&mut contract, vault_id, "bob.near");
    let pending = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(pending.vault_balance.0, 0);
    assert_eq!(pending.pending_count.0, 1);
    assert!(pending.active);

    owner_context("alice.near", STORAGE_DEPOSIT, START + INTERVAL + 1);
    let withdrawal = catch_unwind(AssertUnwindSafe(|| contract.withdraw_all(vault_id)));
    assert!(withdrawal.is_err());
    let still_pending = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert!(still_pending.active);
    assert_eq!(still_pending.pending_count.0, 1);

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );

    let restored = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert!(restored.active);
    assert!(restored.inheritance_triggered);
    assert_eq!(restored.vault_balance.0, 100);
    assert_eq!(restored.pending_count.0, 0);

    claim(&mut contract, vault_id, "bob.near");
    assert_eq!(
        contract
            .get_vault(account("alice.near"), vault_id)
            .unwrap()
            .vault_balance
            .0,
        0
    );
    assert!(contract.pending_transfers.get("alice.near:0:1").is_some());
}

#[test]
fn failed_claim_restores_only_matching_vault_and_claim() {
    let (mut contract, vault_id) = setup_triggered(100);
    claim(&mut contract, vault_id, "bob.near");
    claim(&mut contract, vault_id, "carol.near");

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );

    assert_eq!(
        contract
            .get_vault(account("alice.near"), vault_id)
            .unwrap()
            .vault_balance
            .0,
        50
    );
    assert!(!contract
        .claimed
        .get("alice.near:0:bob.near")
        .cloned()
        .unwrap_or(false));
    assert!(contract
        .claimed
        .get("alice.near:0:carol.near")
        .cloned()
        .unwrap());
    assert!(contract.pending_transfers.get("alice.near:0:1").is_some());
}

#[test]
fn concurrent_claims_cannot_overdraw_and_callbacks_can_arrive_out_of_order() {
    let (mut contract, vault_id) = setup_triggered(101);
    claim(&mut contract, vault_id, "bob.near");
    claim(&mut contract, vault_id, "carol.near");

    let pending = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(pending.vault_balance.0, 0);
    assert_eq!(pending.pending_count.0, 2);
    let beneficiaries = contract.get_beneficiaries(account("alice.near"), vault_id);
    assert_eq!(
        beneficiaries[0].claimed_amount.0 + beneficiaries[1].claimed_amount.0,
        101
    );

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:1".into(),
        Ok(()),
    );
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Ok(()),
    );

    let completed = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(completed.vault_balance.0, 0);
    assert_eq!(completed.pending_count.0, 0);
}

#[test]
fn triggered_zero_balance_vault_rejects_new_deposits() {
    let (mut contract, vault_id) = setup_triggered(100);
    claim(&mut contract, vault_id, "bob.near");
    claim(&mut contract, vault_id, "carol.near");

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Ok(()),
    );
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:1".into(),
        Ok(()),
    );

    let before = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(before.vault_balance.0, 0);
    assert!(before.inheritance_triggered);
    assert_eq!(before.pending_count.0, 0);

    owner_context("alice.near", 50, START + INTERVAL + 2);
    let result = catch_unwind(AssertUnwindSafe(|| contract.deposit(vault_id)));
    assert!(result.is_err());

    let after = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(after.vault_balance.0, 0);
    assert_eq!(after.last_ping_ns.0, before.last_ping_ns.0);
    assert!(after.inheritance_triggered);
}

#[test]
fn replayed_or_cross_vault_callback_is_an_absolute_noop() {
    let (mut contract, vault_id) = setup_triggered(100);
    claim(&mut contract, vault_id, "bob.near");
    let before = contract.get_vault(account("alice.near"), vault_id).unwrap();

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id + 1,
        "alice.near:0:0".into(),
        Ok(()),
    );
    let unchanged = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(unchanged.pending_count.0, before.pending_count.0);
    assert!(contract.pending_transfers.get("alice.near:0:0").is_some());

    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Ok(()),
    );
    let after_success = contract.get_vault(account("alice.near"), vault_id).unwrap();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Ok(()),
    );
    let after_replay = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(after_replay.pending_count.0, after_success.pending_count.0);
    assert_eq!(after_replay.vault_balance.0, after_success.vault_balance.0);
}

#[test]
fn failed_withdrawal_restores_only_its_vault() {
    let mut contract = VaultRegistry::new();
    let first = create_vault(&mut contract, "alice.near");
    let second = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(first, vec![(account("bob.near"), 100)]);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(second, vec![(account("carol.near"), 100)]);
    owner_context("alice.near", 75, START);
    contract.deposit(first);
    owner_context("alice.near", 25, START);
    contract.deposit(second);

    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.withdraw_all(first);
    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        first,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );

    assert_eq!(
        contract
            .get_vault(account("alice.near"), first)
            .unwrap()
            .vault_balance
            .0,
        75
    );
    let other = contract.get_vault(account("alice.near"), second).unwrap();
    assert_eq!(other.vault_balance.0, 25);
    assert!(other.active);
}

#[test]
fn failed_fallback_transfer_restores_a_retryable_vault() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_fallback(vault_id, Some(account("fallback.near")));
    owner_context("alice.near", 125, START);
    contract.deposit(vault_id);

    context(
        "fallback.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + (INTERVAL * 2) + 1,
    );
    contract.claim_fallback(account("alice.near"), vault_id);
    let pending = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert!(!pending.active);
    assert_eq!(pending.vault_balance.0, 0);
    assert_eq!(pending.pending_count.0, 1);

    callback_context();
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );
    let restored = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert!(restored.active);
    assert_eq!(restored.vault_balance.0, 125);
    assert_eq!(restored.pending_count.0, 0);

    context(
        "fallback.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + (INTERVAL * 2) + 2,
    );
    contract.claim_fallback(account("alice.near"), vault_id);
    assert!(contract.pending_transfers.get("alice.near:0:1").is_some());
}

#[test]
fn fallback_only_vault_funds_and_uses_a_strict_double_interval_boundary() {
    let mut contract = VaultRegistry::new();
    let vault_id = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_fallback(vault_id, Some(account("fallback.near")));
    owner_context("alice.near", 125, START);
    contract.deposit(vault_id);

    context(
        "fallback.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + (INTERVAL * 2),
    );
    let exact_boundary = catch_unwind(AssertUnwindSafe(|| {
        contract.claim_fallback(account("alice.near"), vault_id);
    }));
    assert!(exact_boundary.is_err());
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        125
    );

    context(
        "fallback.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + (INTERVAL * 2) + 1,
    );
    contract.claim_fallback(account("alice.near"), vault_id);
    let pending = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(pending.vault_balance.0, 0);
    assert_eq!(pending.pending_count.0, 1);
    assert!(!pending.active);
}

#[test]
fn fallback_cannot_sweep_while_beneficiary_claims_are_pending() {
    let (mut contract, vault_id) = setup_triggered(100);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    let set_after_trigger = catch_unwind(AssertUnwindSafe(|| {
        contract.set_fallback(vault_id, Some(account("fallback.near")));
    }));
    assert!(set_after_trigger.is_err());

    // Configure a fresh vault with both beneficiaries and fallback.
    let second = create_vault(&mut contract, "alice.near");
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(second, vec![(account("bob.near"), 100)]);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_fallback(second, Some(account("fallback.near")));
    owner_context("alice.near", 100, START);
    contract.deposit(second);
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.trigger_inheritance(account("alice.near"), second);
    claim(&mut contract, second, "bob.near");

    context(
        "fallback.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + (INTERVAL * 2) + 1,
    );
    let result = catch_unwind(AssertUnwindSafe(|| {
        contract.claim_fallback(account("alice.near"), second);
    }));
    assert!(result.is_err());
}

#[test]
#[should_panic(expected = "Private")]
fn callback_rejects_external_caller() {
    let (mut contract, vault_id) = setup_triggered(100);
    context("mallory.near", "vigil.near", 0, START + INTERVAL + 1);
    contract.on_transfer_callback(account("alice.near"), vault_id, "missing".into(), Ok(()));
}
