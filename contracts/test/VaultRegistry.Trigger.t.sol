// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultRegistryTestBase} from "./VaultRegistry.Base.t.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
//  TRIGGER STATE
// ═══════════════════════════════════════════════════════════════════════════
contract VaultRegistryTriggerTest is VaultRegistryTestBase {

    function test_Triggered_FalseBeforeInterval() public {
        _createVault(owner);
        assertFalse(registry.triggered(owner));
        // advance to just before the deadline
        vm.warp(block.timestamp + INTERVAL - 1);
        assertFalse(registry.triggered(owner));
    }

    function test_Triggered_TrueAfterInterval() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);
        assertTrue(registry.triggered(owner));
    }

    function test_Triggered_ExactBoundaryNotTriggered() public {
        _createVault(owner);
        // block.timestamp > lastPing + interval — equality is NOT triggered
        vm.warp(block.timestamp + INTERVAL);
        assertFalse(registry.triggered(owner));
    }

    function test_Triggered_FalseForNoVault() public {
        assertFalse(registry.triggered(alice));
    }

    function test_Ping_AfterTrigger_Reverts() public {
        _createVault(owner);
        vm.warp(block.timestamp + INTERVAL + 1);
        vm.prank(owner);
        vm.expectRevert(VaultRegistry.AlreadyTriggered.selector);
        registry.ping();
    }

    function test_PingResetsTriggered() public {
        // t0 = block.timestamp (starts at 1 in forge)
        // Use fixed absolute timestamps to avoid via_ir lazily re-reading block.timestamp.
        _createVault(owner);
        // Step 1: warp to just before trigger (interval=3600, lastPing=1, deadline=3601)
        vm.warp(3_590); // 3590 <= 3601 → not triggered
        vm.prank(owner);
        registry.ping(); // lastPing = 3590, new deadline = 3590 + 3600 = 7190

        // Immediately after ping: not triggered
        assertFalse(registry.triggered(owner));

        // Step 2: advance past old deadline (3601) but before new deadline (7190)
        vm.warp(5_000); // 5000 is > 3601 (old) but < 7190+1 (new) → not triggered
        assertFalse(registry.triggered(owner));

        // Step 3: advance past new deadline (7190)
        vm.warp(7_200); // 7200 > 7190 → triggered
        assertTrue(registry.triggered(owner));
    }
}
