use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{U128, U64};
use near_sdk::near;
use near_sdk::store::LookupMap;
use near_sdk::{env, AccountId, Gas, PanicOnDefault, Promise, PromiseError};

#[cfg(test)]
mod basic_tests;
#[cfg(test)]
mod callback_regression_tests;
#[cfg(test)]
mod multi_user_tests;

const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(30);
const MIN_CHECK_IN_INTERVAL_NS: u64 = 60_000_000_000;
const MAX_BENEFICIARIES: usize = 100;
const MAX_VAULTS_PER_OWNER: usize = 100;

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Beneficiary {
    pub account_id: AccountId,
    pub share_percent: u32,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct PendingTransfer {
    pub owner: AccountId,
    pub vault_id: u64,
    pub recipient: AccountId,
    pub amount: u128,
    pub nonce: u64,
    pub kind: TransferKind,
}

#[derive(BorshDeserialize, BorshSerialize, Clone, PartialEq, Eq)]
pub enum TransferKind {
    Claim,
    Withdrawal,
    Fallback,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Vault {
    pub vault_id: u64,
    pub owner: AccountId,
    pub check_in_interval_ns: u64,
    pub last_ping_ns: u64,
    pub active: bool,
    pub total_deposited: u128,
    pub vault_balance: u128,
    pub beneficiaries: Vec<Beneficiary>,
    pub beneficiaries_set: bool,
    pub fallback_account: Option<AccountId>,
    pub inheritance_triggered: bool,
    pub distributable_snapshot: u128,
    pub pending_count: u64,
    pub next_transfer_nonce: u64,
    pub pending_withdrawal_nonce: Option<u64>,
    pub pending_fallback_nonce: Option<u64>,
    pub storage_reserved: u128,
}

#[near(serializers = [json])]
pub struct VaultView {
    pub vault_id: U64,
    pub owner: AccountId,
    pub check_in_interval_ns: U64,
    pub last_ping_ns: U64,
    pub deadline_ns: U64,
    pub active: bool,
    pub total_deposited: U128,
    pub vault_balance: U128,
    pub beneficiaries_set: bool,
    pub fallback_account: Option<AccountId>,
    pub inheritance_triggered: bool,
    pub distributable_snapshot: U128,
    pub pending_count: U64,
    pub next_transfer_nonce: U64,
    pub pending_withdrawal: bool,
    pub pending_fallback: bool,
    pub storage_reserved: U128,
}

#[near(serializers = [json])]
pub struct BeneficiaryView {
    pub account_id: AccountId,
    pub share_percent: u32,
    pub entitlement: U128,
    pub claimed: bool,
    pub claimed_amount: U128,
    pub transfer_pending: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct VaultRegistry {
    pub vaults: LookupMap<String, Vault>,
    pub owner_vault_ids: LookupMap<AccountId, Vec<u64>>,
    pub next_vault_id: LookupMap<AccountId, u64>,
    pub total_vaults: u64,
    pub claimed: LookupMap<String, bool>,
    pub claimed_amount: LookupMap<String, u128>,
    pub pending_transfers: LookupMap<String, PendingTransfer>,
    pub entitlement: LookupMap<String, u128>,
    pub claim_transfer: LookupMap<String, String>,
}

#[near]
impl VaultRegistry {
    #[init]
    pub fn new() -> Self {
        Self {
            vaults: LookupMap::new(b"v".to_vec()),
            owner_vault_ids: LookupMap::new(b"ovi".to_vec()),
            next_vault_id: LookupMap::new(b"nvi".to_vec()),
            total_vaults: 0,
            claimed: LookupMap::new(b"c".to_vec()),
            claimed_amount: LookupMap::new(b"ca".to_vec()),
            pending_transfers: LookupMap::new(b"pt".to_vec()),
            entitlement: LookupMap::new(b"e".to_vec()),
            claim_transfer: LookupMap::new(b"ct".to_vec()),
        }
    }

    fn vault_key(owner: &AccountId, vault_id: u64) -> String {
        format!("{}:{}", owner, vault_id)
    }

    fn claim_key(owner: &AccountId, vault_id: u64, beneficiary: &AccountId) -> String {
        format!("{}:{}:{}", owner, vault_id, beneficiary)
    }
    fn entitlement_key(owner: &AccountId, vault_id: u64, beneficiary: &AccountId) -> String {
        format!("{}:{}:{}", owner, vault_id, beneficiary)
    }

    fn transfer_key(owner: &AccountId, vault_id: u64, nonce: u64) -> String {
        format!("{}:{}:{}", owner, vault_id, nonce)
    }

    fn deadline(vault: &Vault) -> u64 {
        vault
            .last_ping_ns
            .checked_add(vault.check_in_interval_ns)
            .expect("InvalidInterval")
    }

    fn fallback_deadline(vault: &Vault) -> u64 {
        let fallback_interval = vault
            .check_in_interval_ns
            .checked_mul(2)
            .expect("InvalidInterval");
        vault
            .last_ping_ns
            .checked_add(fallback_interval)
            .expect("InvalidInterval")
    }

    fn assert_deadline_open(vault: &Vault, now: u64) {
        if vault.vault_balance > 0 {
            assert!(now <= Self::deadline(vault), "AlreadyTriggered");
        }
    }

    fn percentage_floor(total: u128, share_percent: u32) -> u128 {
        let percent = share_percent as u128;
        let whole = (total / 100).checked_mul(percent).expect("Overflow");
        let fractional = (total % 100).checked_mul(percent).expect("Overflow") / 100;
        whole.checked_add(fractional).expect("Overflow")
    }

    fn storage_cost(bytes: u64) -> u128 {
        env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(bytes as u128)
            .expect("Overflow")
    }

    fn refund(account_id: AccountId, amount: u128) {
        if amount > 0 {
            let _ = Promise::new(account_id).transfer(near_sdk::NearToken::from_yoctonear(amount));
        }
    }

    fn flush_state(&mut self) {
        self.vaults.flush();
        self.owner_vault_ids.flush();
        self.next_vault_id.flush();
        self.claimed.flush();
        self.claimed_amount.flush();
        self.pending_transfers.flush();
        self.entitlement.flush();
        self.claim_transfer.flush();
    }

    /// Charges measured state growth to the attached deposit and refunds any
    /// excess. State release reduces the vault's reserve and refunds the payer.
    fn settle_storage(
        &mut self,
        owner: &AccountId,
        vault_id: u64,
        payer: AccountId,
        storage_before: u64,
        attached: u128,
    ) {
        self.flush_state();
        let storage_after = env::storage_usage();
        let key = Self::vault_key(owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        let refund = if storage_after >= storage_before {
            let required = Self::storage_cost(storage_after - storage_before);
            assert!(attached >= required, "InsufficientStorage");
            vault.storage_reserved = vault
                .storage_reserved
                .checked_add(required)
                .expect("Overflow");
            attached - required
        } else {
            let released = Self::storage_cost(storage_before - storage_after);
            vault.storage_reserved = vault
                .storage_reserved
                .checked_sub(released)
                .expect("StorageAccountingError");
            attached.checked_add(released).expect("Overflow")
        };
        self.vaults.insert(key, vault);
        self.vaults.flush();
        Self::refund(payer, refund);
    }

    #[payable]
    pub fn create_vault(&mut self, check_in_interval_ns: u64) -> U64 {
        let owner = env::predecessor_account_id();
        assert!(
            check_in_interval_ns >= MIN_CHECK_IN_INTERVAL_NS,
            "InvalidInterval"
        );

        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let now = env::block_timestamp();
        let vault_id = self.next_vault_id.get(&owner).cloned().unwrap_or(0);
        let next_id = vault_id.checked_add(1).expect("Overflow");
        let mut ids = self
            .owner_vault_ids
            .get(&owner)
            .cloned()
            .unwrap_or_default();
        assert!(ids.len() < MAX_VAULTS_PER_OWNER, "TooManyVaults");
        assert!(
            now.checked_add(check_in_interval_ns).is_some(),
            "InvalidInterval"
        );
        assert!(
            check_in_interval_ns.checked_mul(2).is_some(),
            "InvalidInterval"
        );
        let vault = Vault {
            vault_id,
            owner: owner.clone(),
            check_in_interval_ns,
            last_ping_ns: now,
            active: true,
            total_deposited: 0,
            vault_balance: 0,
            beneficiaries: Vec::new(),
            beneficiaries_set: false,
            fallback_account: None,
            inheritance_triggered: false,
            distributable_snapshot: 0,
            pending_count: 0,
            next_transfer_nonce: 0,
            pending_withdrawal_nonce: None,
            pending_fallback_nonce: None,
            storage_reserved: 0,
        };
        let key = Self::vault_key(&owner, vault_id);
        self.vaults.insert(key, vault);
        ids.push(vault_id);
        self.owner_vault_ids.insert(owner.clone(), ids);
        self.next_vault_id.insert(owner.clone(), next_id);
        self.total_vaults = self.total_vaults.checked_add(1).expect("Overflow");
        self.settle_storage(&owner, vault_id, owner.clone(), storage_before, attached);
        U64(vault_id)
    }

    pub fn ping(&mut self, vault_id: u64) {
        let owner = env::predecessor_account_id();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(!vault.inheritance_triggered, "AlreadyTriggered");
        let now = env::block_timestamp();
        assert!(now <= Self::deadline(&vault), "AlreadyTriggered");
        assert!(vault.vault_balance > 0, "ZeroAmount");
        assert!(
            now.checked_add(vault.check_in_interval_ns).is_some(),
            "InvalidInterval"
        );
        vault.last_ping_ns = now;
        self.vaults.insert(key, vault);
    }

    pub fn set_check_in_interval(&mut self, vault_id: u64, check_in_interval_ns: u64) {
        let owner = env::predecessor_account_id();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(vault.pending_count == 0, "TransferPending");
        Self::assert_deadline_open(&vault, env::block_timestamp());
        assert!(!vault.inheritance_triggered, "ConfigLocked");
        assert!(
            check_in_interval_ns >= MIN_CHECK_IN_INTERVAL_NS,
            "InvalidInterval"
        );
        assert!(
            env::block_timestamp()
                .checked_add(check_in_interval_ns)
                .is_some(),
            "InvalidInterval"
        );
        assert!(
            check_in_interval_ns.checked_mul(2).is_some(),
            "InvalidInterval"
        );
        vault.check_in_interval_ns = check_in_interval_ns;
        self.vaults.insert(key, vault);
    }

    #[payable]
    pub fn deposit(&mut self, vault_id: u64) {
        let owner = env::predecessor_account_id();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(!vault.inheritance_triggered, "AlreadyTriggered");
        assert!(
            vault.beneficiaries_set || vault.fallback_account.is_some(),
            "NoBeneficiaryOrFallback"
        );
        let now = env::block_timestamp();
        Self::assert_deadline_open(&vault, now);

        let amount = env::attached_deposit().as_yoctonear();
        assert!(amount > 0, "ZeroAmount");

        // An empty vault has no inheritance funds at risk. Its check-in clock
        // starts when it first becomes funded, rather than becoming unusable
        // merely because configuration took longer than one interval.
        if vault.vault_balance == 0 {
            assert!(
                now.checked_add(vault.check_in_interval_ns).is_some(),
                "InvalidInterval"
            );
            vault.last_ping_ns = now;
        }

        vault.total_deposited = vault.total_deposited.checked_add(amount).expect("Overflow");
        vault.vault_balance = vault.vault_balance.checked_add(amount).expect("Overflow");
        self.vaults.insert(key, vault);
    }

    #[payable]
    pub fn withdraw_all(&mut self, vault_id: u64) {
        let owner = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(vault.pending_count == 0, "TransferPending");
        assert!(vault.pending_withdrawal_nonce.is_none(), "TransferPending");
        assert!(!vault.inheritance_triggered, "AlreadyTriggered");
        let now = env::block_timestamp();
        Self::assert_deadline_open(&vault, now);

        let amount = vault.vault_balance;
        vault.vault_balance = 0;
        vault.active = false;
        if amount == 0 {
            self.vaults.insert(key, vault);
            self.settle_storage(&owner, vault_id, owner.clone(), storage_before, attached);
            return;
        }

        let nonce = vault.next_transfer_nonce;
        vault.next_transfer_nonce = nonce.checked_add(1).expect("Overflow");
        vault.pending_count = vault.pending_count.checked_add(1).expect("Overflow");
        vault.pending_withdrawal_nonce = Some(nonce);
        let transfer_id = Self::transfer_key(&owner, vault_id, nonce);
        self.pending_transfers.insert(
            transfer_id.clone(),
            PendingTransfer {
                owner: owner.clone(),
                vault_id,
                recipient: owner.clone(),
                amount,
                nonce,
                kind: TransferKind::Withdrawal,
            },
        );
        self.vaults.insert(key, vault);
        self.settle_storage(&owner, vault_id, owner.clone(), storage_before, attached);

        let _ = Promise::new(owner.clone())
            .transfer(near_sdk::NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_transfer_callback(owner, vault_id, transfer_id),
            );
    }

    #[payable]
    pub fn set_beneficiaries(&mut self, vault_id: u64, beneficiaries: Vec<(AccountId, u32)>) {
        let owner = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        let now = env::block_timestamp();
        Self::assert_deadline_open(&vault, now);
        assert!(!vault.inheritance_triggered, "ConfigLocked");

        assert!(!beneficiaries.is_empty(), "NoBeneficiaryOrFallback");
        assert!(
            beneficiaries.len() <= MAX_BENEFICIARIES,
            "TooManyBeneficiaries"
        );
        let mut seen = std::collections::HashSet::new();
        let mut total: u32 = 0;
        let mut list: Vec<Beneficiary> = Vec::new();
        for (acc, pct) in beneficiaries {
            assert!(pct > 0 && pct <= 100, "InvalidPercentage");
            assert!(seen.insert(acc.clone()), "DuplicateBeneficiary");
            total = total.checked_add(pct).expect("InvalidTotal");
            assert!(total <= 100, "InvalidTotal");
            list.push(Beneficiary {
                account_id: acc,
                share_percent: pct,
            });
        }
        assert!(total == 100, "InvalidTotal");
        vault.beneficiaries = list;
        vault.beneficiaries_set = true;
        self.vaults.insert(key, vault);
        self.settle_storage(&owner, vault_id, owner.clone(), storage_before, attached);
    }

    #[payable]
    pub fn set_fallback(&mut self, vault_id: u64, fallback_account: Option<AccountId>) {
        let owner = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(vault.pending_count == 0, "TransferPending");
        Self::assert_deadline_open(&vault, env::block_timestamp());
        assert!(!vault.inheritance_triggered, "ConfigLocked");
        assert!(
            fallback_account.is_some() || vault.beneficiaries_set || vault.vault_balance == 0,
            "NoBeneficiaryOrFallback"
        );
        vault.fallback_account = fallback_account;
        self.vaults.insert(key, vault);
        self.settle_storage(&owner, vault_id, owner.clone(), storage_before, attached);
    }

    #[payable]
    pub fn trigger_inheritance(&mut self, owner: AccountId, vault_id: u64) {
        let payer = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        let now = env::block_timestamp();
        assert!(now > Self::deadline(&vault), "NotEligible");
        assert!(vault.beneficiaries_set, "NoBeneficiaryOrFallback");
        assert!(!vault.inheritance_triggered, "AlreadyTriggered");
        assert!(vault.vault_balance > 0, "ZeroAmount");
        vault.inheritance_triggered = true;
        vault.distributable_snapshot = vault.vault_balance;

        // Precompute entitlements
        let mut entitlements: Vec<u128> = vec![0u128; vault.beneficiaries.len()];
        let mut sum: u128 = 0;
        for (i, b) in vault.beneficiaries.iter().enumerate() {
            let amt = Self::percentage_floor(vault.distributable_snapshot, b.share_percent);
            entitlements[i] = amt;
            sum = sum.checked_add(amt).expect("Overflow");
        }
        let remainder = vault
            .distributable_snapshot
            .checked_sub(sum)
            .expect("Overflow");
        if remainder > 0 && !vault.beneficiaries.is_empty() {
            let last_idx = vault.beneficiaries.len() - 1;
            entitlements[last_idx] = entitlements[last_idx]
                .checked_add(remainder)
                .expect("Overflow");
        }
        // verify sum equals snapshot
        let mut check_sum: u128 = 0;
        for &e in entitlements.iter() {
            check_sum = check_sum.checked_add(e).expect("Overflow");
        }
        assert!(check_sum == vault.distributable_snapshot, "AccountingError");

        for (i, b) in vault.beneficiaries.iter().enumerate() {
            let ekey = Self::entitlement_key(&owner, vault_id, &b.account_id);
            self.entitlement.insert(ekey, entitlements[i]);
        }

        self.vaults.insert(key, vault);
        self.settle_storage(&owner, vault_id, payer, storage_before, attached);
    }

    #[payable]
    pub fn claim(&mut self, owner: AccountId, vault_id: u64) {
        let predecessor = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(vault.inheritance_triggered, "NotTriggered");
        assert!(vault.distributable_snapshot > 0, "ZeroAmount");

        assert!(
            vault
                .beneficiaries
                .iter()
                .any(|beneficiary| beneficiary.account_id == predecessor),
            "NotBeneficiary"
        );

        let ckey = Self::claim_key(&owner, vault_id, &predecessor);
        assert!(
            !self.claimed.get(&ckey).cloned().unwrap_or(false),
            "AlreadyClaimed"
        );

        let ekey = Self::entitlement_key(&owner, vault_id, &predecessor);
        let amount = self.entitlement.get(&ekey).cloned().expect("NoEntitlement");
        assert!(vault.vault_balance >= amount, "InsufficientBalance");
        vault.vault_balance = vault.vault_balance.checked_sub(amount).expect("Overflow");
        self.claimed.insert(ckey.clone(), true);
        self.claimed_amount.insert(ckey.clone(), amount);

        // Very small balances can legitimately round an early beneficiary's
        // percentage to zero. Record that claim without creating an invalid
        // zero-value transfer; the final beneficiary still receives all dust.
        if amount == 0 {
            self.vaults.insert(key, vault);
            self.settle_storage(&owner, vault_id, predecessor, storage_before, attached);
            return;
        }

        let nonce = vault.next_transfer_nonce;
        vault.next_transfer_nonce = nonce.checked_add(1).expect("Overflow");
        vault.pending_count = vault.pending_count.checked_add(1).expect("Overflow");
        let transfer_id = Self::transfer_key(&owner, vault_id, nonce);
        self.pending_transfers.insert(
            transfer_id.clone(),
            PendingTransfer {
                owner: owner.clone(),
                vault_id,
                recipient: predecessor.clone(),
                amount,
                nonce,
                kind: TransferKind::Claim,
            },
        );
        self.claim_transfer.insert(ckey, transfer_id.clone());
        self.vaults.insert(key, vault);
        self.settle_storage(
            &owner,
            vault_id,
            predecessor.clone(),
            storage_before,
            attached,
        );

        let _ = Promise::new(predecessor)
            .transfer(near_sdk::NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_transfer_callback(owner.clone(), vault_id, transfer_id),
            );
    }

    #[payable]
    pub fn claim_fallback(&mut self, owner: AccountId, vault_id: u64) {
        let predecessor = env::predecessor_account_id();
        self.flush_state();
        let storage_before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = self.vaults.get(&key).expect("VaultNotFound").clone();
        assert!(vault.active, "NotActive");
        assert!(vault.pending_count == 0, "TransferPending");
        assert!(vault.pending_fallback_nonce.is_none(), "TransferPending");
        assert_eq!(
            vault.fallback_account.as_ref(),
            Some(&predecessor),
            "FallbackNotReady"
        );
        assert!(
            env::block_timestamp() > Self::fallback_deadline(&vault),
            "FallbackNotReady"
        );

        let amount = vault.vault_balance;
        assert!(amount > 0, "ZeroAmount");
        vault.vault_balance = 0;
        vault.active = false;
        if !vault.inheritance_triggered {
            vault.inheritance_triggered = true;
            vault.distributable_snapshot = amount;
        }

        let nonce = vault.next_transfer_nonce;
        vault.next_transfer_nonce = nonce.checked_add(1).expect("Overflow");
        vault.pending_count = vault.pending_count.checked_add(1).expect("Overflow");
        vault.pending_fallback_nonce = Some(nonce);
        let transfer_id = Self::transfer_key(&owner, vault_id, nonce);
        self.pending_transfers.insert(
            transfer_id.clone(),
            PendingTransfer {
                owner: owner.clone(),
                vault_id,
                recipient: predecessor.clone(),
                amount,
                nonce,
                kind: TransferKind::Fallback,
            },
        );
        self.vaults.insert(key, vault);
        self.settle_storage(
            &owner,
            vault_id,
            predecessor.clone(),
            storage_before,
            attached,
        );

        let _ = Promise::new(predecessor)
            .transfer(near_sdk::NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_transfer_callback(owner, vault_id, transfer_id),
            );
    }

    #[private]
    pub fn on_transfer_callback(
        &mut self,
        owner: AccountId,
        vault_id: u64,
        transfer_id: String,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Private"
        );
        // A missing, stale, or mismatched record is an absolute no-op.
        let pending = match self.pending_transfers.get(&transfer_id).cloned() {
            Some(p) => p,
            None => return,
        };
        if pending.owner != owner
            || pending.vault_id != vault_id
            || transfer_id != Self::transfer_key(&pending.owner, pending.vault_id, pending.nonce)
        {
            return;
        }
        let key = Self::vault_key(&owner, vault_id);
        let mut vault = match self.vaults.get(&key).cloned() {
            Some(vault) => vault,
            None => return,
        };

        let claim_key = Self::claim_key(&owner, vault_id, &pending.recipient);
        match pending.kind {
            TransferKind::Claim => {
                if self.claim_transfer.get(&claim_key) != Some(&transfer_id)
                    || !self.claimed.get(&claim_key).cloned().unwrap_or(false)
                    || self.claimed_amount.get(&claim_key).cloned() != Some(pending.amount)
                {
                    return;
                }
            }
            TransferKind::Withdrawal => {
                if pending.recipient != owner
                    || vault.pending_withdrawal_nonce != Some(pending.nonce)
                {
                    return;
                }
            }
            TransferKind::Fallback => {
                if vault.fallback_account.as_ref() != Some(&pending.recipient)
                    || vault.pending_fallback_nonce != Some(pending.nonce)
                {
                    return;
                }
            }
        }

        self.flush_state();
        let storage_before = env::storage_usage();
        if result.is_err() {
            vault.vault_balance = vault
                .vault_balance
                .checked_add(pending.amount)
                .expect("Overflow");
            match pending.kind {
                TransferKind::Claim => {
                    self.claimed.remove(&claim_key);
                    self.claimed_amount.remove(&claim_key);
                    vault.active = true;
                }
                TransferKind::Withdrawal => vault.active = true,
                TransferKind::Fallback => vault.active = true,
            }
        }
        match pending.kind {
            TransferKind::Claim => {
                self.claim_transfer.remove(&claim_key);
            }
            TransferKind::Withdrawal => vault.pending_withdrawal_nonce = None,
            TransferKind::Fallback => vault.pending_fallback_nonce = None,
        }
        self.pending_transfers.remove(&transfer_id);
        vault.pending_count = vault
            .pending_count
            .checked_sub(1)
            .expect("PendingCountUnderflow");
        self.vaults.insert(key, vault);
        self.settle_storage(
            &owner,
            vault_id,
            pending.recipient,
            storage_before,
            env::attached_deposit().as_yoctonear(),
        );
    }

    pub fn has_vault(&self, owner: AccountId, vault_id: u64) -> bool {
        self.vaults.contains_key(&Self::vault_key(&owner, vault_id))
    }

    pub fn vault_balance(&self, owner: AccountId, vault_id: u64) -> U128 {
        self.vaults
            .get(&Self::vault_key(&owner, vault_id))
            .map(|v| U128(v.vault_balance))
            .unwrap_or(U128(0))
    }

    pub fn vault_count(&self) -> u64 {
        self.total_vaults
    }

    pub fn get_vault_ids(&self, owner: AccountId) -> Vec<U64> {
        self.owner_vault_ids
            .get(&owner)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(U64)
            .collect()
    }

    pub fn get_vaults(&self, owner: AccountId) -> Vec<VaultView> {
        self.get_vault_ids(owner.clone())
            .into_iter()
            .filter_map(|vault_id| self.get_vault(owner.clone(), vault_id.0))
            .collect()
    }

    pub fn get_vault(&self, owner: AccountId, vault_id: u64) -> Option<VaultView> {
        self.vaults
            .get(&Self::vault_key(&owner, vault_id))
            .map(|vault| VaultView {
                vault_id: U64(vault.vault_id),
                owner: vault.owner.clone(),
                check_in_interval_ns: U64(vault.check_in_interval_ns),
                last_ping_ns: U64(vault.last_ping_ns),
                deadline_ns: U64(Self::deadline(vault)),
                active: vault.active,
                total_deposited: U128(vault.total_deposited),
                vault_balance: U128(vault.vault_balance),
                beneficiaries_set: vault.beneficiaries_set,
                fallback_account: vault.fallback_account.clone(),
                inheritance_triggered: vault.inheritance_triggered,
                distributable_snapshot: U128(vault.distributable_snapshot),
                pending_count: U64(vault.pending_count),
                next_transfer_nonce: U64(vault.next_transfer_nonce),
                pending_withdrawal: vault.pending_withdrawal_nonce.is_some(),
                pending_fallback: vault.pending_fallback_nonce.is_some(),
                storage_reserved: U128(vault.storage_reserved),
            })
    }

    pub fn get_beneficiaries(&self, owner: AccountId, vault_id: u64) -> Vec<BeneficiaryView> {
        self.vaults
            .get(&Self::vault_key(&owner, vault_id))
            .map(|vault| {
                vault
                    .beneficiaries
                    .iter()
                    .map(|beneficiary| {
                        let claim_key = Self::claim_key(&owner, vault_id, &beneficiary.account_id);
                        BeneficiaryView {
                            account_id: beneficiary.account_id.clone(),
                            share_percent: beneficiary.share_percent,
                            entitlement: U128(
                                self.entitlement
                                    .get(&Self::entitlement_key(
                                        &owner,
                                        vault_id,
                                        &beneficiary.account_id,
                                    ))
                                    .cloned()
                                    .unwrap_or(0),
                            ),
                            claimed: self.claimed.get(&claim_key).cloned().unwrap_or(false),
                            claimed_amount: U128(
                                self.claimed_amount.get(&claim_key).cloned().unwrap_or(0),
                            ),
                            transfer_pending: self.claim_transfer.get(&claim_key).is_some(),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn is_triggered(&self, owner: AccountId, vault_id: u64) -> bool {
        if let Some(v) = self.vaults.get(&Self::vault_key(&owner, vault_id)) {
            v.inheritance_triggered
        } else {
            false
        }
    }

    pub fn is_overdue(&self, owner: AccountId, vault_id: u64) -> bool {
        self.vaults
            .get(&Self::vault_key(&owner, vault_id))
            .map(|vault| {
                vault.active
                    && vault.vault_balance > 0
                    && !vault.inheritance_triggered
                    && env::block_timestamp() > Self::deadline(vault)
            })
            .unwrap_or(false)
    }
}
