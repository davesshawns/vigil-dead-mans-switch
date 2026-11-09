#[cfg(test)]
mod tests {
    use anyhow::{Context, Result};
    use near_workspaces::types::{Gas, NearToken};
    use near_workspaces::{Account, Contract};
    use serde_json::{json, Value};
    use std::path::PathBuf;

    const INTERVAL_NS: u64 = 60_000_000_000;
    const STORAGE: NearToken = NearToken::from_near(1);
    const MAX_GAS: Gas = Gas::from_tgas(300);

    fn artifact(relative: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative)
    }

    async fn create_native_vault(
        owner: &Account,
        vigil: &Contract,
        beneficiary: &Account,
    ) -> Result<u64> {
        let outcome = owner
            .call(vigil.id(), "create_vault")
            .args_json(json!({ "check_in_interval_ns": INTERVAL_NS }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        let vault_id: String = outcome.json()?;
        owner
            .call(vigil.id(), "set_beneficiaries")
            .args_json(json!({ "vault_id": vault_id.parse::<u64>()?, "beneficiaries": [[beneficiary.id(), 100]] }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        Ok(vault_id.parse()?)
    }

    async fn vault(vigil: &Contract, owner: &Account, vault_id: u64) -> Result<Value> {
        Ok(vigil
            .view("get_vault")
            .args_json(json!({ "owner": owner.id(), "vault_id": vault_id }))
            .await?
            .json()?)
    }

    #[tokio::test]
    async fn native_multi_user_multi_vault_lifecycle() -> Result<()> {
        let worker = near_workspaces::sandbox().await?;
        let vigil_wasm = std::fs::read(artifact(
            "../target/wasm32-unknown-unknown/release/vigil_near.wasm",
        ))
        .context("build Vigil WASM before running sandbox tests")?;
        let vigil = worker.dev_deploy(&vigil_wasm).await?;
        vigil
            .call("new")
            .args_json(json!({ "allowed_tokens": null }))
            .transact()
            .await?
            .into_result()?;

        let alice = worker.dev_create_account().await?;
        let bob = worker.dev_create_account().await?;
        let carol = worker.dev_create_account().await?;
        let mallory = worker.dev_create_account().await?;
        let keeper = worker.dev_create_account().await?;

        let alice_first = create_native_vault(&alice, &vigil, &bob).await?;
        let alice_second = create_native_vault(&alice, &vigil, &carol).await?;
        let bob_vault = create_native_vault(&bob, &vigil, &carol).await?;
        assert_eq!((alice_first, alice_second, bob_vault), (0, 1, 0));

        let unauthorized = mallory
            .call(vigil.id(), "set_beneficiaries")
            .args_json(json!({ "vault_id": alice_first, "beneficiaries": [[mallory.id(), 100]] }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?;
        assert!(unauthorized.is_failure());

        alice
            .call(vigil.id(), "deposit")
            .args_json(json!({ "vault_id": alice_first }))
            .deposit(NearToken::from_near(4))
            .transact()
            .await?
            .into_result()?;
        alice
            .call(vigil.id(), "deposit")
            .args_json(json!({ "vault_id": alice_second }))
            .deposit(NearToken::from_near(2))
            .transact()
            .await?
            .into_result()?;
        bob.call(vigil.id(), "deposit")
            .args_json(json!({ "vault_id": bob_vault }))
            .deposit(NearToken::from_near(3))
            .transact()
            .await?
            .into_result()?;

        alice.call(vigil.id(), "set_allowance")
            .args_json(json!({ "vault_id": alice_second, "amount": NearToken::from_millinear(100).as_yoctonear().to_string(), "period_ns": INTERVAL_NS.to_string() }))
            .deposit(STORAGE).gas(MAX_GAS).transact().await?.into_result()?;
        alice
            .call(vigil.id(), "trigger_allowance")
            .args_json(json!({ "vault_id": alice_second, "beneficiary": carol.id() }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        alice
            .call(vigil.id(), "withdraw_all")
            .args_json(json!({ "vault_id": alice_second }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;

        worker.fast_forward(1_000).await?;
        keeper
            .call(vigil.id(), "trigger_inheritance")
            .args_json(json!({ "owner": alice.id(), "vault_id": alice_first }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        bob.call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": alice_first }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(
            vault(&vigil, &alice, alice_first).await?["vault_balance"],
            "0"
        );
        assert!(!vault(&vigil, &alice, alice_second).await?["active"]
            .as_bool()
            .unwrap());
        assert!(vault(&vigil, &bob, bob_vault).await?["active"]
            .as_bool()
            .unwrap());
        Ok(())
    }

    #[tokio::test]
    async fn native_concurrent_claims_and_private_callback_guard() -> Result<()> {
        let worker = near_workspaces::sandbox().await?;
        let vigil_wasm = std::fs::read(artifact(
            "../target/wasm32-unknown-unknown/release/vigil_near.wasm",
        ))?;
        let vigil = worker.dev_deploy(&vigil_wasm).await?;
        vigil
            .call("new")
            .args_json(json!({ "allowed_tokens": null }))
            .transact()
            .await?
            .into_result()?;

        let alice = worker.dev_create_account().await?;
        let bob = worker.dev_create_account().await?;
        let carol = worker.dev_create_account().await?;
        let mallory = worker.dev_create_account().await?;
        let keeper = worker.dev_create_account().await?;

        let outcome = alice
            .call(vigil.id(), "create_vault")
            .args_json(json!({ "check_in_interval_ns": INTERVAL_NS }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        let vault_id: String = outcome.json()?;
        let vault_id: u64 = vault_id.parse()?;
        alice
            .call(vigil.id(), "set_beneficiaries")
            .args_json(json!({
                "vault_id": vault_id,
                "beneficiaries": [[bob.id(), 50], [carol.id(), 50]]
            }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        alice
            .call(vigil.id(), "deposit")
            .args_json(json!({ "vault_id": vault_id }))
            .deposit(NearToken::from_near(4))
            .transact()
            .await?
            .into_result()?;

        let unauthorized_ping = mallory
            .call(vigil.id(), "ping")
            .args_json(json!({ "vault_id": vault_id }))
            .transact()
            .await?;
        assert!(unauthorized_ping.is_failure());

        worker.fast_forward(1_000).await?;
        keeper
            .call(vigil.id(), "trigger_inheritance")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;

        let bob_claim = bob
            .call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact();
        let carol_claim = carol
            .call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact();
        let (bob_result, carol_result) = tokio::join!(bob_claim, carol_claim);
        bob_result?.into_result()?;
        carol_result?.into_result()?;

        let final_vault = vault(&vigil, &alice, vault_id).await?;
        assert_eq!(final_vault["vault_balance"], "0");
        assert_eq!(final_vault["pending_count"], "0");

        let forged_callback = mallory
            .call(vigil.id(), "on_transfer_callback")
            .args_json(json!({
                "owner": alice.id(),
                "vault_id": vault_id,
                "transfer_id": format!("{}:{vault_id}:0", alice.id())
            }))
            .gas(MAX_GAS)
            .transact()
            .await?;
        assert!(forged_callback.is_failure());
        assert_eq!(vault(&vigil, &alice, vault_id).await?, final_vault);
        Ok(())
    }

    #[tokio::test]
    async fn ft_deposit_failed_callback_restoration_retry_and_allowance() -> Result<()> {
        let worker = near_workspaces::sandbox().await?;
        let vigil_wasm = std::fs::read(artifact(
            "../target/wasm32-unknown-unknown/release/vigil_near.wasm",
        ))?;
        let ft_wasm = std::fs::read(artifact(
            "../mock-ft/target/wasm32-unknown-unknown/release/vigil_mock_ft.wasm",
        ))
        .context("build mock FT WASM before running sandbox tests")?;
        let vigil = worker.dev_deploy(&vigil_wasm).await?;
        let ft = worker.dev_deploy(&ft_wasm).await?;
        let alice = worker.dev_create_account().await?;
        let bob = worker.dev_create_account().await?;
        let carol = worker.dev_create_account().await?;
        let keeper = worker.dev_create_account().await?;

        ft.call("new")
            .args_json(json!({ "owner_id": alice.id(), "total_supply": "1000000000" }))
            .transact()
            .await?
            .into_result()?;
        vigil
            .call("new")
            .args_json(json!({ "allowed_tokens": [ft.id()] }))
            .transact()
            .await?
            .into_result()?;
        ft.call("storage_deposit")
            .args_json(json!({ "account_id": vigil.id(), "registration_only": true }))
            .deposit(NearToken::from_near(1))
            .transact()
            .await?
            .into_result()?;

        let outcome = alice
            .call(vigil.id(), "create_ft_vault")
            .args_json(json!({ "check_in_interval_ns": INTERVAL_NS, "token_contract": ft.id() }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        let vault_id: String = outcome.json()?;
        let vault_id: u64 = vault_id.parse()?;
        alice
            .call(vigil.id(), "set_beneficiaries")
            .args_json(json!({
                "vault_id": vault_id,
                "beneficiaries": [[bob.id(), 50], [carol.id(), 50]]
            }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        alice.call(ft.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": vigil.id(), "amount": "500000000", "memo": null, "msg": format!(r#"{{"vault_id":"{vault_id}"}}"#) }))
            .deposit(NearToken::from_yoctonear(1)).gas(MAX_GAS).transact().await?.into_result()?;
        assert_eq!(
            vault(&vigil, &alice, vault_id).await?["vault_balance"],
            "500000000"
        );

        alice.call(vigil.id(), "set_allowance")
            .args_json(json!({ "vault_id": vault_id, "amount": "1000000", "period_ns": INTERVAL_NS.to_string() }))
            .deposit(STORAGE).gas(MAX_GAS).transact().await?.into_result()?;
        alice
            .call(vigil.id(), "trigger_allowance")
            .args_json(json!({ "vault_id": vault_id, "beneficiary": bob.id() }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(
            vault(&vigil, &alice, vault_id).await?["vault_balance"],
            "500000000"
        );

        ft.call("storage_deposit")
            .args_json(json!({ "account_id": bob.id(), "registration_only": true }))
            .deposit(NearToken::from_near(1))
            .transact()
            .await?
            .into_result()?;
        alice
            .call(vigil.id(), "trigger_allowance")
            .args_json(json!({ "vault_id": vault_id, "beneficiary": bob.id() }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(
            vault(&vigil, &alice, vault_id).await?["vault_balance"],
            "499000000"
        );

        worker.fast_forward(1_000).await?;
        keeper
            .call(vigil.id(), "trigger_inheritance")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;

        carol
            .call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(
            vault(&vigil, &alice, vault_id).await?["vault_balance"],
            "499000000"
        );

        ft.call("storage_deposit")
            .args_json(json!({ "account_id": carol.id(), "registration_only": true }))
            .deposit(NearToken::from_near(1))
            .transact()
            .await?
            .into_result()?;
        carol
            .call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(
            vault(&vigil, &alice, vault_id).await?["vault_balance"],
            "249500000"
        );
        bob.call(vigil.id(), "claim")
            .args_json(json!({ "owner": alice.id(), "vault_id": vault_id }))
            .deposit(STORAGE)
            .gas(MAX_GAS)
            .transact()
            .await?
            .into_result()?;
        assert_eq!(vault(&vigil, &alice, vault_id).await?["vault_balance"], "0");
        Ok(())
    }
}
