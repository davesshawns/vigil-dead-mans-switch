# Vigil Testnet deployment report

Date: 2026-11-06

## Result

Deployment and initialization succeeded. No access key was changed or deleted. No funding, deposit, vault creation, token registration, transfer, or immutable-lock operation was performed.

## Authorized deployment

- Network: NEAR Testnet
- Contract account and signer: `vigilvault.vigilowner.testnet`
- Transaction: `DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY`
- Explorer: <https://explorer.testnet.near.org/transactions/DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY>
- Signed public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Initializer: `{"allowed_tokens":[]}`
- Initializer SHA-256: `2cfaeb5bf24be544cb9c37ae9ece8cbc595786a160cc9e99b1af190b16f870d4`

The transaction contained exactly two actions: deploy the reviewed WASM and call `new` with the approved empty allowlist, 30 Tgas, and zero attached deposit.

## Transaction and receipt verification

- Final execution status: `Final`
- Overall status: `SuccessValue`
- Transaction outcome: `SuccessReceiptId(HqMpbzSCWM5vmGJGFDbNBLcdYoJXnnkf65FSeh4eGnj2)`
- Deploy/initialize receipt `HqMpbzSCWM5vmGJGFDbNBLcdYoJXnnkf65FSeh4eGnj2`: `SuccessValue`
- Final refund receipt `BJSwM8FqRDqDywqS1cku9qUMz7tKQYb5SDdoYXAFQUop`: `SuccessValue`
- Deployment execution block: `276534759` (`4oz4Dg3YFcAuTDmNWvXKJLFJmBsSZG5yWYD8QXGTSJbd`)
- Final receipt block: `276534760` (`6ZwYL2Le4EN6qGwffM2nqak8mnCSFfaUhocXEzCnrdpW`)
- Gas reported by the deployment command: 2.6 Tgas
- Transaction fee reported by the deployment command: 0.0002525067067135 NEAR

## Independent post-deployment verification

- Deployed WASM SHA-256: `4c3b6c373990050289dbee122497844519bc8ddeedb4802ec48171ed8e5862a8`
- Deployed WASM size: 298281 bytes
- Local/deployed bytes: identical
- NEAR code hash: `68aYFTx4nHjHRQMCco2b3miZnWUH21MyerHrUkRoMjoM`
- `get_allowed_tokens`: `[]`
- `vault_count`: `0`
- `get_vaults({owner: vigilvault.vigilowner.testnet})`: `[]`
- `get_vault({owner: vigilvault.vigilowner.testnet, vault_id: 0})`: `null`
- `get_beneficiaries({owner: vigilvault.vigilowner.testnet, vault_id: 0})`: `[]`
- Access keys: one FullAccess key, zero function-call keys
- Remaining public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Post-verification account query block: `276539876`
- Post-verification balance: `3997663397051245000000000` yoctoNEAR
- Post-verification storage usage: 298586 bytes

## Warning and next authorization boundary

The contract is deployed and initialized but is not ready for user funds while the FullAccess key remains. The immutable-lock dry run and permanent key deletion were explicitly outside this authorization and were not executed. Any key deletion requires a separate explicit approval.

---

## Addendum — authorized code-only upgrade (2026-11-09)

The original deployment (tx `DR1Jxud8tVdkR1TsCVYczfNB8Fhmx17oyjMByj5cU6BY`, artifact `4c3b6c37…`, 298,281 bytes, code hash `68aYF…MjoM`) has been replaced by the reviewed fixed candidate via a separately authorized code-only upgrade. No initialization, state migration, fund transfer, or key change occurred.

### Executed transaction

- Transaction: `6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP`
- Explorer: <https://explorer.testnet.near.org/transactions/6g6jk3AYZJg3CHFCTpMHrAJf98ppxQUUCoAXnGBdmskP>
- Signer and receiver: `vigilvault.vigilowner.testnet`
- Signed public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Actions: exactly one `DeployContract` containing the reviewed candidate bytes
- No `FunctionCall`, initializer, transfer, `AddKey`, `DeleteKey`, stake, or `DeleteAccount` action
- Final execution status: `Final`; root and every receipt status: `SuccessValue`
- Gas burned: 2.4 Tgas; transaction fee: 0.0002346494790566 NEAR

### Independent post-upgrade verification

- Deployed WASM SHA-256: `7d18627d0bc42856e5c7a69de4f87d3b94e9bd4b493ab9b026b6e1d2ed430c15`
- Deployed WASM size: 301,434 bytes
- NEAR code hash: `9RKXdqL7421XcoXDA2Qqm3wg2uH1ryMCXTitmjbuP1xp`
- `get_allowed_tokens`: `[]`
- `vault_count`: `0`
- `get_vaults({owner: vigilvault.vigilowner.testnet})`: `[]`
- `get_vault({owner: vigilvault.vigilowner.testnet, vault_id: 0})`: `null`
- `get_beneficiaries({owner: vigilvault.vigilowner.testnet, vault_id: 0})`: `[]`
- Raw state entries: 1
- Raw state SHA-256: `5866ce289ed8d4cf6b12b7d7d3423d743ae778d977d2c2723525def39e730239` (unchanged from before the upgrade)
- Balance: `3995453016967018800000000` yoctoNEAR (reconciled: `3997663397051245000000000` − tokens_burnt `1975730605169600000000` − fee `234649479056600000000`)
- Storage usage: 301,739 bytes (increased by exactly 3,153 bytes, the candidate/current code-size difference)
- Locked balance: 0
- Access keys: one FullAccess key, zero function-call keys
- Remaining public key: `ed25519:7CVK9NUd43LfB1mKfVaSM8sud5qAU5DMwbc5K2ca7Fje`
- Access-key nonce: `276434877000002` (incremented by exactly 1, the expected effect of signing the upgrade)

The unchanged raw-state hash proves that no initializer or state-writing method ran as part of the upgrade. The fallback callback-restoration defect is now fixed in the deployed artifact.

### Remaining custody boundary

One FullAccess key remains. The immutable-lock dry run (`contract/scripts/lock_immutable_testnet.sh`) passes against the upgraded account, but permanent key deletion was **not** executed and requires a separate explicit approval. Do not accept user funds until zero access keys are independently verified.
