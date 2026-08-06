// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";

/// @title BNBX Holder V2 reward vault
/// @notice Cumulative holder accounting plus bounded automatic payouts.
contract BNBXHolderRewardsVault {
    uint256 private constant MAGNITUDE = 1e36;
    uint256 public constant MAX_PROCESS_GAS = 500_000;
    uint256 private constant TOKEN_CALL_GAS = 100_000;
    uint256 private constant PROCESS_GAS_RESERVE = 35_000;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    address public immutable controller;
    IERC20Minimal public immutable rewardToken;
    uint256 public immutable minimumShare;
    uint256 public totalShares;
    uint256 public totalRewardsReceived;
    uint256 public totalRewardsClaimed;
    uint256 public rewardPerShare;
    uint256 public pendingRewards;
    uint256 public nextProcessIndex;
    uint256 public automaticCycleRemaining;
    bool public automaticProcessingPending;
    uint256 private unlocked = 1;

    mapping(address => uint256) public shares;
    mapping(address => int256) private rewardCorrection;
    mapping(address => uint256) public claimedRewards;
    mapping(address => bool) public isExcluded;
    address[] private eligibleAccounts;
    mapping(address => uint256) private eligibleIndex;

    error OnlyController();
    error InvalidAddress();
    error TokenTransferFailed();
    error AccountExcluded();
    error Reentrancy();

    event ExclusionUpdated(address indexed account, bool excluded);
    event ShareUpdated(address indexed account, uint256 previous, uint256 current);
    event RewardsSynchronized(address indexed caller, uint256 amount);
    event RewardsClaimed(
        address indexed account, address indexed recipient, uint256 amount
    );
    event AutomaticRewardsProcessed(
        address indexed caller,
        uint256 iterations,
        uint256 claims,
        uint256 nextIndex,
        uint256 gasUsed
    );
    event AutomaticRewardDeferred(address indexed account, uint256 amount);

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

    constructor(address controller_, address rewardToken_, uint256 minimumShare_) {
        if (
            controller_ == address(0) || controller_ == DEAD
                || rewardToken_ == address(0) || rewardToken_ == DEAD
                || rewardToken_.code.length == 0 || minimumShare_ == 0
        ) revert InvalidAddress();
        controller = controller_;
        rewardToken = IERC20Minimal(rewardToken_);
        minimumShare = minimumShare_;
        isExcluded[address(0)] = true;
        isExcluded[DEAD] = true;
        isExcluded[address(this)] = true;
    }

    function setExcluded(address account, bool excluded) external onlyController {
        if (
            account == address(0) || account == DEAD || account == address(this)
        ) {
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
        nonReentrant
    {
        _setShare(account, balance >= minimumShare ? balance : 0);
    }

    function eligibleAccountCount() external view returns (uint256) {
        return eligibleAccounts.length;
    }

    function eligibleAccountAt(uint256 index) external view returns (address) {
        return eligibleAccounts[index];
    }

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
            _startAutomaticCycle();
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

    function claim(address recipient)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (recipient == address(0) || recipient == DEAD) revert InvalidAddress();
        return _claim(msg.sender, recipient);
    }

    function claimFor(address account)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (account == address(0) || account == DEAD) revert InvalidAddress();
        return _claim(account, account);
    }

    function processRewards(uint256 requestedGas)
        external
        nonReentrant
        returns (uint256 iterations, uint256 claims, uint256 cursor)
    {
        uint256 length = eligibleAccounts.length;
        if (length == 0 || requestedGas == 0) {
            return (0, 0, nextProcessIndex);
        }
        uint256 available = gasleft();
        if (available <= PROCESS_GAS_RESERVE) {
            return (0, 0, nextProcessIndex);
        }
        uint256 gasBudget = requestedGas > MAX_PROCESS_GAS
            ? MAX_PROCESS_GAS
            : requestedGas;
        uint256 spendable = available - PROCESS_GAS_RESERVE;
        if (gasBudget > spendable) gasBudget = spendable;

        uint256 startGas = gasleft();
        uint256 index = nextProcessIndex >= length ? 0 : nextProcessIndex;
        uint256 maximumIterations = automaticProcessingPending
            && automaticCycleRemaining < length
            ? automaticCycleRemaining
            : length;
        while (
            eligibleAccounts.length != 0 && iterations < maximumIterations
                && startGas - gasleft() < gasBudget
        ) {
            uint256 used = startGas - gasleft();
            uint256 remainingBudget = gasBudget - used;
            if (remainingBudget <= 20_000) break;
            uint256 callGas = remainingBudget - 20_000;
            if (callGas > TOKEN_CALL_GAS) callGas = TOKEN_CALL_GAS;
            if (index >= eligibleAccounts.length) index = 0;
            address account = eligibleAccounts[index];
            bool removed;
            if (_tryAutomaticClaim(account, callGas)) claims += 1;
            if (shares[account] == 0 && claimable(account) == 0) {
                _removeEligible(account);
                removed = true;
            }
            if (!removed) index += 1;
            iterations += 1;
            if (automaticProcessingPending && automaticCycleRemaining != 0) {
                automaticCycleRemaining -= 1;
            }
        }
        if (automaticProcessingPending && automaticCycleRemaining == 0) {
            automaticProcessingPending = false;
        }
        if (eligibleAccounts.length == 0 || index >= eligibleAccounts.length) {
            index = 0;
        }
        nextProcessIndex = index;
        emit AutomaticRewardsProcessed(
            msg.sender, iterations, claims, index, startGas - gasleft()
        );
        return (iterations, claims, index);
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
        bool releasedPending;
        if (totalShares != 0 && pendingRewards != 0) {
            uint256 queued = pendingRewards;
            pendingRewards = 0;
            rewardPerShare += queued * MAGNITUDE / totalShares;
            releasedPending = true;
        }
        _refreshEligible(account);
        if (releasedPending) _startAutomaticCycle();
        emit ShareUpdated(account, previous, amount);
    }

    function _claim(address account, address recipient)
        internal
        returns (uint256 amount)
    {
        amount = claimable(account);
        if (amount == 0) return 0;
        claimedRewards[account] += amount;
        totalRewardsClaimed += amount;
        _safeTransfer(recipient, amount);
        _refreshEligible(account);
        emit RewardsClaimed(account, recipient, amount);
    }

    function _tryAutomaticClaim(address account, uint256 callGas)
        internal
        returns (bool paid)
    {
        uint256 amount = claimable(account);
        if (amount == 0) return false;
        (bool success, bytes memory result) = address(rewardToken).call{
            gas: callGas
        }(abi.encodeWithSelector(IERC20Minimal.transfer.selector, account, amount));
        success = success
            && (result.length == 0
                || (result.length >= 32 && abi.decode(result, (uint256)) != 0));
        if (!success) {
            emit AutomaticRewardDeferred(account, amount);
            return false;
        }
        claimedRewards[account] += amount;
        totalRewardsClaimed += amount;
        emit RewardsClaimed(account, account, amount);
        return true;
    }

    function _refreshEligible(address account) internal {
        bool eligible = shares[account] != 0 || claimable(account) != 0;
        if (eligible && eligibleIndex[account] == 0) {
            eligibleAccounts.push(account);
            eligibleIndex[account] = eligibleAccounts.length;
        } else if (!eligible && eligibleIndex[account] != 0) {
            _removeEligible(account);
        }
    }

    function _removeEligible(address account) internal {
        uint256 indexPlusOne = eligibleIndex[account];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = eligibleAccounts.length - 1;
        if (index != lastIndex) {
            address moved = eligibleAccounts[lastIndex];
            eligibleAccounts[index] = moved;
            eligibleIndex[moved] = index + 1;
        }
        eligibleAccounts.pop();
        delete eligibleIndex[account];
        if (eligibleAccounts.length == 0) {
            automaticCycleRemaining = 0;
            automaticProcessingPending = false;
        }
        if (nextProcessIndex > eligibleAccounts.length) nextProcessIndex = 0;
    }

    function _startAutomaticCycle() internal {
        uint256 length = eligibleAccounts.length;
        automaticCycleRemaining = length;
        automaticProcessingPending = length != 0;
    }

    function _safeTransfer(address to, uint256 amount) internal {
        (bool success, bytes memory result) = address(rewardToken).call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
