// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20RewardShare {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool);
}

/// @title BNBX pull-based reward vault
/// @notice Accounts rewards without looping over holders. Holder-reward tokens
/// update shares on transfers; LP-reward accounts are synchronized against the
/// Pancake pair before claiming.
contract BNBXRewardVault {
    enum Mode {
        Holder,
        LiquidityProvider
    }

    uint256 private constant MAGNITUDE = 1e36;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    Mode public immutable mode;
    address public immutable controller;
    address public shareAsset;
    bool public assetConfigured;

    uint256 public totalShares;
    uint256 public totalRewardsReceived;
    uint256 public totalRewardsClaimed;
    uint256 public rewardPerShare;
    uint256 public pendingRewards;

    mapping(address account => uint256 amount) public shares;
    mapping(address account => int256 amount) private rewardCorrection;
    mapping(address account => uint256 amount) public claimedRewards;
    mapping(address account => bool excluded) public isExcluded;

    error OnlyController();
    error InvalidAddress();
    error AssetAlreadyConfigured();
    error HolderModeRequiresControllerSync();
    error RewardTransferFailed();
    error ShareTransferFailed();
    error AccountExcluded();

    event ShareAssetConfigured(address indexed asset);
    event ExclusionUpdated(address indexed account, bool excluded);
    event ShareUpdated(address indexed account, uint256 previous, uint256 current);
    event RewardsDeposited(address indexed sender, uint256 amount);
    event RewardsClaimed(address indexed account, address indexed recipient, uint256 amount);
    event LPStaked(address indexed account, uint256 amount);
    event LPWithdrawn(address indexed account, uint256 amount);

    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }

    constructor(Mode mode_, address controller_) {
        if (controller_ == address(0)) revert InvalidAddress();
        mode = mode_;
        controller = controller_;
        isExcluded[address(0)] = true;
        isExcluded[DEAD] = true;
        isExcluded[address(this)] = true;
    }

    receive() external payable {
        _deposit(msg.value);
    }

    function configureShareAsset(address asset) external onlyController {
        if (assetConfigured) revert AssetAlreadyConfigured();
        if (asset == address(0)) revert InvalidAddress();
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

    function setHolderShare(address account, uint256 amount)
        external
        onlyController
    {
        if (mode != Mode.Holder) revert HolderModeRequiresControllerSync();
        _setShare(account, amount);
    }

    /// @notice Stakes user-added Pancake LP. The burned graduation LP cannot
    /// enter this vault, and shares always match the LP held in custody.
    function stakeLP(uint256 amount) external {
        if (mode != Mode.LiquidityProvider) {
            revert HolderModeRequiresControllerSync();
        }
        if (!assetConfigured) revert InvalidAddress();
        if (amount == 0 || isExcluded[msg.sender]) revert AccountExcluded();
        uint256 previous = shares[msg.sender];
        if (
            !IERC20RewardShare(shareAsset).transferFrom(
                msg.sender, address(this), amount
            )
        ) revert ShareTransferFailed();
        _setShare(msg.sender, previous + amount);
        emit LPStaked(msg.sender, amount);
    }

    function withdrawLP(uint256 amount, address recipient) external {
        if (mode != Mode.LiquidityProvider) {
            revert HolderModeRequiresControllerSync();
        }
        if (recipient == address(0)) revert InvalidAddress();
        uint256 previous = shares[msg.sender];
        if (amount == 0 || amount > previous) revert ShareTransferFailed();
        _setShare(msg.sender, previous - amount);
        if (!IERC20RewardShare(shareAsset).transfer(recipient, amount)) {
            revert ShareTransferFailed();
        }
        emit LPWithdrawn(msg.sender, amount);
    }

    function depositRewards() external payable {
        _deposit(msg.value);
    }

    function claimable(address account) public view returns (uint256) {
        int256 accumulated =
            int256(rewardPerShare * shares[account]) + rewardCorrection[account];
        if (accumulated <= 0) return 0;
        uint256 earned = uint256(accumulated) / MAGNITUDE;
        uint256 claimed = claimedRewards[account];
        return earned > claimed ? earned - claimed : 0;
    }

    function claim(address payable recipient) external returns (uint256 amount) {
        if (recipient == address(0)) revert InvalidAddress();
        amount = claimable(msg.sender);
        if (amount == 0) return 0;
        claimedRewards[msg.sender] += amount;
        totalRewardsClaimed += amount;
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert RewardTransferFailed();
        emit RewardsClaimed(msg.sender, recipient, amount);
    }

    function _deposit(uint256 amount) internal {
        if (amount == 0) return;
        totalRewardsReceived += amount;
        if (totalShares == 0) {
            pendingRewards += amount;
            emit RewardsDeposited(msg.sender, amount);
            return;
        }
        uint256 distributable = amount + pendingRewards;
        pendingRewards = 0;
        rewardPerShare += distributable * MAGNITUDE / totalShares;
        emit RewardsDeposited(msg.sender, amount);
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
}
