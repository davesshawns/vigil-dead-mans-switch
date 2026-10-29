# Vigil — USDC Dead Man's Switch

> Built with Arc Studio — money-powered apps in minutes

Project memory for the Vigil vault app.

---

## What This App Does

Vigil is a multi-vault USDC dead man's switch registry on Arc. Any wallet creates one personal vault, deposits USDC, assigns beneficiaries with percentage shares, and must check in periodically. If the owner misses their check-in window, the vault triggers and beneficiaries can claim their shares. An optional living allowance drips USDC to beneficiaries on a schedule while the owner is still active. A fallback wallet can sweep unclaimed residual after twice the interval.

---

## Deployed Contracts

### Testnet (Arc Testnet, chain ID 5042002)

| Version | Address | Notes |
|---|---|---|
| VaultRegistry v1 (testnet) | `0xd94877562ee9e4be3cabfa21eade92372df28e6c` | No allowlist (pre-audit) |
| VaultRegistry v2 (testnet, production-ready) | *deploy pending — see mainnet section* | Has token allowlist, dust-sweep fix |

### Mainnet (Arc Mainnet, chain ID 5042)

**Status: Not yet deployed by user.**

Run this from your local machine to deploy to Arc Mainnet:

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY

forge create contracts/VaultRegistry.sol:VaultRegistry \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args \
    "0xYOUR_WALLET_ADDRESS" \
    "[0x3600000000000000000000000000000000000000]"
```

- First arg: your wallet address becomes the contract owner (can add/remove tokens from allowlist).
- Second arg: `[0x3600000000000000000000000000000000000000]` is Arc Mainnet USDC.
- Once deployed, paste the contract address here and update `src/contract.ts`.

---

## Token Addresses

| Token | Arc Testnet | Arc Mainnet |
|---|---|---|
| USDC | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |

---

## Contract: VaultRegistry

Source: `contracts/VaultRegistry.sol`

### Key design decisions

- **One vault per address.** `createVault()` reverts with `VaultAlreadyExists` if you call it twice.
- **Token allowlist.** Only tokens registered by the contract owner can be used. Prevents rebasing/fee tokens. Default allowlist: USDC.
- **Rounding dust sweep.** The last beneficiary to claim receives the full remaining `vaultBalance`, not just their basis-point share. This ensures no funds are stranded.
- **Living allowance.** `allowanceAmount` per beneficiary is released every `allowancePeriod` seconds. Only works while the vault is not triggered (`releaseAllowance` reverts if `triggered(owner) == true`).
- **Two-step deposit.** Owner must approve USDC to the registry, then call `deposit()`. Both steps shown in the UI.
- **Custom errors.** `AlreadyTriggered`, `ConfigLocked`, `NoBeneficiaryOrFallback`, `DuplicateBeneficiary`, `TokenNotAllowed`, `AllowanceNotDue`, `AllowanceTooLarge`, etc.

### Test results (last run)

87/87 forge tests pass. Two security audit passes (max severity): all findings fixed.

---

## Frontend

- **App title:** Vigil — Your USDC Dead Man's Switch
- **Design:** Arc Dark mode, glass cards, framer-motion fade+slide transitions, spectral strip accents
- **Tabs:** My Vault (owner dashboard) / Claim (beneficiary view) / Explore (registry stats)
- **`src/contract.ts`:** Update `VAULT_REGISTRY.address` after mainnet deploy

---

## Previous Contracts (stale — do not use)

- DeadManSwitch v1: `0xafa99cec60f38336b8dfeab47fd806a4ed90408b`
- DeadManSwitch v2: `0xecee00d40294cbb6bb1bbe608bd2aab16ae57da3`
- DeadManSwitch v3: `0xc15483beb3cc57aea7d222245ef2fee16523408e`
- DeadManSwitch v4: `0x2150b72c591f707055a9b0c05d6f74472523e22b`
