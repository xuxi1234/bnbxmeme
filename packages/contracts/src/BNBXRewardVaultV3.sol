// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";

/// @title BNBX V3 external-token reward vault
/// @notice Pull-based cumulative accounting avoids holder loops. Holder shares
/// are synchronized by the launch token; LP shares are backed by LP held here.
contract BNBXRewardVaultV3 {
    enum Mode {
        Holder,
        LiquidityProvider
    }

    uint256 private constant MAGNITUDE = 1e36;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    Mode public immutable mode;
    address public immutable controller;
    IERC20Minimal public immutable rewardToken;
    uint256 public immutable minimumShare;
    address public shareAsset;
    bool public assetConfigured;

    uint256 public totalShares;
    uint256 public totalRewardsReceived;
    uint256 public totalRewardsClaimed;
    uint256 public rewardPerShare;
    uint256 public pendingRewards;
    uint256 private unlocked = 1;

    mapping(address account => uint256 amount) public shares;
    mapping(address account => int256 amount) private rewardCorrection;
    mapping(address account => uint256 amount) public claimedRewards;
    mapping(address account => bool excluded) public isExcluded;

    error OnlyController();
    error InvalidAddress();
    error AssetAlreadyConfigured();
    error InvalidMode();
    error TokenTransferFailed();
    error AccountExcluded();
    error ShareBelowMinimum();
    error Reentrancy();

    event ShareAssetConfigured(address indexed asset);
    event ExclusionUpdated(address indexed account, bool excluded);
    event ShareUpdated(address indexed account, uint256 previous, uint256 current);
    event RewardsSynchronized(address indexed caller, uint256 amount);
    event RewardsClaimed(address indexed account, address indexed recipient, uint256 amount);
    event LPStaked(address indexed account, uint256 amount);
    event LPWithdrawn(address indexed account, address indexed recipient, uint256 amount);

    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        Mode mode_,
        address controller_,
        address rewardToken_,
        uint256 minimumShare_
    ) {
        if (
            controller_ == address(0) || controller_ == DEAD
                || rewardToken_ == address(0) || rewardToken_ == DEAD
                || rewardToken_.code.length == 0 || minimumShare_ == 0
        ) revert InvalidAddress();
        mode = mode_;
        controller = controller_;
        rewardToken = IERC20Minimal(rewardToken_);
        minimumShare = minimumShare_;
        isExcluded[address(0)] = true;
        isExcluded[DEAD] = true;
        isExcluded[address(this)] = true;
    }

    function configureShareAsset(address asset) external onlyController {
        if (assetConfigured) revert AssetAlreadyConfigured();
        if (asset == address(0) || asset == DEAD) {
            revert InvalidAddress();
        }
        shareAsset = asset;
        assetConfigured = true;
        emit ShareAssetConfigured(asset);
    }

    function setExcluded(address account, bool excluded) external onlyController {
        if (account == address(0) || account == DEAD || account == address(this)) {
            if (!excluded) revert AccountExcluded();
        }
        if (isExcluded[account] == excluded) return;
        if (excluded) _setShare(account, 0);
        isExcluded[account] = excluded;
        emit ExclusionUpdated(account, excluded);
    }

    function setHolderShare(address account, uint256 balance)
        external
        onlyController
    {
        if (mode != Mode.Holder) revert InvalidMode();
        _setShare(account, balance >= minimumShare ? balance : 0);
    }

    /// @notice LP rewards use custody-backed shares. This prevents temporary
    /// flash-loan balances or stale pair snapshots from claiming rewards.
    function stakeLP(uint256 amount) external nonReentrant {
        if (mode != Mode.LiquidityProvider) revert InvalidMode();
        if (!assetConfigured || amount == 0 || isExcluded[msg.sender]) {
            revert AccountExcluded();
        }
        uint256 beforeBalance = IERC20Minimal(shareAsset).balanceOf(address(this));
        _safeTransferFrom(shareAsset, msg.sender, address(this), amount);
        uint256 received = IERC20Minimal(shareAsset).balanceOf(address(this)) - beforeBalance;
        uint256 next = shares[msg.sender] + received;
        if (received == 0 || next < minimumShare) revert ShareBelowMinimum();
        _setShare(msg.sender, next);
        emit LPStaked(msg.sender, received);
    }

    function withdrawLP(uint256 amount, address recipient) external nonReentrant {
        if (mode != Mode.LiquidityProvider) revert InvalidMode();
        if (recipient == address(0) || recipient == DEAD) revert InvalidAddress();
        uint256 previous = shares[msg.sender];
        if (amount == 0 || amount > previous) revert TokenTransferFailed();
        uint256 remaining = previous - amount;
        if (remaining != 0 && remaining < minimumShare) revert ShareBelowMinimum();
        _setShare(msg.sender, remaining);
        _safeTransfer(shareAsset, recipient, amount);
        emit LPWithdrawn(msg.sender, recipient, amount);
    }

    /// @notice Accounts the actual reward-token balance increase. This also
    /// supports fee-on-transfer reward tokens and direct donations.
    function syncRewards() public nonReentrant returns (uint256 amount) {
        uint256 accounted = totalRewardsReceived - totalRewardsClaimed;
        uint256 current = rewardToken.balanceOf(address(this));
        if (current <= accounted) return 0;
        amount = current - accounted;
        totalRewardsReceived += amount;
        if (totalShares == 0) {
            pendingRewards += amount;
        } else {
            uint256 distributable = amount + pendingRewards;
            pendingRewards = 0;
            rewardPerShare += distributable * MAGNITUDE / totalShares;
        }
        emit RewardsSynchronized(msg.sender, amount);
    }

    function claimable(address account) public view returns (uint256) {
        int256 accumulated =
            int256(rewardPerShare * shares[account]) + rewardCorrection[account];
        if (accumulated <= 0) return 0;
        uint256 earned = uint256(accumulated) / MAGNITUDE;
        uint256 claimed = claimedRewards[account];
        return earned > claimed ? earned - claimed : 0;
    }

    function claim(address recipient) external nonReentrant returns (uint256 amount) {
        if (recipient == address(0) || recipient == DEAD) revert InvalidAddress();
        amount = claimable(msg.sender);
        if (amount == 0) return 0;
        claimedRewards[msg.sender] += amount;
        totalRewardsClaimed += amount;
        _safeTransfer(address(rewardToken), recipient, amount);
        emit RewardsClaimed(msg.sender, recipient, amount);
    }

    function _setShare(address account, uint256 amount) internal {
        if (isExcluded[account]) amount = 0;
        uint256 previous = shares[account];
        if (previous == amount) return;
        shares[account] = amount;
        if (amount > previous) {
            uint256 increase = amount - previous;
            totalShares += increase;
            rewardCorrection[account] -= int256(rewardPerShare * increase);
        } else {
            uint256 decrease = previous - amount;
            totalShares -= decrease;
            rewardCorrection[account] += int256(rewardPerShare * decrease);
        }
        if (totalShares != 0 && pendingRewards != 0) {
            uint256 queued = pendingRewards;
            pendingRewards = 0;
            rewardPerShare += queued * MAGNITUDE / totalShares;
        }
        emit ShareUpdated(account, previous, amount);
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount)
        internal
    {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
