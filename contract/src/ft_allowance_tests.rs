use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use std::panic::{catch_unwind, AssertUnwindSafe};

const START: u64 = 1_000_000_000_000;
const INTERVAL: u64 = 120_000_000_000;
const ALLOWANCE_PERIOD: u64 = 60_000_000_000;
const STORAGE_DEPOSIT: u128 = 10u128.pow(24);

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}

fn context(predecessor: &str, current: &str, attached: u128, timestamp: u64) {
    let mut builder = VMContextBuilder::new();
    builder
        .predecessor_account_id(account(predecessor))
        .current_account_id(account(current))
        .attached_deposit(NearToken::from_yoctonear(attached))
        .block_timestamp(timestamp);
    near_sdk::testing_env!(builder.build());
}

fn owner_context(owner: &str, attached: u128, timestamp: u64) {
    context(owner, "vigil.near", attached, timestamp);
}

fn callback_context(timestamp: u64) {
    context("vigil.near", "vigil.near", 0, timestamp);
}

fn native_vault(contract: &mut VaultRegistry, beneficiaries: Vec<(&str, u32)>) -> u64 {
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    let vault_id = contract.create_vault(INTERVAL).0;
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(
        vault_id,
        beneficiaries
            .into_iter()
            .map(|(beneficiary, share)| (account(beneficiary), share))
            .collect(),
    );
    vault_id
}

fn ft_vault(contract: &mut VaultRegistry) -> u64 {
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    let vault_id = contract.create_ft_vault(INTERVAL, account("usdc.near")).0;
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_beneficiaries(vault_id, vec![(account("bob.near"), 100)]);
    vault_id
}

fn ft_deposit(contract: &mut VaultRegistry, vault_id: u64, amount: u128, timestamp: u64) -> u128 {
    context("usdc.near", "vigil.near", 0, timestamp);
    match contract.ft_on_transfer(
        account("alice.near"),
        U128(amount),
        format!(r#"{{"vault_id":"{vault_id}"}}"#),
    ) {
        PromiseOrValue::Value(unused) => unused.0,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

#[test]
fn token_allowlist_is_immutable_bounded_and_duplicate_free() {
    let contract = VaultRegistry::new(Some(vec![account("usdc.near")]));
    assert_eq!(contract.get_allowed_tokens(), vec![account("usdc.near")]);

    assert!(catch_unwind(AssertUnwindSafe(|| {
        VaultRegistry::new(Some(vec![account("usdc.near"), account("usdc.near")]))
    }))
    .is_err());
    assert!(catch_unwind(AssertUnwindSafe(|| {
        VaultRegistry::new(Some(
            (0..=MAX_ALLOWED_TOKENS)
                .map(|index| account(&format!("token{index}.near")))
                .collect(),
        ))
    }))
    .is_err());
}

#[test]
fn ft_deposit_accepts_only_owner_matching_allowed_token_and_vault() {
    let mut contract = VaultRegistry::new(Some(vec![account("usdc.near")]));
    let vault_id = ft_vault(&mut contract);

    context("fake.near", "vigil.near", 0, START);
    assert_eq!(
        match contract.ft_on_transfer(
            account("alice.near"),
            U128(100),
            format!(r#"{{"vault_id":"{vault_id}"}}"#),
        ) {
            PromiseOrValue::Value(value) => value.0,
            PromiseOrValue::Promise(_) => 0,
        },
        100
    );
    context("usdc.near", "vigil.near", 0, START);
    assert_eq!(
        match contract.ft_on_transfer(
            account("mallory.near"),
            U128(100),
            format!(r#"{{"vault_id":"{vault_id}"}}"#),
        ) {
            PromiseOrValue::Value(value) => value.0,
            PromiseOrValue::Promise(_) => 0,
        },
        100
    );
    assert_eq!(ft_deposit(&mut contract, vault_id, 100, START + 1), 0);
    let vault = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(vault.vault_balance.0, 100);
    assert_eq!(vault.total_deposited.0, 100);
    assert_eq!(vault.token_contract, Some(account("usdc.near")));
}

#[test]
fn malformed_wrong_asset_and_expired_ft_deposits_are_refunded() {
    let mut contract = VaultRegistry::new(Some(vec![account("usdc.near")]));
    let vault_id = ft_vault(&mut contract);
    context("usdc.near", "vigil.near", 0, START);
    assert_eq!(
        match contract.ft_on_transfer(account("alice.near"), U128(10), "not-json".into()) {
            PromiseOrValue::Value(value) => value.0,
            PromiseOrValue::Promise(_) => 0,
        },
        10
    );
    assert_eq!(ft_deposit(&mut contract, vault_id, 100, START), 0);
    assert_eq!(
        ft_deposit(&mut contract, vault_id, 25, START + INTERVAL + 1),
        25
    );

    owner_context("alice.near", 10, START);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.deposit(vault_id))).is_err());
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        100
    );
}

#[test]
fn ft_claim_uses_exactly_one_yocto_and_failure_restores_state() {
    let mut contract = VaultRegistry::new(Some(vec![account("usdc.near")]));
    let vault_id = ft_vault(&mut contract);
    assert_eq!(ft_deposit(&mut contract, vault_id, 100, START), 0);
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.trigger_inheritance(account("alice.near"), vault_id);
    context(
        "bob.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    contract.claim(account("alice.near"), vault_id);

    assert!(get_created_receipts().iter().any(|receipt| {
        receipt.receiver_id == account("usdc.near")
            && receipt.actions.iter().any(|action| {
                matches!(
                    action,
                    MockAction::FunctionCallWeight {
                        method_name,
                        attached_deposit,
                        ..
                    } if method_name == b"ft_transfer"
                        && attached_deposit.as_yoctonear() == FT_TRANSFER_DEPOSIT_YOCTO
                )
            })
    }));

    callback_context(START + INTERVAL + 2);
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        100
    );
    let beneficiary = &contract.get_beneficiaries(account("alice.near"), vault_id)[0];
    assert!(!beneficiary.claimed);
    assert!(!beneficiary.transfer_pending);
    assert!(get_created_receipts().iter().any(|receipt| {
        receipt.receiver_id == account("bob.near")
            && receipt.actions.iter().any(|action| {
                matches!(action, MockAction::Transfer { deposit, .. }
                    if deposit.as_yoctonear() == FT_TRANSFER_DEPOSIT_YOCTO)
            })
    }));
}

#[test]
fn allowance_due_boundary_missed_periods_and_success_accounting_are_deterministic() {
    let mut contract = VaultRegistry::new(None);
    let vault_id = native_vault(&mut contract, vec![("bob.near", 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(10), U64(ALLOWANCE_PERIOD));

    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD - 1,
    );
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    }))
    .is_err());
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD * 2,
    );
    contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        90
    );

    callback_context(START + ALLOWANCE_PERIOD * 2 + 1);
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Ok(()),
    );
    let beneficiary = &contract.get_beneficiaries(account("alice.near"), vault_id)[0];
    assert_eq!(beneficiary.allowance_paid.0, 10);
    assert_eq!(
        beneficiary.allowance_last_release_ns.0,
        START + ALLOWANCE_PERIOD * 2
    );
    assert!(!beneficiary.allowance_transfer_pending);
}

#[test]
fn failed_allowance_restores_balance_and_previous_schedule_and_replay_is_noop() {
    let mut contract = VaultRegistry::new(None);
    let vault_id = native_vault(&mut contract, vec![("bob.near", 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(25), U64(ALLOWANCE_PERIOD));
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));

    callback_context(START + ALLOWANCE_PERIOD + 1);
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );
    let restored = contract.get_vault(account("alice.near"), vault_id).unwrap();
    assert_eq!(restored.vault_balance.0, 100);
    assert_eq!(restored.pending_count.0, 0);
    let beneficiary = &contract.get_beneficiaries(account("alice.near"), vault_id)[0];
    assert_eq!(beneficiary.allowance_last_release_ns.0, START);
    assert_eq!(beneficiary.allowance_paid.0, 0);

    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        100
    );
}

#[test]
fn pending_allowance_blocks_reconfiguration_withdrawal_and_inheritance() {
    let mut contract = VaultRegistry::new(None);
    let vault_id = native_vault(&mut contract, vec![("bob.near", 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(10), U64(ALLOWANCE_PERIOD));
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));

    owner_context("alice.near", STORAGE_DEPOSIT, START + ALLOWANCE_PERIOD + 1);
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.set_allowance(vault_id, U128(0), U64(0));
    }))
    .is_err());
    owner_context("alice.near", STORAGE_DEPOSIT, START + ALLOWANCE_PERIOD + 1);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.withdraw_all(vault_id))).is_err());
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + INTERVAL + 1,
    );
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.trigger_inheritance(account("alice.near"), vault_id);
    }))
    .is_err());
}

#[test]
fn concurrent_allowances_cannot_overdraw_or_duplicate_a_beneficiary() {
    let mut contract = VaultRegistry::new(None);
    let vault_id = native_vault(&mut contract, vec![("bob.near", 50), ("carol.near", 50)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(60), U64(ALLOWANCE_PERIOD));
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    }))
    .is_err());
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.release_allowance(account("alice.near"), vault_id, account("carol.near"));
    }))
    .is_err());
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        40
    );
}

#[test]
fn allowance_updates_are_owner_scoped_prospective_and_revocable() {
    let mut contract = VaultRegistry::new(None);
    let vault_id = native_vault(&mut contract, vec![("bob.near", 100)]);
    owner_context("alice.near", 100, START);
    contract.deposit(vault_id);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(10), U64(ALLOWANCE_PERIOD));

    context("mallory.near", "vigil.near", STORAGE_DEPOSIT, START + 1);
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.trigger_allowance(vault_id, account("bob.near"));
    }))
    .is_err());

    owner_context("alice.near", STORAGE_DEPOSIT, START + 10);
    contract.set_allowance(vault_id, U128(20), U64(ALLOWANCE_PERIOD));
    let beneficiary = &contract.get_beneficiaries(account("alice.near"), vault_id)[0];
    assert_eq!(beneficiary.allowance_last_release_ns.0, START + 10);
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    assert!(catch_unwind(AssertUnwindSafe(|| {
        contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    }))
    .is_err());

    owner_context("alice.near", STORAGE_DEPOSIT, START + 11);
    contract.set_allowance(vault_id, U128(0), U64(0));
    assert!(
        !contract
            .get_vault(account("alice.near"), vault_id)
            .unwrap()
            .allowance_enabled
    );
}

#[test]
fn ft_allowance_uses_token_transfer_and_failure_is_retryable() {
    let mut contract = VaultRegistry::new(Some(vec![account("usdc.near")]));
    let vault_id = ft_vault(&mut contract);
    assert_eq!(ft_deposit(&mut contract, vault_id, 100, START), 0);
    owner_context("alice.near", STORAGE_DEPOSIT, START);
    contract.set_allowance(vault_id, U128(10), U64(ALLOWANCE_PERIOD));
    context(
        "keeper.near",
        "vigil.near",
        STORAGE_DEPOSIT,
        START + ALLOWANCE_PERIOD,
    );
    contract.release_allowance(account("alice.near"), vault_id, account("bob.near"));
    assert!(get_created_receipts().iter().any(|receipt| {
        receipt.receiver_id == account("usdc.near") && receipt.actions.iter().any(|action| {
            matches!(action, MockAction::FunctionCallWeight { method_name, attached_deposit, .. }
                    if method_name == b"ft_transfer"
                        && attached_deposit.as_yoctonear() == FT_TRANSFER_DEPOSIT_YOCTO)
        })
    }));

    callback_context(START + ALLOWANCE_PERIOD + 1);
    contract.on_transfer_callback(
        account("alice.near"),
        vault_id,
        "alice.near:0:0".into(),
        Err(PromiseError::Failed),
    );
    assert_eq!(
        contract.vault_balance(account("alice.near"), vault_id).0,
        100
    );
    assert_eq!(
        contract.get_beneficiaries(account("alice.near"), vault_id)[0]
            .allowance_last_release_ns
            .0,
        START
    );
}
