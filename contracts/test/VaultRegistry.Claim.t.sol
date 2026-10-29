// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  CLAIM (beneficiary inheritance)
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryClaimTest is VaultRegistryTestBase {

    function _triggerVault(address who) internal {
        vm.warp(block.timestamp + INTERVAL + 1);
        assertTrue(registry.triggered(who));
    }

    // ── single beneficiary gets 100% ─────────────────────────────────────

    function test_Claim_BeneficiaryGetsFullAmount() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        registry.claim(owner);

        assertEq(token.balanceOf(alice), aliceBefore + DEPOSIT);
        assertEq(registry.vaultBalance(owner), 0);
    }

    function test_Claim_EmitsEvent() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(registry));
        emit VaultRegistry.Claimed(owner, alice, DEPOSIT);
        registry.claim(owner);
    }

    function test_Claim_RevertNotBeneficiary() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        vm.prank(bob);
        vm.expectRevert(VaultRegistry.NotBeneficiary.selector);
        registry.claim(owner);
    }

    function test_Claim_RevertAlreadyClaimed() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        vm.prank(alice);
        registry.claim(owner);

        vm.prank(alice);
        vm.expectRevert(VaultRegistry.AlreadyClaimed.selector);
        registry.claim(owner);
    }

    function test_Claim_RevertBeforeTrigger() public {
        _createVaultWithBeneficiary(owner, alice);
        _deposit(owner, DEPOSIT);

        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotTriggered.selector);
        registry.claim(owner);
    }

    // ── two beneficiaries 60/40 ──────────────────────────────────────────

    function test_Claim_TwoBeneficiaries6040() public {
        _createVault(owner);
        _setTwoBeneficiaries(owner, alice, bob);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore   = token.balanceOf(bob);

        vm.prank(alice);
        registry.claim(owner);

        vm.prank(bob);
        registry.claim(owner);

        uint256 aliceExpected = (DEPOSIT * 6_000) / 10_000;
        uint256 bobExpected   = (DEPOSIT * 4_000) / 10_000;

        assertEq(token.balanceOf(alice) - aliceBefore, aliceExpected);
        assertEq(token.balanceOf(bob)   - bobBefore,   bobExpected);
        assertEq(registry.vaultBalance(owner), 0);
    }

    // ── vault drains to 0 after both claims ──────────────────────────────

    function test_Claim_VaultDrainsToZero() public {
        _createVault(owner);
        _setTwoBeneficiaries(owner, alice, bob);
        _deposit(owner, DEPOSIT);
        _triggerVault(owner);

        vm.prank(alice);
        registry.claim(owner);
        vm.prank(bob);
        registry.claim(owner);

        assertEq(registry.vaultBalance(owner), 0);
    }
}
