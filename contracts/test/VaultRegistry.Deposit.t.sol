// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  DEPOSIT
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryDepositTest is VaultRegistryTestBase {

    function test_Deposit_SucceedsWithBeneficiary() public {
        _createVaultWithBeneficiary(owner, alice);
        token.mint(owner, DEPOSIT);
        vm.startPrank(owner);
        token.approve(address(registry), DEPOSIT);
        registry.deposit(DEPOSIT);
        vm.stopPrank();

        assertEq(registry.vaultBalance(owner), DEPOSIT);
    }

    function test_Deposit_SucceedsWithFallbackOnly() public {
        _createVault(owner);
        vm.prank(owner);
        registry.setFallbackWallet(fallback_);

        token.mint(owner, DEPOSIT);
        vm.startPrank(owner);
        token.approve(address(registry), DEPOSIT);
        registry.deposit(DEPOSIT);
        vm.stopPrank();

        assertEq(registry.vaultBalance(owner), DEPOSIT);
    }

    function test_Deposit_RevertNoBeneficiaryOrFallback() public {
        _createVault(owner);
        token.mint(owner, DEPOSIT);
        vm.startPrank(owner);
        token.approve(address(registry), DEPOSIT);
        vm.expectRevert(VaultRegistry.NoBeneficiaryOrFallback.selector);
        registry.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function test_Deposit_RevertAfterTrigger() public {
        _createVaultWithBeneficiary(owner, alice);
        vm.warp(block.timestamp + INTERVAL + 1);
        token.mint(owner, DEPOSIT);
        vm.startPrank(owner);
        token.approve(address(registry), DEPOSIT);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function test_Deposit_BalanceDeltaCorrect() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);

        assertEq(registry.vaultBalance(owner), DEPOSIT);
        (,,,,, uint256 td,,,,, ) = registry.getVault(owner);
        assertEq(td, DEPOSIT);
    }

    function test_Deposit_MultipleAccumulate() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        _deposit(owner, DEPOSIT / 2);

        uint256 expected = DEPOSIT + DEPOSIT / 2;
        assertEq(registry.vaultBalance(owner), expected);
        (,,,,, uint256 td,,,,, ) = registry.getVault(owner);
        assertEq(td, expected);
    }

    function test_Deposit_EmitsEvent() public {
        _createVaultWithBeneficiary(owner, alice);
        token.mint(owner, DEPOSIT);
        vm.startPrank(owner);
        token.approve(address(registry), DEPOSIT);
        vm.expectEmit(true, true, false, true, address(registry));
        emit VaultRegistry.Deposited(owner, owner, DEPOSIT);
        registry.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function test_Deposit_RevertNonOwner() public {
        _createVaultWithBeneficiary(owner, alice);
        token.mint(alice, DEPOSIT);
        vm.startPrank(alice);
        token.approve(address(registry), DEPOSIT);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.deposit(DEPOSIT);
        vm.stopPrank();
    }

    function test_Deposit_RevertZeroAmount() public {
        _createVaultWithBeneficiary(owner, alice);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.ZeroAmount.selector);
        registry.deposit(0);
    }
}
