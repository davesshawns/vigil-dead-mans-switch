// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  VAULT CREATION
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryCreateTest is VaultRegistryTestBase {

    // ── createVault happy paths ───────────────────────────────────────────

    function test_CreateVault_BasicSuccess() public {
        vm.prank(owner);
        registry.createVault(address(token), INTERVAL, 0, 0);

        assertTrue(registry.hasVault(owner));
        (
            address tok,
            uint256 ci,
            uint256 lp,
            bool active,
            bool isTrig,
            uint256 td,
            ,,,, bool allowEnabled
        ) = registry.getVault(owner);

        assertEq(tok, address(token));
        assertEq(ci, INTERVAL);
        assertEq(lp, block.timestamp);
        assertTrue(active);
        assertFalse(isTrig);
        assertEq(td, 0);
        assertFalse(allowEnabled);
    }

    function test_CreateVault_WithAllowance() public {
        vm.prank(owner);
        registry.createVault(address(token), INTERVAL, ALLOWANCE, AL_PERIOD);

        (,,,,,,, uint256 aAmt, uint256 aPeriod,, bool aEnabled) = registry.getVault(owner);
        assertTrue(aEnabled);
        assertEq(aAmt, ALLOWANCE);
        assertEq(aPeriod, AL_PERIOD);
    }

    function test_CreateVault_EmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.VaultCreated(owner, address(token), INTERVAL);
        registry.createVault(address(token), INTERVAL, 0, 0);
    }

    function test_CreateVault_VaultCountIncreases() public {
        assertEq(registry.vaultCount(), 0);
        _createVault(owner);
        assertEq(registry.vaultCount(), 1);
    }

    // ── createVault revert paths ─────────────────────────────────────────

    function test_CreateVault_RevertAlreadyExists() public {
        _createVault(owner);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.VaultAlreadyExists.selector);
        registry.createVault(address(token), INTERVAL, 0, 0);
    }

    function test_CreateVault_RevertZeroToken() public {
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.ZeroAddress.selector);
        registry.createVault(address(0), INTERVAL, 0, 0);
    }

    function test_CreateVault_RevertIntervalTooShort() public {
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.InvalidInterval.selector);
        registry.createVault(address(token), 59, 0, 0);
    }

    function test_CreateVault_RevertAllowancePeriodTooShort() public {
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.InvalidInterval.selector);
        registry.createVault(address(token), INTERVAL, ALLOWANCE, 59);
    }

    // ── PING ─────────────────────────────────────────────────────────────

    function test_Ping_ResetsLastPing() public {
        _createVault(owner);
        uint256 before = block.timestamp;
        vm.warp(before + 100);
        vm.prank(owner);
        registry.ping();

        (,, uint256 lp,,,,,,,, ) = registry.getVault(owner);
        assertEq(lp, before + 100);
    }

    function test_Ping_EmitsEvent() public {
        _createVault(owner);
        vm.warp(block.timestamp + 100);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.Pinged(owner, block.timestamp);
        registry.ping();
    }

    function test_Ping_RevertAfterTrigger() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.ping();
    }

    function test_Ping_RevertNonOwner() public {
        _createVault(owner);
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.ping();
    }

    // ── WITHDRAW ─────────────────────────────────────────────────────────

    function test_WithdrawAll_ReturnsBalance() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);

        uint256 ownerBefore = token.balanceOf(owner);
        vm.prank(owner);
        registry.withdrawAll();

        assertEq(token.balanceOf(owner), ownerBefore + DEPOSIT);
        assertEq(registry.vaultBalance(owner), 0);

        (,,, bool active,,uint256 td,,,,, ) = registry.getVault(owner);
        assertFalse(active);
        assertEq(td, 0);
    }

    function test_WithdrawAll_EmitsEvent() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.Withdrawn(owner, DEPOSIT);
        registry.withdrawAll();
    }

    function test_WithdrawAll_RevertAfterTrigger() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.withdrawAll();
    }

    function test_WithdrawAll_RevertNonOwner() public {
        _createVault(owner);
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.withdrawAll();
    }
}
