// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultRegistry} from "../VaultRegistry.sol";

/// @dev Minimal ERC-20 mock: no fee-on-transfer, supports mint/approve/transfer.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _dec) {
        name = _name; symbol = _symbol; decimals = _dec;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply    += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient");
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        return true;
    }
}

/// @dev Shared state and helpers.  No test functions — each category inherits this.
abstract contract VaultRegistryTestBase is Test {
    VaultRegistry internal registry;
    MockERC20     internal token;

    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");
    address internal carol   = makeAddr("carol");
    address internal fallback_ = makeAddr("fallback");

    uint256 internal constant INTERVAL   = 3_600;  // 1 hour
    uint256 internal constant DEPOSIT    = 1_000e6;
    uint256 internal constant ALLOWANCE  = 100e6;
    uint256 internal constant AL_PERIOD  = 3_600;

    // ── helpers ──────────────────────────────────────────────────────────────

    /// Create a vault for `who` with no allowance.
    function _createVault(address who) internal {
        vm.prank(who);
        registry.createVault(address(token), INTERVAL, 0, 0);
    }

    /// Create vault + set a single beneficiary.
    function _createVaultWithBeneficiary(address who, address bene) internal {
        _createVault(who);
        address[] memory ws = new address[](1);
        uint16[]  memory ss = new uint16[](1);
        ws[0] = bene; ss[0] = 10_000;
        vm.prank(who);
        registry.setBeneficiaries(ws, ss);
    }

    /// Set two beneficiaries 60/40.
    function _setTwoBeneficiaries(address who, address b1, address b2) internal {
        address[] memory ws = new address[](2);
        uint16[]  memory ss = new uint16[](2);
        ws[0] = b1; ss[0] = 6_000;
        ws[1] = b2; ss[1] = 4_000;
        vm.prank(who);
        registry.setBeneficiaries(ws, ss);
    }

    /// Mint tokens to `who`, approve registry, then deposit.
    function _deposit(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(registry), amount);
        registry.deposit(amount);
        vm.stopPrank();
    }

    function setUp() public virtual {
        token    = new MockERC20("Mock USDC", "mUSDC", 6);
        address[] memory initTokens = new address[](1);
        initTokens[0] = address(token);
        registry = new VaultRegistry(address(this), initTokens);
    }
}
