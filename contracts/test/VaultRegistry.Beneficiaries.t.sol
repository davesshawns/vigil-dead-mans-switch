// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  BENEFICIARIES
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryBeneficiariesTest is VaultRegistryTestBase {

    function test_SetBeneficiaries_ValidSingle() public {
        _createVault(owner);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws, ss);

        VaultRegistry.Beneficiary[] memory benes = registry.getBeneficiaries(owner);
        assertEq(benes.length, 1);
        assertEq(benes[0].wallet, alice);
        assertEq(benes[0].basisPoints, 10_000);
        assertFalse(benes[0].claimed);
    }

    function test_SetBeneficiaries_ValidMultiple() public {
        _createVault(owner);
        _setTwoBeneficiaries(owner, alice, bob);

        VaultRegistry.Beneficiary[] memory benes = registry.getBeneficiaries(owner);
        assertEq(benes.length, 2);
        assertEq(benes[0].basisPoints, 6_000);
        assertEq(benes[1].basisPoints, 4_000);
    }

    function test_SetBeneficiaries_EmitsEvent() public {
        _createVault(owner);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(registry));
        emit VaultRegistry.BeneficiariesSet(owner, 1);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_Overwrite() public {
        _createVault(owner);
        // First set: single beneficiary
        address[] memory ws1 = new address[](1);
        uint16[]  memory ss1 = new uint16[](1);
        ws1[0] = alice; ss1[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws1, ss1);

        // Overwrite with bob 100%
        address[] memory ws2 = new address[](1);
        uint16[]  memory ss2 = new uint16[](1);
        ws2[0] = bob; ss2[0] = 10_000;
        vm.prank(owner);
        registry.setBeneficiaries(ws2, ss2);

        VaultRegistry.Beneficiary[] memory benes = registry.getBeneficiaries(owner);
        assertEq(benes.length, 1);
        assertEq(benes[0].wallet, bob);
    }

    function test_SetBeneficiaries_RevertInvalidShares() public {
        _createVault(owner);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 9_999;
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.InvalidShares.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_RevertTooMany() public {
        _createVault(owner);
        address[] memory ws = new address[](11);
        uint16[]  memory ss = new uint16[](11);
        for (uint256 i = 0; i < 11; i++) {
            ws[i] = makeAddr(string(abi.encodePacked("bene", i)));
            ss[i] = 909;
        }
        // shares intentionally wrong; TooManyBeneficiaries checked first
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.TooManyBeneficiaries.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_RevertZeroAddress() public {
        _createVault(owner);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = address(0); ss[0] = 10_000;
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.ZeroAddress.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_RevertDuplicate() public {
        _createVault(owner);
        address[] memory ws = new address[](2);
        uint16[]  memory ss = new uint16[](2);
        ws[0] = alice; ss[0] = 5_000;
        ws[1] = alice; ss[1] = 5_000;
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.DuplicateBeneficiary.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_RevertConfigLocked() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);

        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.ConfigLocked.selector);
        registry.setBeneficiaries(ws, ss);
    }

    function test_SetBeneficiaries_RevertNonOwner() public {
        _createVault(owner);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = alice; ss[0] = 10_000;
        vm.prank(alice);
        vm.expectRevert(VaultRegistry.NotOwner.selector);
        registry.setBeneficiaries(ws, ss);
    }
}
