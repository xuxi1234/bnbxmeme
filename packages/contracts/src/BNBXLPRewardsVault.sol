// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";

interface ILPRewardsPair is IERC20Minimal {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function totalSupply() external view returns (uint256);
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @title BNBX LP Rewards V2 custody-backed reward vault
contract BNBXLPRewardsVault {
    uint256 private constant MAGNITUDE = 1e36;
    uint256 public constant MAX_PROCESS_GAS = 500_000;
    uint256 private constant TOKEN_CALL_GAS = 100_000;
    uint256 private constant PROCESS_GAS_RESERVE = 35_000;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    address public immutable controller;
    ILPRewardsPair public immutable pair;
    address public immutable wbnb;
    IERC20Minimal public immutable rewardToken;
    address public immutable router;
    address public immutable factory;
    address public immutable deployer;
    address public immutable curve;
    uint256 public immutable minimumWbnbValue;

    mapping(address account => uint256 amount) public stakedLP;
    mapping(address account => bool excluded) public isExcluded;
    uint256 public totalStakedLP;
    uint256 public totalRewardsReceived;
    uint256 public totalRewardsClaimed;
    uint256 public rewardPerShare;
    uint256 public pendingRewards;
    uint256 public nextProcessIndex;
    uint256 public automaticCycleRemaining;
    bool public automaticProcessingPending;
    mapping(address account => int256 amount) private rewardCorrection;
    mapping(address account => uint256 amount) public claimedRewards;
    address[] private eligibleAccounts;
    mapping(address account => uint256 indexPlusOne) private eligibleIndex;
    uint256 private unlocked = 1;

    error InvalidAddress();
    error AccountExcluded();
    error InvalidAmount();
    error PositionBelowMinimum();
    error TokenTransferFailed();
    error InvalidPair();
    error Reentrancy();

    event LPStaked(address indexed account, uint256 amount, uint256 wbnbValue);
    event LPWithdrawn(
        address indexed account,
        address indexed recipient,
        uint256 amount,
        uint256 remainingWbnbValue
    );
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

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address controller_,
        address pair_,
        address wbnb_,
        address rewardToken_,
        address router_,
        address factory_,
        address deployer_,
        address curve_,
        uint256 minimumWbnbValue_
    ) {
        if (
            controller_ == address(0) || controller_ == DEAD
                || pair_ == address(0) || pair_.code.length == 0
                || wbnb_ == address(0) || rewardToken_ == address(0)
                || rewardToken_.code.length == 0 || router_ == address(0)
                || factory_ == address(0) || deployer_ == address(0)
                || curve_ == address(0) || minimumWbnbValue_ == 0
        ) revert InvalidAddress();
        ILPRewardsPair pairContract = ILPRewardsPair(pair_);
        if (
            pairContract.token0() != wbnb_ && pairContract.token1() != wbnb_
        ) revert InvalidPair();

        controller = controller_;
        pair = pairContract;
        wbnb = wbnb_;
        rewardToken = IERC20Minimal(rewardToken_);
        router = router_;
        factory = factory_;
        deployer = deployer_;
        curve = curve_;
        minimumWbnbValue = minimumWbnbValue_;

        isExcluded[address(0)] = true;
        isExcluded[DEAD] = true;
        isExcluded[controller_] = true;
        isExcluded[pair_] = true;
        isExcluded[router_] = true;
        isExcluded[factory_] = true;
        isExcluded[deployer_] = true;
        isExcluded[curve_] = true;
        isExcluded[address(this)] = true;
    }

    function wbnbValueOf(address account) public view returns (uint256) {
        return _wbnbValue(stakedLP[account]);
    }

    function stakeLP(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (isExcluded[msg.sender]) revert AccountExcluded();

        uint256 beforeBalance = pair.balanceOf(address(this));
        _safeTransferFrom(address(pair), msg.sender, address(this), amount);
        uint256 received = pair.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert InvalidAmount();

        uint256 next = stakedLP[msg.sender] + received;
        uint256 value = _wbnbValue(next);
        if (value < minimumWbnbValue) revert PositionBelowMinimum();
        _setStake(msg.sender, next);
        emit LPStaked(msg.sender, received, value);
    }

    function withdrawLP(uint256 amount, address recipient) external nonReentrant {
        if (recipient == address(0) || recipient == DEAD) revert InvalidAddress();
        uint256 previous = stakedLP[msg.sender];
        if (amount == 0 || amount > previous) revert InvalidAmount();
        uint256 remaining = previous - amount;
        uint256 remainingValue = _wbnbValue(remaining);
        if (remaining != 0 && remainingValue < minimumWbnbValue) {
            revert PositionBelowMinimum();
        }
        _setStake(msg.sender, remaining);
        _safeTransfer(address(pair), recipient, amount);
        emit LPWithdrawn(msg.sender, recipient, amount, remainingValue);
    }

    function syncRewards() external nonReentrant returns (uint256 amount) {
        uint256 accounted = totalRewardsReceived - totalRewardsClaimed;
        uint256 current = rewardToken.balanceOf(address(this));
        if (current <= accounted) return 0;
        amount = current - accounted;
        totalRewardsReceived += amount;
        if (totalStakedLP == 0) {
            pendingRewards += amount;
        } else {
            uint256 distributable = amount + pendingRewards;
            pendingRewards = 0;
            rewardPerShare += distributable * MAGNITUDE / totalStakedLP;
            _startAutomaticCycle();
        }
        emit RewardsSynchronized(msg.sender, amount);
    }

    function claimable(address account) public view returns (uint256) {
        int256 accumulated =
            int256(rewardPerShare * stakedLP[account]) + rewardCorrection[account];
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
        amount = _claim(msg.sender, recipient);
    }

    function claimFor(address account)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (account == address(0) || account == DEAD) revert InvalidAddress();
        amount = _claim(account, account);
    }

    function eligibleAccountCount() external view returns (uint256) {
        return eligibleAccounts.length;
    }

    function eligibleAccountAt(uint256 index) external view returns (address) {
        return eligibleAccounts[index];
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
            if (stakedLP[account] == 0 && claimable(account) == 0) {
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

    function _setStake(address account, uint256 amount) internal {
        uint256 previous = stakedLP[account];
        if (previous == amount) return;
        stakedLP[account] = amount;
        if (amount > previous) {
            uint256 increase = amount - previous;
            totalStakedLP += increase;
            rewardCorrection[account] -= int256(rewardPerShare * increase);
        } else {
            uint256 decrease = previous - amount;
            totalStakedLP -= decrease;
            rewardCorrection[account] += int256(rewardPerShare * decrease);
        }
        bool releasedPending;
        if (totalStakedLP != 0 && pendingRewards != 0) {
            uint256 queued = pendingRewards;
            pendingRewards = 0;
            rewardPerShare += queued * MAGNITUDE / totalStakedLP;
            releasedPending = true;
        }
        _refreshEligible(account);
        if (releasedPending) _startAutomaticCycle();
    }

    function _claim(address account, address recipient)
        internal
        returns (uint256 amount)
    {
        amount = claimable(account);
        if (amount == 0) return 0;
        claimedRewards[account] += amount;
        totalRewardsClaimed += amount;
        _safeTransfer(address(rewardToken), recipient, amount);
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
        bool eligible = stakedLP[account] != 0 || claimable(account) != 0;
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

    function _wbnbValue(uint256 lpAmount) internal view returns (uint256) {
        if (lpAmount == 0) return 0;
        uint256 supply = pair.totalSupply();
        if (supply == 0) revert InvalidPair();
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        uint256 reserve = pair.token0() == wbnb ? reserve0 : reserve1;
        return lpAmount * reserve / supply;
    }

    function _safeTransfer(address token, address recipient, uint256 amount)
        internal
    {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, recipient, amount)
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransferFrom(
        address token,
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(
                IERC20Minimal.transferFrom.selector, sender, recipient, amount
            )
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
