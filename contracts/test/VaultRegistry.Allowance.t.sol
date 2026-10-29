// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  ALLOWANCE
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryAllowanceTest is VaultRegistryTestBase {

    // Use a 7-day check-in interval so allowance tests can warp through an allowance
    // period (AL_PERIOD = 3600) without also triggering the vault (INTERVAL = 86400).
    uint256 internal constant LONG_INTERVAL = 86_400; // 24 hours

    // Create vault with allowance enabled, set alice as beneficiary, deposit.
    function _allowanceSetup() internal {
        vm.prank(owner);
        registry.createVault(address(token), LONG_INTERVAL, ALLOWANCE, AL_PERIOD);

        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws, ss);

        _deposit(owner, DEPOSIT);
    }

    // ── releaseAllowance ─────────────────────────────────────────────────

    function test_ReleaseAllowance_SendsCorrectAmount() public {
        _allowanceSetup();
        vm.warp(block.timestamp + AL_PERIOD + 1);

        uint256 aliceBefore = token.balanceOf(alice);
        registry.releaseAllowance(owner);

        assertEq(token.balanceOf(alice) - aliceBefore, ALLOWANCE);
    }

    function test_ReleaseAllowance_UpdatesLastRelease() public {
        _allowanceSetup();
        uint256 t = block.timestamp + AL_PERIOD + 1;
        vm.warp(t);
        registry.releaseAllowance(owner);

        (,,,,,,,,, uint256 lastRelease, ) = registry.getVault(owner);
        assertEq(lastRelease, t);
    }

    function test_ReleaseAllowance_ReducesVaultBalance() public {
        _allowanceSetup();
        vm.warp(block.timestamp + AL_PERIOD + 1);
        registry.releaseAllowance(owner);
        assertEq(registry.vaultBalance(owner), DEPOSIT - ALLOWANCE);
    }

    function test_ReleaseAllowance_ReducesTotalDeposited() public {
        _allowanceSetup();
        vm.warp(block.timestamp + AL_PERIOD + 1);
        registry.releaseAllowance(owner);
        (,,,,, uint256 td,,,,, ) = registry.getVault(owner);
        assertEq(td, DEPOSIT - ALLOWANCE);
    }

    function test_ReleaseAllowance_EmitsEvent() public {
        _allowanceSetup();
        vm.warp(block.timestamp + AL_PERIOD + 1);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.AllowanceReleased(owner, ALLOWANCE, 1);
        registry.releaseAllowance(owner);
    }

    function test_ReleaseAllowance_RevertPeriodNotElapsed() public {
        _allowanceSetup();
        vm.warp(block.timestamp + AL_PERIOD - 1);
        vm.expectRevert(VaultRegistry.AllowanceNotDue.selector);
        registry.releaseAllowance(owner);
    }

    function test_ReleaseAllowance_RevertAfterTrigger() public {
        _allowanceSetup();
        // Warp past LONG_INTERVAL to trigger the vault
        vm.warp(block.timestamp + LONG_INTERVAL + 1);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.releaseAllowance(owner);
    }

    function test_ReleaseAllowance_RevertInsufficientBalance() public {
        // Create vault with HUGE allowance but tiny deposit; use LONG_INTERVAL so
        // warping past AL_PERIOD does NOT also trigger the vault.
        vm.prank(owner);
        registry.createVault(address(token), LONG_INTERVAL, DEPOSIT * 10, AL_PERIOD);

        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws, ss);
        _deposit(owner, DEPOSIT);

        vm.warp(block.timestamp + AL_PERIOD + 1);
        vm.expectRevert(VaultRegistry.AllowanceTooLarge.selector);
        registry.releaseAllowance(owner);
    }

    // ── triggerAllowance (owner early release) ───────────────────────────

    function test_TriggerAllowance_Owner() public {
        _allowanceSetup();
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(owner);
        registry.triggerAllowance();
        assertEq(token.balanceOf(alice) - aliceBefore, ALLOWANCE);
    }

    function test_TriggerAllowance_RevertNonOwner() public {
        _allowanceSetup();
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.triggerAllowance();
    }

    function test_TriggerAllowance_RevertAfterTrigger() public {
        _allowanceSetup();
        vm.warp(block.timestamp + LONG_INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.triggerAllowance();
    }

    // ── setAllowance ─────────────────────────────────────────────────────

    function test_SetAllowance_UpdatesAmountAndPeriod() public {
        _createVault(owner);
        vm.prank(owner);
        registry.setAllowance(50e6, 7200);

        (,,,,,,, uint256 aAmt, uint256 aPeriod,, bool aEnabled) = registry.getVault(owner);
        assertEq(aAmt, 50e6);
        assertEq(aPeriod, 7200);
        assertTrue(aEnabled);
    }

    function test_SetAllowance_EmitsEvent() public {
        _createVault(owner);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.AllowanceUpdated(owner, 50e6, 7200);
        registry.setAllowance(50e6, 7200);
    }

    function test_SetAllowance_RevertAfterTrigger() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.setAllowance(50e6, 7200);
    }

    function test_SetAllowance_RevertNonOwner() public {
        _createVault(owner);
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setAllowance(50e6, 7200);
    }

    // ── allowance reduces claim math ─────────────────────────────────────
    // After one allowance release, totalDeposited shrinks → claim gets less.

    function test_Allowance_ReducesClaimAmount() public {
        _allowanceSetup();

        // Release one allowance period
        vm.warp(block.timestamp + AL_PERIOD + 1);
        registry.releaseAllowance(owner);

        // Now trigger (warp past LONG_INTERVAL from original lastPing)
        vm.warp(block.timestamp + LONG_INTERVAL + 1);
        assertTrue(registry.triggered(owner));

        // Alice claims — should receive totalDeposited after allowance reduction
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        registry.claim(owner);

        uint256 expectedClaimBase = DEPOSIT - ALLOWANCE; // totalDeposited after allowance
        uint256 expectedClaim     = (expectedClaimBase * 10_000) / 10_000; // 100%
        assertEq(token.balanceOf(alice) - aliceBefore, expectedClaim);
        assertEq(registry.vaultBalance(owner), 0);
    }
}
