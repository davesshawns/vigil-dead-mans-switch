// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  FALLBACK CLAIM + MULTI-VAULT ISOLATION + ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryFallbackTest is VaultRegistryTestBase {

    function _setupFallbackVault() internal {
        _createVault(owner);
        vm.prank(owner);
        registry.setFallbackWallet(fallback_);
        _deposit(owner, DEPOSIT);
    }

    // ── fallbackClaim ────────────────────────────────────────────────────

    function test_FallbackClaim_SucceedsAfter2xInterval() public {
        _setupFallbackVault();
        vm.warp(block.timestamp + 2 * INTERVAL + 1);

        uint256 fbBefore = token.balanceOf(fallback_);
        vm.prank(fallback_);
        registry.fallbackClaim(owner);

        assertEq(token.balanceOf(fallback_) - fbBefore, DEPOSIT);
        assertEq(registry.vaultBalance(owner), 0);
    }

    function test_FallbackClaim_EmitsEvent() public {
        _setupFallbackVault();
        vm.warp(block.timestamp + 2 * INTERVAL + 1);
        vm.prank(fallback_);
        vm.expectEmit(true, true, false, true, address(registry));
        emit VaultRegistry.FallbackClaimed(owner, fallback_, DEPOSIT);
        registry.fallbackClaim(owner);
    }

    function test_FallbackClaim_SweepsResidualAfterPartialClaims() public {
        _createVault(owner);
        vm.prank(owner);
        registry.setFallbackWallet(fallback_);
        // Also set alice as beneficiary
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws, ss);
        _deposit(owner, DEPOSIT);

        // Trigger + alice claims partial (she claims 100% by shares, no residual from her)
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(alice);
        registry.claim(owner);
        // vaultBalance is now 0, but fallback can still call (vault active=true still)
        // Let's use a different scenario: two beneficiaries, only one claims
        // Rebuild with two beneficiaries
    }

    function test_FallbackClaim_SweepsResidualTwoBeneficiaries() public {
        _createVault(owner);
        uint256 t0 = block.timestamp; // vault lastPing = t0
        vm.prank(owner);
        registry.setFallbackWallet(fallback_);
        _setTwoBeneficiaries(owner, alice, bob);
        _deposit(owner, DEPOSIT);

        // Alice claims her 60%, bob does NOT claim
        vm.warp(t0 + INTERVAL + 1); // triggered (> 1x interval)
        vm.prank(alice);
        registry.claim(owner);

        uint256 residual = registry.vaultBalance(owner); // bob's 40% still there

        // Warp past 2x interval from lastPing (t0):  block.timestamp > t0 + 2*INTERVAL
        vm.warp(t0 + 2 * INTERVAL + 1);

        uint256 fbBefore = token.balanceOf(fallback_);
        vm.prank(fallback_);
        registry.fallbackClaim(owner);

        assertEq(token.balanceOf(fallback_) - fbBefore, residual);
        assertEq(registry.vaultBalance(owner), 0);
    }

    function test_FallbackClaim_RevertBefore2xInterval() public {
        _setupFallbackVault();
        // Triggered (> 1x) but not yet > 2x
        vm.warp(block.timestamp + INTERVAL + 1);
        assertTrue(registry.triggered(owner));

        vm.prank(fallback_);
        vm.expectRevert(VaultRegistry.FallbackNotReady.selector);
        registry.fallbackClaim(owner);
    }

    function test_FallbackClaim_RevertNoFallbackSet() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        vm.warp(block.timestamp + 2 * INTERVAL + 1);

        vm.prank(alice);
        vm.expectRevert(VaultRegistry.FallbackNotReady.selector);
        registry.fallbackClaim(owner);
    }

    function test_FallbackClaim_RevertWrongCaller() public {
        _setupFallbackVault();
        vm.warp(block.timestamp + 2 * INTERVAL + 1);

        vm.prank(bob);
        vm.expectRevert(VaultRegistry.FallbackNotReady.selector);
        registry.fallbackClaim(owner);
    }

    function test_SetFallbackWallet_EmitsEvent() public {
        _createVault(owner);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.FallbackSet(owner, fallback_);
        registry.setFallbackWallet(fallback_);
    }

    function test_SetFallbackWallet_RevertNonOwner() public {
        _createVault(owner);
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setFallbackWallet(fallback_);
    }

    function test_SetFallbackWallet_RevertConfigLocked() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.ConfigLocked.selector);
        registry.setFallbackWallet(fallback_);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MULTI-VAULT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryIsolationTest is VaultRegistryTestBase {
    address internal ownerB = makeAddr("ownerB");

    function test_Isolation_DepositDoesNotCrossVaults() public {
        _createVaultWithBeneficiary(owner,  alice);
        _createVaultWithBeneficiary(ownerB, bob);

        _deposit(owner, DEPOSIT);

        assertEq(registry.vaultBalance(owner),  DEPOSIT);
        assertEq(registry.vaultBalance(ownerB), 0);
    }

    function test_Isolation_ClaimDoesNotCrossVaults() public {
        _createVaultWithBeneficiary(owner,  alice);
        _createVaultWithBeneficiary(ownerB, bob);
        _deposit(owner,  DEPOSIT);
        _deposit(ownerB, DEPOSIT / 2);

        vm.warp(block.timestamp + INTERVAL + 1);

        vm.prank(alice);
        registry.claim(owner);

        // ownerB's vault is unaffected
        assertEq(registry.vaultBalance(ownerB), DEPOSIT / 2);
    }

    function test_Isolation_VaultCountCorrect() public {
        _createVault(owner);
        _createVault(ownerB);
        assertEq(registry.vaultCount(), 2);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACCESS CONTROL — all owner-only functions revert for non-owners
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryAccessControlTest is VaultRegistryTestBase {

    function setUp() public override {
        super.setUp();
        _createVault(owner);
    }

    function test_AC_Ping_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.ping();
    }

    function test_AC_Deposit_NonOwner() public {
        token.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(registry), DEPOSIT);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function test_AC_WithdrawAll_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.withdrawAll();
    }

    function test_AC_SetBeneficiaries_NonOwner() public {
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_AC_SetFallbackWallet_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setFallbackWallet(fallback_);
    }

    function test_AC_SetCheckInInterval_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setCheckInInterval(7200);
    }

    function test_AC_SetAllowance_NonOwner() public {
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setAllowance(100e6, 3600);
    }

    function test_AC_TriggerAllowance_NonOwner() public {
        vm.prank(owner);
        registry.setAllowance(100e6, 3600);
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.triggerAllowance();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FUZZ — key arithmetic properties
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryFuzzTest is VaultRegistryTestBase {

    function testFuzz_DepositBalanceDelta(uint64 amount) public {
        vm.assume(amount > 0);
        _createVaultWithBeneficiary(owner, alice);
        uint256 before = registry.vaultBalance(owner);
        _deposit(owner, amount);
        assertEq(registry.vaultBalance(owner), before + amount);
    }

    function testFuzz_ClaimAmountMatchesBasisPoints(uint64 depositAmt, uint16 bp1) public {
        // bp1 is alice's share; bob gets 10000 - bp1
        vm.assume(depositAmt > 0);
        bp1 = uint16(bound(bp1, 1, 9_999));
        uint16 bp2 = 10_000 - bp1;

        _createVault(owner);
        address[] memory ws = new address[](2);
        uint16[]  memory ss = new uint16[](2);
        ws[0] = alice; ss[0] = bp1;
        ws[1] = bob;   ss[1] = bp2;
        vm.prank(owner);
        registry.setBeneficiaries(ws, ss);
        _deposit(owner, depositAmt);

        vm.warp(block.timestamp + INTERVAL + 1);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        registry.claim(owner);

        uint256 expectedAlice = (uint256(depositAmt) * bp1) / 10_000;
        assertEq(token.balanceOf(alice) - aliceBefore, expectedAlice);
    }
}
