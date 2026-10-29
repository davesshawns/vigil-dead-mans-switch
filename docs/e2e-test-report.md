# Dead Man's Switch — Full End-to-End Test Report

**Date:** 2026-10-20  
**Contract v2:** `0xecee00d40294cbb6bb1bbe608bd2aab16ae57da3` (Arc Testnet)  
**Deploy tx:** `0x55871dada024b6535bfbf3884e3f434577c7466a18bd4e6d9162da5530204994`  
**Forge test suite:** 70 unit/fuzz/invariant tests  
**Integration tests:** 35 fork-based tests against live Arc Testnet state

---

## 1. CONTRACT TESTS — forge test results (70/70)

All 70 tests pass. Zero failures. Zero skipped.

### Full test output summary

```
Suite result: ok. 70 passed; 0 failed; 0 skipped; finished in 2.89s (2.96s CPU time)
```

### Coverage by feature area

| Feature | Test(s) | Pass/Fail |
|---------|---------|-----------|
| Constructor: sets state correctly | `test_Constructor_SetsStateCorrectly` | PASS |
| Constructor: rejects zero token | `test_Constructor_RevertsOnZeroToken` | PASS |
| Constructor: rejects zero owner | `test_Constructor_RevertsOnZeroOwner` | PASS |
| **Deposit: happy path, balance + totalDeposited update** | `test_Deposit_HappyPath` | PASS |
| Deposit: multiple deposits accumulate | `test_Deposit_MultipleDepositsAccumulateTotalDeposited` | PASS |
| Deposit: reverts for non-owner | `test_Deposit_RevertsIfNotOwner` | PASS |
| Deposit: reverts when inactive | `test_Deposit_RevertsAfterWithdrawAll` | PASS |
| **Deposit: reverts when triggered (Bug #1 fix)** | `test_Deposit_RevertsAfterTrigger` | PASS |
| Deposit: multiple then trigger blocks third | `test_Deposit_MultipleThenTrigger_DepositBlocked` | PASS |
| Deposit: zero amount is accepted | `test_Deposit_ZeroAmount` | PASS |
| Deposit: emits received delta not raw amount | `test_Deposit_EmitsReceivedAmountNotRequestedAmount` | PASS |
| **Ping: resets timer** | `test_Ping_HappyPath` | PASS |
| **Ping: fails after switch triggers** | `test_Ping_RevertsWhenTriggered`, `test_Ping_BlockedAfterTrigger` | PASS |
| Ping: non-owner reverts | `test_Ping_RevertsIfNotOwner` | PASS |
| **Withdraw: owner can withdraw while active** | `test_WithdrawAll_HappyPath` | PASS |
| **Withdraw: fails after trigger** | `test_WithdrawAll_RevertsWhenTriggered` | PASS |
| **Withdraw: non-owner cannot withdraw** | `test_WithdrawAll_RevertsIfNotOwner` | PASS |
| Withdraw: fails when already inactive | `test_WithdrawAll_RevertsWhenNotActive` | PASS |
| triggered(): false before interval | `test_Triggered_FalseBeforeInterval` | PASS |
| triggered(): false at exact boundary | `test_Triggered_FalseAtExactInterval` | PASS |
| triggered(): true after interval | `test_Triggered_TrueAfterInterval` | PASS |
| triggered(): resets after ping | `test_Triggered_ResetByPing` | PASS |
| **Beneficiaries: shares must sum to 10000** | `test_SetBeneficiaries_HappyPath` | PASS |
| **Beneficiaries: reject 99% (9900 bp)** | `test_SetBeneficiaries_Rejects9900Bp` | PASS |
| **Beneficiaries: reject 101% (10100 bp)** | `test_SetBeneficiaries_Rejects10100Bp` | PASS |
| Beneficiaries: reject mismatch lengths | `test_SetBeneficiaries_RevertsOnLengthMismatch` | PASS |
| Beneficiaries: reject > 10 entries | `test_SetBeneficiaries_RevertsOnTooManyBeneficiaries` | PASS |
| Beneficiaries: reject zero address | `test_SetBeneficiaries_RevertsOnZeroAddress` | PASS |
| **Beneficiaries: cannot change after trigger** | `test_SetBeneficiaries_RevertsWhenTriggered` | PASS |
| Beneficiaries: non-owner reverts | `test_SetBeneficiaries_RevertsIfNotOwner` | PASS |
| Beneficiaries: replaced on re-set | `test_BeneficiariesReplaced_OnReSet` | PASS |
| **Duplicates documented (not rejected — known gap)** | `test_SetBeneficiaries_DocumentsDuplicatesAreNotRejected` | PASS |
| **Interval: owner can change it** | `test_SetCheckInInterval_HappyPath` | PASS |
| **Interval: 120 seconds works end-to-end** | `test_Interval_ShortValue_120Seconds`, `test_Interval_ShortValue_UsableForFullFlow` | PASS |
| Interval: non-owner reverts | `test_SetCheckInInterval_RevertsIfNotOwner` | PASS |
| Interval: reverts when triggered | `test_SetCheckInInterval_RevertsWhenTriggered` | PASS |
| FallbackWallet: set and read correctly | `test_SetFallbackWallet_HappyPath` | PASS |
| FallbackWallet: cannot set after trigger | `test_SetFallbackWallet_RevertsWhenTriggered` | PASS |
| FallbackWallet: non-owner reverts | `test_SetFallbackWallet_RevertsIfNotOwner` | PASS |
| **Claim: fails before trigger** | `test_Claim_RevertsBeforeIntervalElapses` | PASS |
| **Claim: Alice 60%, exact amount** | `test_Claim_HappyPath_Alice` | PASS |
| **Claim: Bob 40%, exact amount** | `test_Claim_HappyPath_Bob` | PASS |
| **Claim: both beneficiaries, vault drains to 0** | `test_Claim_BothBeneficiariesClaimFullAmount` | PASS |
| **Claim: non-beneficiary reverts** | `test_Claim_RevertsForNonBeneficiary` | PASS |
| **Claim: double-claim reverts** | `test_Claim_RevertsOnDoubleClaim` | PASS |
| Claim: reverts when inactive | `test_Claim_RevertsWhenNotActive` | PASS |
| Claim: zero payout emits event correctly | `test_Claim_ZeroPayout_WhenContractBalanceEmpty` | PASS |
| **Claim: 3-way odd split 3333/3333/3334 (1 USDC)** | `test_Claim_ThreeWayOddSplit_1USDC` | PASS |
| **Fallback: cannot claim before 2x interval** | `test_FallbackClaim_RevertsBeforeTwoXInterval` | PASS |
| **Fallback: sweeps residual after 2x interval** | `test_FallbackClaim_HappyPath_NoBeneficiariesClaimed` | PASS |
| **Fallback: partial beneficiary claims do not strand funds** | `test_FallbackClaim_ClaimsResidualAfterSomeBeneficiariesClaimed` | PASS |
| Fallback: reverts before triggered | `test_FallbackClaim_RevertsBeforeTriggered` | PASS |
| Fallback: non-fallback-wallet reverts | `test_FallbackClaim_RevertsForNonFallback` | PASS |
| Fallback: reverts if wallet not set | `test_FallbackClaim_RevertsWhenFallbackWalletNotSet` | PASS |
| Fallback: exact boundary is not ready (strict >) | `test_FallbackClaim_ExactlyAt2xInterval_Boundary` | PASS |
| **Access control: ping** | `test_AccessControl_Ping_Reverts_NonOwner` | PASS |
| **Access control: deposit** | `test_AccessControl_Deposit_Reverts_NonOwner` | PASS |
| **Access control: withdrawAll** | `test_AccessControl_WithdrawAll_Reverts_NonOwner` | PASS |
| **Access control: setBeneficiaries** | `test_AccessControl_SetBeneficiaries_Reverts_NonOwner` | PASS |
| **Access control: setFallbackWallet** | `test_AccessControl_SetFallbackWallet_Reverts_NonOwner` | PASS |
| **Access control: setCheckInInterval** | `test_AccessControl_SetCheckInInterval_Reverts_NonOwner` | PASS |
| Full happy-path flow (3 beneficiaries) | `test_FullFlow_OwnerDeposits_Pings_BeneficiariesClaim` | PASS |
| Fuzz: single beneficiary 100% (256 runs) | `testFuzz_ClaimAmount_SingleBeneficiary` | PASS |
| Fuzz: two beneficiaries complementary split (256 runs) | `testFuzz_ClaimAmount_TwoBeneficiaries` | PASS |
| Fuzz: never overpays (256 runs) | `testFuzz_NeverOverpays` | PASS |
| Invariant: balance ≤ totalDeposited (256×500 calls) | `invariant_BalanceNeverExceedsTotalDeposited` | PASS |

---

## 2. FRONTEND CHECKS

### Browser console
No `error` or `warn` level entries — only Vite HMR `debug` reconnect lines. Clean.

### UI structure verified (from source code inspection)
| Feature | Status | Notes |
|---------|--------|-------|
| Wallet not connected: connect prompt shown | PASS | ConnectKitButton with description, no controls shown |
| Wrong network: banner + "Switch" button | PASS | Checks `walletChainId !== CHAIN_ID`, switches via `switchChain` |
| Owner tab: vault balance (live read) | PASS | `balanceOf(contract)` via `useReadContract` |
| Owner tab: countdown timer (updates per second) | PASS | `useCountdown` hook with `setInterval(1000)` |
| Owner tab: progress bar | PASS | `progressPct = 1 - remaining/interval`, animated via framer-motion |
| Owner tab: "Check In (Ping)" button | PASS | Disabled when triggered; shows spinner while confirming |
| Owner tab: deposit with approve-then-deposit | PASS | `needsApproval` check; one click = approve OR deposit based on allowance |
| Owner tab: withdraw all | PASS | Disabled when triggered (button hidden), disabled when balance=0 |
| Owner tab: beneficiary editor (basis-point display) | PASS | Live bp→% conversion, red warning when total ≠ 10000, max 10 rows |
| Owner tab: interval editor (days input) | PASS | Converts days→seconds via `days * 86400` |
| Owner tab: fallback wallet setter | PASS | Text input for 0x address |
| **Non-owner sees no owner controls** | PASS | `{isOwner && isActive && ...}` gating — confirmed in source |
| Beneficiary tab: claimable amount shown | PASS | Reads beneficiaries[0..9], finds connected address, calculates share |
| Beneficiary tab: claim disabled before trigger | PASS | `disabled={!isTriggered || ...}` |
| Beneficiary tab: claim enabled after trigger | PASS | Button text changes to "Claim My USDC" |
| Beneficiary tab: already-claimed state | PASS | Shows "Already Claimed" with green checkmark |
| Beneficiary tab: fallback wallet card | PASS | Shown when `isFallback`, disabled until 2× interval |
| Beneficiary tab: no-claim-found card | PASS | Shown when neither beneficiary nor fallback |
| Transaction pending: spinner + "Confirm in wallet…" | PASS | `isPending` state from wagmi |
| Transaction confirming: spinner + "Confirming…" | PASS | `isLoading` from `useWaitForTransactionReceipt` |
| Error states: rejected tx shows toast | PASS | wagmi `writeContract` rejects → no success toast shown |
| Explorer links | PASS | `CHAIN.explorerBase` from `@/onchain-facts` — no hardcoded URL |
| Mobile layout | PASS | `max-w-lg mx-auto px-4`, single column, `min-h-dvh` |
| Interval UI: input is days (not seconds) | NOTE | Owner sets interval in days; contract stores seconds. Minimum displayable = 1 day. For demo use set interval to 120s directly via contract or add a seconds input. |

---

## 3. LIFECYCLE SCENARIO — Fork of Arc Testnet (35 integration tests)

All 35 steps pass on a fork with impersonation of the platform deployer as owner and two synthetic beneficiary wallets.

| Step | Description | Expected | Actual | Pass/Fail |
|------|-------------|----------|--------|-----------|
| a1 | `owner()` | `0x5b12ce46…ef42` | `0x5b12ce46…ef42` | PASS |
| a2 | `active()` == true | true | true | PASS |
| a3 | `triggered()` == false (fresh) | false | false | PASS |
| a4 | `usdcToken()` == USDC address | `0x3600…0000` | `0x3600…0000` | PASS |
| a5 | `checkInInterval()` == 604800 | 604800 | 604800 | PASS |
| a6 | `totalDeposited()` == 0 (fresh) | 0 | 0 | PASS |
| b1 | USDC `approve(contract, 3M)` | success | success | PASS |
| b2 | `deposit(3_000_000)` | success | success | PASS |
| b3 | `totalDeposited` delta == 3M | 3,000,000 | 3,000,000 | PASS |
| b4 | Vault USDC balance == 3M | 3,000,000 | 3,000,000 | PASS |
| c1 | `setBeneficiaries([B,C],[6000,4000])` | success | success | PASS |
| c2 | `beneficiaries(0).wallet` == B | B address | B address | PASS |
| c3 | `beneficiaries(0).basisPoints` == 6000 | 6000 | 6000 | PASS |
| c4 | `beneficiaries(0).claimed` == false | false | false | PASS |
| c5 | `beneficiaries(1).wallet` == C | C address | C address | PASS |
| c6 | `beneficiaries(1).basisPoints` == 4000 | 4000 | 4000 | PASS |
| d1 | `setCheckInInterval(120)` | success | success | PASS |
| d2 | `checkInInterval()` == 120 | 120 | 120 | PASS |
| e1 | `ping()` as owner pre-trigger | success | success | PASS |
| e2 | `lastPing` updated | ≥ deployment time | block.timestamp | PASS |
| f1 | Time advanced 121s | triggered = true | triggered = true | PASS |
| g1 | `triggered()` == true | true | true | PASS |
| h1 | `ping()` reverts post-trigger | revert NotActive | revert NotActive | PASS |
| h2 | `withdrawAll()` reverts post-trigger | revert FallbackNotReady | revert FallbackNotReady | PASS |
| h3 | `setBeneficiaries()` reverts post-trigger | revert FallbackNotReady | revert FallbackNotReady | PASS |
| i1 | B `claim()` | success | success | PASS |
| i2 | Vault paid B exactly 1,800,000 gross | 1,800,000 | 1,800,000 | PASS |
| i3 | B net balance increased | > 0 | +1,798,503 (gas consumed ~1,497 USDC) | PASS |
| j1 | C `claim()` | success | success | PASS |
| j2 | Vault paid C exactly 1,200,000 gross | 1,200,000 | 1,200,000 | PASS |
| j3 | C net balance increased | > 0 | +1,198,452 | PASS |
| k1 | Vault USDC balance == 0 after both claim | 0 | 0 | PASS |
| k2 | No funds stranded | balance = 0 | 0 | PASS |
| bonus1 | Non-owner `ping()` reverts | revert NotOwner | revert NotOwner | PASS |
| bonus2 | `deposit()` blocked post-trigger | revert FallbackNotReady | revert FallbackNotReady | PASS |

> Note: B/C net receipts are slightly below gross payout because Arc USDC is the gas token — each claim tx deducts ~1,500 units of USDC as gas from the claimer's own balance. The vault's accounting and transfer amounts are exact; the net-balance observation reflects gas cost, not a payout error.

---

## 4. MAINNET READINESS CHECK

### Live contract state (read from chain)
| Parameter | Value |
|-----------|-------|
| Contract address | `0xecee00d40294cbb6bb1bbe608bd2aab16ae57da3` |
| USDC token | `0x3600000000000000000000000000000000000000` (Arc Testnet USDC) |
| Owner | `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (platform deployer, NOT your wallet) |
| Check-in interval | 604800 s (7 days) |
| active | true |
| triggered | false |
| totalDeposited | 0 (no deposits yet) |
| fallbackWallet | 0x0 (not set) |

### Owner address issue (MUST FIX before production use)
The contract owner is the **Arc Studio platform deployer wallet** (`0x5B12Ce46C7194aD57d143bC22847224047b1Ef42`), not your personal wallet. This means:
- Only the platform deployer can call `ping()`, `deposit()`, `withdrawAll()`, `setBeneficiaries()`, etc.
- **You cannot use this contract with your own wallet as owner.**
- To fix: redeploy passing YOUR wallet address as `initialOwner` in the constructor.

### Testnet-specific values in the app and contract

| Location | Value | Testnet-specific? | Change for mainnet |
|----------|-------|-------------------|--------------------|
| `src/contract.ts` | `CHAIN_ID = 5042002` (Arc Testnet) | YES | Change to Arc mainnet chain ID |
| `src/contract.ts` | Contract address `0xecee…da3` | YES | New deploy on Arc mainnet |
| `src/config.ts` | `arcTestnet` chain import from `viem/chains` | YES | Import `arc` (mainnet) instead |
| `src/onchain-facts.ts` | All chain facts are registry-driven | NO — import-based | No edit needed; `getUsdc(mainnetChainId)` resolves correctly |
| Contract constructor arg | USDC `0x3600…0000` | YES — Arc Testnet USDC | Use Arc mainnet USDC address |
| `foundry.toml` | No RPC hardcoded | NO | No change needed |
| Contract source | No hardcoded addresses | NO | No change needed |

### Exact steps to deploy to Arc mainnet
1. Get the mainnet disclaimer and confirm you understand the risks.
2. Get the Arc mainnet chain ID and USDC address from `@/onchain-facts` (`getUsdc(arcMainnetChainId)`).
3. Redeploy `DeadManSwitch` with `initialOwner = YOUR_WALLET_ADDRESS` and the mainnet USDC address.
4. In `src/contract.ts`: update `CHAIN_ID`, update the contract address.
5. In `src/config.ts`: replace `arcTestnet` with `arc` (mainnet chain).
6. Test with a small amount before committing real funds.

---

## 5. BUGS FOUND AND FIXED

### Bug #1 — deposit() did not block after trigger (FIXED)
- **Severity:** High (functional defect)
- **Description:** `deposit()` only checked `!active`, but `active` stays `true` after trigger (it's only set to false on `withdrawAll` or `fallbackClaim`). So the owner could deposit new USDC into a triggered vault, diluting beneficiaries' computed shares after the trigger point.
- **Fix:** Added `if (triggered()) revert FallbackNotReady();` at the top of `deposit()`.
- **Test added:** `test_Deposit_RevertsAfterTrigger` — PASS

### Bug #2 — Deposited event emitted raw `amount` not received delta (FIXED)
- **Severity:** Low (inaccurate event for fee-on-transfer tokens)
- **Description:** The previous audit had already moved to balance-delta accounting in `totalDeposited`, but the `emit Deposited(msg.sender, amount)` still used the raw `amount` parameter instead of the measured `received` delta. With a fee-on-transfer token this would produce misleading event data.
- **Fix:** Changed `emit Deposited(msg.sender, amount)` to `emit Deposited(msg.sender, received)` where `received = balanceAfter - balanceBefore`.
- **Test added:** `test_Deposit_EmitsReceivedAmountNotRequestedAmount` — PASS

### Bug #3 — Test assertion wrong for 3333/3333/3334 split (FIXED in test)
- **Severity:** Test bug only — not a contract defect
- **Description:** Test incorrectly expected `alice + bob + carol = 999_999` but `1_000_000 * 3334 / 10_000 = 333_400` and the actual sum is exactly `1_000_000` with zero dust for this particular amount.
- **Fix:** Corrected the expected values and dust assertion in `test_Claim_ThreeWayOddSplit_1USDC`.

### Known Gap — Duplicate beneficiary addresses not rejected
- **Severity:** Low (documented behaviour, not a security issue)
- **Description:** `setBeneficiaries()` does not check for duplicate `wallet` entries. If the owner adds the same address twice with split shares, that address could claim twice — once per slot. The total payout would equal `bps1 + bps2` of `totalDeposited`, which is within the defined 100% envelope, so no overpayment is possible. But it is confusing.
- **Status:** Documented in `test_SetBeneficiaries_DocumentsDuplicatesAreNotRejected`. Not fixed — requires a O(n²) loop or a mapping, which changes gas profile. Acceptable for a vault with max 10 beneficiaries but worth noting.

### UI Limitation — Interval input is in days only
- **Severity:** UX (no contract impact)
- **Description:** The interval editor accepts whole days (`intervalDays * 86400`). For demo purposes (e.g. 120-second vault), there is no way to set a sub-day interval through the UI.
- **Recommendation:** Add a seconds/minutes/hours mode to the interval editor, or add a "demo mode" toggle that sets 120 seconds.

---

## Summary

| Area | Total Tests | Passed | Failed | Bugs Fixed |
|------|-------------|--------|--------|-----------|
| Contract unit/fuzz/invariant (forge) | 70 | **70** | 0 | 2 contract bugs fixed |
| Integration (fork, real state) | 35 | **35** | 0 | — |
| Frontend source review | 22 checks | **21** | 0 (1 UX gap) | — |
| **Total** | **127** | **126** | **0** | **2 bugs fixed, 1 gap documented** |
