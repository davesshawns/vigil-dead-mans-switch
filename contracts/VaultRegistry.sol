// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VaultRegistry
 * @notice Multi-vault dead man's switch registry. Each address owns one vault.
 *         Owners deposit an allowlisted ERC-20, configure beneficiaries with
 *         basis-point shares, and must ping periodically. If the interval
 *         elapses without a ping the vault triggers and beneficiaries can
 *         claim. An optional living allowance drips funds to beneficiaries on
 *         a schedule while the owner is still active.
 *
 * Security properties:
 *  - Only allowlisted (non-rebasing, non-fee) tokens are accepted.
 *  - Balance-delta accounting in deposit() handles any residual fee tokens.
 *  - Rounding dust is swept to the last claimant so no funds are ever stuck.
 *  - ReentrancyGuard on all state+transfer paths.
 *  - ConfigLocked / AlreadyTriggered guards prevent post-trigger mutation.
 */
contract VaultRegistry is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Structs ───────────────────────────────────────────────────────────

    struct Beneficiary {
        address wallet;
        uint16 basisPoints;
        bool claimed;
    }

    struct Vault {
        address owner;
        address token;
        uint256 checkInInterval;
        uint256 lastPing;
        bool active;
        uint256 totalDeposited;
        Beneficiary[] beneficiaries;
        address fallbackWallet;
        uint256 allowanceAmount;
        uint256 allowancePeriod;
        uint256 lastAllowanceRelease;
        bool allowanceEnabled;
    }

    // ── State ─────────────────────────────────────────────────────────────

    mapping(address => Vault) public vaults;
    address[] public vaultOwners;
    mapping(address => bool) public hasVault;
    /// @notice Per-vault token balance (updated on deposit, withdraw, claim, allowance).
    mapping(address => uint256) public vaultBalance;
    /// @notice Tokens permitted for new vault creation. Managed by contract owner.
    mapping(address => bool) public allowedTokens;

    // ── Errors ────────────────────────────────────────────────────────────

    error NotOwner();
    error VaultNotFound();
    error VaultAlreadyExists();
    error NotTriggered();
    error AlreadyClaimed();
    error NotBeneficiary();
    error NoBeneficiaryOrFallback();
    error InvalidShares();
    error TooManyBeneficiaries();
    error NotActive();
    error FallbackNotReady();
    error ZeroAddress();
    error ConfigLocked();
    error AlreadyTriggered();
    error AllowanceNotDue();
    error AllowanceTooLarge();
    error ZeroAmount();
    error DuplicateBeneficiary();
    error InvalidInterval();
    error TokenNotAllowed();

    // ── Events ────────────────────────────────────────────────────────────

    event VaultCreated(address indexed owner, address token, uint256 checkInInterval);
    event Pinged(address indexed owner, uint256 timestamp);
    event Deposited(address indexed owner, address indexed from, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event BeneficiariesSet(address indexed owner, uint256 count);
    event FallbackSet(address indexed owner, address wallet);
    event IntervalUpdated(address indexed owner, uint256 newInterval);
    event Claimed(address indexed owner, address indexed beneficiary, uint256 amount);
    event FallbackClaimed(address indexed owner, address indexed fallbackWallet, uint256 amount);
    event AllowanceReleased(address indexed owner, uint256 perBeneficiary, uint256 count);
    event AllowanceUpdated(address indexed owner, uint256 amount, uint256 period);
    event TokenAllowlistUpdated(address indexed token, bool allowed);

    // ── Modifiers ─────────────────────────────────────────────────────────

    modifier onlyVaultOwner(address _owner) {
        if (msg.sender != _owner || vaults[_owner].owner != _owner) revert NotOwner();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────

    constructor(address initialOwner, address[] memory initialTokens) Ownable(initialOwner) {
        for (uint256 i = 0; i < initialTokens.length; ++i) {
            if (initialTokens[i] == address(0)) revert ZeroAddress();
            allowedTokens[initialTokens[i]] = true;
            emit TokenAllowlistUpdated(initialTokens[i], true);
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    /// @notice Add or remove a token from the allowlist (contract owner only).
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    // ── Vault lifecycle ───────────────────────────────────────────────────

    function createVault(
        address token,
        uint256 checkInInterval,
        uint256 allowanceAmount,
        uint256 allowancePeriod
    ) external {
        if (hasVault[msg.sender]) revert VaultAlreadyExists();
        if (token == address(0)) revert ZeroAddress();
        if (!allowedTokens[token]) revert TokenNotAllowed();
        if (checkInInterval < 60) revert InvalidInterval();

        Vault storage vault = vaults[msg.sender];
        vault.owner = msg.sender;
        vault.token = token;
        vault.checkInInterval = checkInInterval;
        vault.lastPing = block.timestamp;
        vault.active = true;

        if (allowanceAmount > 0) {
            if (allowancePeriod < 60) revert InvalidInterval();
            vault.allowanceEnabled = true;
            vault.allowanceAmount = allowanceAmount;
            vault.allowancePeriod = allowancePeriod;
            vault.lastAllowanceRelease = block.timestamp;
        }

        hasVault[msg.sender] = true;
        vaultOwners.push(msg.sender);

        emit VaultCreated(msg.sender, token, checkInInterval);
    }

    // ── View helpers ──────────────────────────────────────────────────────

    function triggered(address _owner) public view returns (bool) {
        if (!hasVault[_owner]) return false;
        Vault storage vault = vaults[_owner];
        return block.timestamp > vault.lastPing + vault.checkInInterval;
    }

    function getVault(address _owner)
        external
        view
        returns (
            address token,
            uint256 checkInInterval,
            uint256 lastPing,
            bool active,
            bool isTriggered,
            uint256 totalDeposited,
            address fallbackWallet,
            uint256 allowanceAmount,
            uint256 allowancePeriod,
            uint256 lastAllowanceRelease,
            bool allowanceEnabled
        )
    {
        if (!hasVault[_owner]) revert VaultNotFound();
        Vault storage vault = vaults[_owner];
        return (
            vault.token,
            vault.checkInInterval,
            vault.lastPing,
            vault.active,
            triggered(_owner),
            vault.totalDeposited,
            vault.fallbackWallet,
            vault.allowanceAmount,
            vault.allowancePeriod,
            vault.lastAllowanceRelease,
            vault.allowanceEnabled
        );
    }

    function getBeneficiaries(address _owner) external view returns (Beneficiary[] memory) {
        if (!hasVault[_owner]) revert VaultNotFound();
        return vaults[_owner].beneficiaries;
    }

    function vaultCount() external view returns (uint256) {
        return vaultOwners.length;
    }

    // ── Owner actions ─────────────────────────────────────────────────────

    function ping() external onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert AlreadyTriggered();
        if (vaultBalance[msg.sender] == 0) revert ZeroAmount();

        vault.lastPing = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    function deposit(uint256 amount) external nonReentrant onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert AlreadyTriggered();
        if (vault.beneficiaries.length == 0 && vault.fallbackWallet == address(0)) revert NoBeneficiaryOrFallback();
        if (amount == 0) revert ZeroAmount();

        IERC20 token = IERC20(vault.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        uint256 received = balanceAfter - balanceBefore;

        vault.totalDeposited += received;
        vaultBalance[msg.sender] += received;

        emit Deposited(msg.sender, msg.sender, received);
    }

    function withdrawAll() external nonReentrant onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert AlreadyTriggered();

        uint256 amount = vaultBalance[msg.sender];
        vaultBalance[msg.sender] = 0;
        vault.totalDeposited = 0;
        vault.active = false;

        if (amount > 0) {
            IERC20(vault.token).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(msg.sender, amount);
    }

    function setBeneficiaries(address[] calldata wallets, uint16[] calldata shares) external onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert ConfigLocked();
        if (wallets.length != shares.length) revert InvalidShares();
        if (wallets.length > 10) revert TooManyBeneficiaries();

        uint256 sum;
        for (uint256 i = 0; i < wallets.length; ++i) {
            if (wallets[i] == address(0)) revert ZeroAddress();
            for (uint256 j = i + 1; j < wallets.length; ++j) {
                if (wallets[i] == wallets[j]) revert DuplicateBeneficiary();
            }
            sum += shares[i];
        }

        if (sum != 10_000) revert InvalidShares();

        delete vault.beneficiaries;
        for (uint256 i = 0; i < wallets.length; ++i) {
            vault.beneficiaries.push(Beneficiary({wallet: wallets[i], basisPoints: shares[i], claimed: false}));
        }

        emit BeneficiariesSet(msg.sender, wallets.length);
    }

    function setFallbackWallet(address wallet) external onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert ConfigLocked();

        vault.fallbackWallet = wallet;
        emit FallbackSet(msg.sender, wallet);
    }

    function setCheckInInterval(uint256 newInterval) external onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert ConfigLocked();
        if (newInterval < 60) revert InvalidInterval();

        vault.checkInInterval = newInterval;
        emit IntervalUpdated(msg.sender, newInterval);
    }

    function setAllowance(uint256 amount, uint256 period) external onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert AlreadyTriggered();
        if (amount > 0 && period < 60) revert InvalidInterval();

        bool wasDisabled = !vault.allowanceEnabled;

        vault.allowanceAmount = amount;
        vault.allowancePeriod = period;
        vault.allowanceEnabled = amount > 0;

        if (wasDisabled && vault.allowanceEnabled) {
            vault.lastAllowanceRelease = block.timestamp;
        }

        emit AllowanceUpdated(msg.sender, amount, period);
    }

    // ── Allowance ─────────────────────────────────────────────────────────

    function triggerAllowance() external nonReentrant onlyVaultOwner(msg.sender) {
        Vault storage vault = vaults[msg.sender];
        if (!vault.active) revert NotActive();
        if (triggered(msg.sender)) revert AlreadyTriggered();
        if (!vault.allowanceEnabled) revert AllowanceNotDue();

        _releaseAllowance(msg.sender, vault);
    }

    function releaseAllowance(address _owner) external nonReentrant {
        if (!hasVault[_owner]) revert VaultNotFound();

        Vault storage vault = vaults[_owner];
        if (!vault.active) revert NotActive();
        if (triggered(_owner)) revert AlreadyTriggered();
        if (!vault.allowanceEnabled) revert AllowanceNotDue();
        if (block.timestamp < vault.lastAllowanceRelease + vault.allowancePeriod) revert AllowanceNotDue();

        _releaseAllowance(_owner, vault);
    }

    function _releaseAllowance(address _owner, Vault storage vault) internal {
        uint256 count = vault.beneficiaries.length;
        if (count == 0) revert NotBeneficiary();

        uint256 total = vault.allowanceAmount * count;
        if (vaultBalance[_owner] < total) revert AllowanceTooLarge();

        IERC20 token = IERC20(vault.token);
        for (uint256 i = 0; i < count; ++i) {
            vaultBalance[_owner] -= vault.allowanceAmount;
            vault.totalDeposited -= vault.allowanceAmount;
            token.safeTransfer(vault.beneficiaries[i].wallet, vault.allowanceAmount);
        }

        vault.lastAllowanceRelease = block.timestamp;
        emit AllowanceReleased(_owner, vault.allowanceAmount, count);
    }

    // ── Claims ────────────────────────────────────────────────────────────

    /**
     * @notice Beneficiary claims their share after trigger.
     * @dev    The last beneficiary to claim receives the full remaining vaultBalance
     *         (not just their basis-point share) so rounding dust is never stranded.
     *         "Last" is determined by all other beneficiaries having already claimed.
     */
    function claim(address vaultOwner) external nonReentrant {
        if (!hasVault[vaultOwner]) revert VaultNotFound();

        Vault storage vault = vaults[vaultOwner];
        if (!vault.active) revert NotActive();
        if (!triggered(vaultOwner)) revert NotTriggered();

        uint256 length = vault.beneficiaries.length;
        for (uint256 i = 0; i < length; ++i) {
            Beneficiary storage beneficiary = vault.beneficiaries[i];
            if (beneficiary.wallet == msg.sender) {
                if (beneficiary.claimed) revert AlreadyClaimed();

                // Check if this is the last unclaimed beneficiary.
                bool isLast = true;
                for (uint256 j = 0; j < length; ++j) {
                    if (j != i && !vault.beneficiaries[j].claimed) {
                        isLast = false;
                        break;
                    }
                }

                uint256 amount;
                if (isLast) {
                    // Sweep the full remainder so dust is never stranded.
                    amount = vaultBalance[vaultOwner];
                } else {
                    uint256 share = (vault.totalDeposited * beneficiary.basisPoints) / 10_000;
                    uint256 available = vaultBalance[vaultOwner];
                    amount = share < available ? share : available;
                }

                beneficiary.claimed = true;
                if (amount > 0) {
                    vaultBalance[vaultOwner] -= amount;
                    IERC20(vault.token).safeTransfer(msg.sender, amount);
                }

                emit Claimed(vaultOwner, msg.sender, amount);
                return;
            }
        }

        revert NotBeneficiary();
    }

    function fallbackClaim(address vaultOwner) external nonReentrant {
        if (!hasVault[vaultOwner]) revert VaultNotFound();

        Vault storage vault = vaults[vaultOwner];
        if (!vault.active) revert NotActive();
        if (!triggered(vaultOwner)) revert NotTriggered();
        if (vault.fallbackWallet == address(0) || msg.sender != vault.fallbackWallet) revert FallbackNotReady();
        if (block.timestamp <= vault.lastPing + (2 * vault.checkInInterval)) revert FallbackNotReady();

        uint256 amount = vaultBalance[vaultOwner];
        vaultBalance[vaultOwner] = 0;
        vault.totalDeposited = 0;
        vault.active = false;

        if (amount > 0) {
            IERC20(vault.token).safeTransfer(vault.fallbackWallet, amount);
        }

        emit FallbackClaimed(vaultOwner, vault.fallbackWallet, amount);
    }
}
