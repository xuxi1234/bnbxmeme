// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesTypes } from "./FuturesTypes.sol";
import { RiskEngine } from "./RiskEngine.sol";

contract ClearingHouse {
    struct OpenMatchedPairParams {
        address longTrader;
        address shortTrader;
        address taker;
        uint256 longMargin;
        uint256 shortMargin;
        uint256 matchedNotional;
        uint256 takerFee;
    }

    struct CloseMatchedPairParams {
        address longTrader;
        address shortTrader;
        address winner;
        address taker;
        uint256 longMarginReleased;
        uint256 shortMarginReleased;
        uint256 pnlAmount;
        uint256 matchedNotionalReduction;
        uint256 takerFee;
    }

    error ZeroAddress();
    error DependencyHasNoCode();
    error InvalidCap();
    error Unauthorized();
    error Reentrancy();
    error ZeroAmount();
    error CapExceeded();
    error InsufficientBalance();
    error InvalidPair();
    error InvalidMargin();
    error InvalidFee();
    error InvalidReduction();
    error InsufficientCloseProceeds();
    error TokenCallFailed();
    error TokenReturnMalformed();
    error TokenDeltaMismatch();
    error Insolvent();

    address public immutable collateral;
    RiskEngine public immutable riskEngine;
    address public immutable orderBook;
    address public immutable safetyController;
    address public immutable revenueRecipient;

    uint256 public totalLiabilityCap;
    uint256 public accountEquityCap;
    uint256 public matchedOpenInterestCap;

    mapping(address account => uint256) public available;
    mapping(address account => uint256) public lockedMargin;
    mapping(address account => uint256) public claimable;
    mapping(address account => uint256) public liquidationReward;

    uint256 public totalAvailable;
    uint256 public totalLockedMargin;
    uint256 public totalClaimable;
    uint256 public totalLiquidationRewards;
    uint256 public insuranceBalance;
    uint256 public matchedOpenInterest;

    uint256 private _reentrancyState = 1;

    constructor(
        address collateral_,
        address riskEngine_,
        address orderBook_,
        address safetyController_,
        address revenueRecipient_,
        uint256 totalLiabilityCap_,
        uint256 accountEquityCap_,
        uint256 matchedOpenInterestCap_
    ) {
        if (
            collateral_ == address(0) || riskEngine_ == address(0)
                || orderBook_ == address(0) || safetyController_ == address(0)
                || revenueRecipient_ == address(0)
        ) revert ZeroAddress();
        if (collateral_.code.length == 0 || riskEngine_.code.length == 0) {
            revert DependencyHasNoCode();
        }
        if (
            totalLiabilityCap_ == 0 || accountEquityCap_ == 0
                || matchedOpenInterestCap_ == 0
        ) revert InvalidCap();

        collateral = collateral_;
        riskEngine = RiskEngine(riskEngine_);
        orderBook = orderBook_;
        safetyController = safetyController_;
        revenueRecipient = revenueRecipient_;
        totalLiabilityCap = totalLiabilityCap_;
        accountEquityCap = accountEquityCap_;
        matchedOpenInterestCap = matchedOpenInterestCap_;
    }

    modifier nonReentrant() {
        if (_reentrancyState != 1) revert Reentrancy();
        _reentrancyState = 2;
        _;
        _reentrancyState = 1;
    }

    modifier onlyOrderBook() {
        if (msg.sender != orderBook) revert Unauthorized();
        _;
    }

    modifier onlySafetyController() {
        if (msg.sender != safetyController) revert Unauthorized();
        _;
    }

    function totalLiabilities() public view returns (uint256) {
        return totalAvailable + totalLockedMargin + totalClaimable
            + totalLiquidationRewards + insuranceBalance;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _requireLiabilityCapacity(amount);
        _requireAccountCapacity(msg.sender, amount);
        _transferInExact(msg.sender, amount);

        available[msg.sender] += amount;
        totalAvailable += amount;
        _assertSolvent();
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _debitAvailable(msg.sender, amount);
        _transferOutExact(msg.sender, amount);
        _assertSolvent();
    }

    function moveClaimableToAvailable(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (claimable[msg.sender] < amount) revert InsufficientBalance();
        _requireAccountCapacity(msg.sender, amount);

        claimable[msg.sender] -= amount;
        totalClaimable -= amount;
        available[msg.sender] += amount;
        totalAvailable += amount;
        _assertSolvent();
    }

    function moveLiquidationRewardToAvailable(uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (liquidationReward[msg.sender] < amount) {
            revert InsufficientBalance();
        }
        _requireAccountCapacity(msg.sender, amount);

        liquidationReward[msg.sender] -= amount;
        totalLiquidationRewards -= amount;
        available[msg.sender] += amount;
        totalAvailable += amount;
        _assertSolvent();
    }

    function withdrawClaimable(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (claimable[msg.sender] < amount) revert InsufficientBalance();

        claimable[msg.sender] -= amount;
        totalClaimable -= amount;
        _transferOutExact(msg.sender, amount);
        _assertSolvent();
    }

    function withdrawLiquidationReward(uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        if (liquidationReward[msg.sender] < amount) {
            revert InsufficientBalance();
        }

        liquidationReward[msg.sender] -= amount;
        totalLiquidationRewards -= amount;
        _transferOutExact(msg.sender, amount);
        _assertSolvent();
    }

    function fundInsurance(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _requireLiabilityCapacity(amount);
        _transferInExact(msg.sender, amount);

        insuranceBalance += amount;
        _assertSolvent();
    }

    function openMatchedPair(OpenMatchedPairParams calldata params)
        external
        onlyOrderBook
        nonReentrant
    {
        _validateMatchedAccounts(
            params.longTrader, params.shortTrader, params.taker
        );
        if (params.matchedNotional == 0) revert ZeroAmount();
        if (
            params.matchedNotional
                > matchedOpenInterestCap - matchedOpenInterest
        ) revert CapExceeded();

        uint256 minimumMargin = riskEngine.initialMargin(
            params.matchedNotional
        );
        if (
            params.longMargin < minimumMargin
                || params.shortMargin < minimumMargin
        ) revert InvalidMargin();
        uint256 requiredFee = riskEngine.orderFee(
            params.matchedNotional, FuturesTypes.OrderRole.Taker
        );
        if (params.takerFee != requiredFee) revert InvalidFee();

        uint256 longDebit = params.longMargin;
        uint256 shortDebit = params.shortMargin;
        if (params.taker == params.longTrader) {
            longDebit += params.takerFee;
        } else {
            shortDebit += params.takerFee;
        }
        if (
            available[params.longTrader] < longDebit
                || available[params.shortTrader] < shortDebit
        ) revert InsufficientBalance();

        available[params.longTrader] -= longDebit;
        available[params.shortTrader] -= shortDebit;
        totalAvailable -= longDebit + shortDebit;
        lockedMargin[params.longTrader] += params.longMargin;
        lockedMargin[params.shortTrader] += params.shortMargin;
        totalLockedMargin += params.longMargin + params.shortMargin;
        matchedOpenInterest += params.matchedNotional;

        _transferOutExact(revenueRecipient, params.takerFee);
        _assertSolvent();
    }

    function closeMatchedPair(CloseMatchedPairParams calldata params)
        external
        onlyOrderBook
        nonReentrant
    {
        _validateMatchedAccounts(
            params.longTrader, params.shortTrader, params.taker
        );
        if (
            params.winner != params.longTrader
                && params.winner != params.shortTrader
        ) revert InvalidPair();
        if (params.matchedNotionalReduction == 0) revert ZeroAmount();
        if (params.matchedNotionalReduction > matchedOpenInterest) {
            revert InvalidReduction();
        }
        if (
            lockedMargin[params.longTrader] < params.longMarginReleased
                || lockedMargin[params.shortTrader]
                    < params.shortMarginReleased
        ) revert InsufficientBalance();

        uint256 requiredFee = riskEngine.orderFee(
            params.matchedNotionalReduction,
            FuturesTypes.OrderRole.Taker
        );
        if (params.takerFee != requiredFee) revert InvalidFee();

        uint256 longProceeds;
        uint256 shortProceeds;
        if (params.winner == params.longTrader) {
            if (params.pnlAmount > params.shortMarginReleased) {
                revert InsufficientBalance();
            }
            longProceeds = params.longMarginReleased + params.pnlAmount;
            shortProceeds = params.shortMarginReleased - params.pnlAmount;
        } else {
            if (params.pnlAmount > params.longMarginReleased) {
                revert InsufficientBalance();
            }
            longProceeds = params.longMarginReleased - params.pnlAmount;
            shortProceeds = params.shortMarginReleased + params.pnlAmount;
        }
        if (params.taker == params.longTrader) {
            if (longProceeds < params.takerFee) {
                revert InsufficientCloseProceeds();
            }
            longProceeds -= params.takerFee;
        } else {
            if (shortProceeds < params.takerFee) {
                revert InsufficientCloseProceeds();
            }
            shortProceeds -= params.takerFee;
        }

        lockedMargin[params.longTrader] -= params.longMarginReleased;
        lockedMargin[params.shortTrader] -= params.shortMarginReleased;
        totalLockedMargin -=
            params.longMarginReleased + params.shortMarginReleased;
        matchedOpenInterest -= params.matchedNotionalReduction;
        _creditReusableOrClaimable(params.longTrader, longProceeds);
        _creditReusableOrClaimable(params.shortTrader, shortProceeds);

        _transferOutExact(revenueRecipient, params.takerFee);
        _assertSolvent();
    }

    function allocateRoundingResidual(address account, uint256 amount)
        external
        onlyOrderBook
        nonReentrant
    {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (lockedMargin[account] <= amount) revert InsufficientBalance();

        lockedMargin[account] -= amount;
        totalLockedMargin -= amount;
        insuranceBalance += amount;
        _assertSolvent();
    }

    function allocateLiquidationPenalty(
        address account,
        address rewardRecipient,
        uint256 requestedPenalty,
        uint256 remainingEquity
    ) external onlyOrderBook nonReentrant {
        if (account == address(0) || rewardRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (requestedPenalty == 0) revert ZeroAmount();
        uint256 penalty = requestedPenalty < remainingEquity
            ? requestedPenalty
            : remainingEquity;
        if (lockedMargin[account] <= penalty) revert InsufficientBalance();

        uint256 reward = (penalty / 5) * 4 + ((penalty % 5) * 4) / 5;
        uint256 insurance = penalty - reward;
        lockedMargin[account] -= penalty;
        totalLockedMargin -= penalty;
        liquidationReward[rewardRecipient] += reward;
        totalLiquidationRewards += reward;
        insuranceBalance += insurance;
        _assertSolvent();
    }

    function coverMatchedLossDeficit(address beneficiary, uint256 amount)
        external
        onlyOrderBook
        nonReentrant
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (insuranceBalance < amount) revert InsufficientBalance();

        insuranceBalance -= amount;
        _creditReusableOrClaimable(beneficiary, amount);
        _assertSolvent();
    }

    function lowerTotalLiabilityCap(uint256 newCap)
        external
        onlySafetyController
        nonReentrant
    {
        if (
            newCap == 0 || newCap >= totalLiabilityCap
                || newCap < totalLiabilities()
        ) revert InvalidCap();
        totalLiabilityCap = newCap;
        _assertSolvent();
    }

    function lowerAccountEquityCap(uint256 newCap)
        external
        onlySafetyController
        nonReentrant
    {
        if (
            newCap == 0 || newCap >= accountEquityCap
                || newCap < totalAvailable + totalLockedMargin
        ) revert InvalidCap();
        accountEquityCap = newCap;
        _assertSolvent();
    }

    function lowerMatchedOpenInterestCap(uint256 newCap)
        external
        onlySafetyController
        nonReentrant
    {
        if (
            newCap == 0 || newCap >= matchedOpenInterestCap
                || newCap < matchedOpenInterest
        ) revert InvalidCap();
        matchedOpenInterestCap = newCap;
        _assertSolvent();
    }

    function _validateMatchedAccounts(
        address longTrader,
        address shortTrader,
        address taker
    ) private pure {
        if (
            longTrader == address(0) || shortTrader == address(0)
                || longTrader == shortTrader
                || (taker != longTrader && taker != shortTrader)
        ) revert InvalidPair();
    }

    function _debitAvailable(address account, uint256 amount) private {
        if (available[account] < amount) revert InsufficientBalance();
        available[account] -= amount;
        totalAvailable -= amount;
    }

    function _creditReusableOrClaimable(address account, uint256 amount)
        private
    {
        uint256 reusableEquity = available[account] + lockedMargin[account];
        uint256 room = accountEquityCap - reusableEquity;
        uint256 reusableCredit = amount < room ? amount : room;
        uint256 claimableCredit = amount - reusableCredit;
        if (reusableCredit != 0) {
            available[account] += reusableCredit;
            totalAvailable += reusableCredit;
        }
        if (claimableCredit != 0) {
            claimable[account] += claimableCredit;
            totalClaimable += claimableCredit;
        }
    }

    function _requireLiabilityCapacity(uint256 amount) private view {
        uint256 liabilities = totalLiabilities();
        if (amount > totalLiabilityCap - liabilities) revert CapExceeded();
    }

    function _requireAccountCapacity(address account, uint256 amount)
        private
        view
    {
        uint256 reusableEquity = available[account] + lockedMargin[account];
        if (amount > accountEquityCap - reusableEquity) revert CapExceeded();
    }

    function _assertSolvent() private view {
        if (_tokenBalance(address(this)) < totalLiabilities()) {
            revert Insolvent();
        }
    }

    function _transferInExact(address payer, uint256 amount) private {
        uint256 houseBefore = _tokenBalance(address(this));
        uint256 payerBefore = _tokenBalance(payer);
        _callTransferFrom(payer, address(this), amount);
        uint256 houseAfter = _tokenBalance(address(this));
        uint256 payerAfter = _tokenBalance(payer);
        if (
            houseAfter != houseBefore + amount
                || payerAfter + amount != payerBefore
        ) revert TokenDeltaMismatch();
    }

    function _transferOutExact(address recipient, uint256 amount) private {
        uint256 houseBefore = _tokenBalance(address(this));
        uint256 recipientBefore = _tokenBalance(recipient);
        _callTransfer(recipient, amount);
        uint256 houseAfter = _tokenBalance(address(this));
        uint256 recipientAfter = _tokenBalance(recipient);
        if (
            houseAfter + amount != houseBefore
                || recipientAfter != recipientBefore + amount
        ) revert TokenDeltaMismatch();
    }

    function _tokenBalance(address account) private view returns (uint256 value) {
        address token = collateral;
        bool success;
        uint256 returnSize;
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, 0x70a08231))
            mstore(add(pointer, 4), account)
            success := staticcall(gas(), token, pointer, 36, pointer, 32)
            returnSize := returndatasize()
            value := mload(pointer)
        }
        if (!success) revert TokenCallFailed();
        if (returnSize != 32) revert TokenReturnMalformed();
    }

    function _callTransfer(address recipient, uint256 amount) private {
        address token = collateral;
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, 0xa9059cbb))
            mstore(add(pointer, 4), recipient)
            mstore(add(pointer, 36), amount)
            success := call(gas(), token, 0, pointer, 68, pointer, 32)
            returnSize := returndatasize()
            returnValue := mload(pointer)
        }
        _validateTransferReturn(success, returnSize, returnValue);
    }

    function _callTransferFrom(address payer, address recipient, uint256 amount)
        private
    {
        address token = collateral;
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, 0x23b872dd))
            mstore(add(pointer, 4), payer)
            mstore(add(pointer, 36), recipient)
            mstore(add(pointer, 68), amount)
            success := call(gas(), token, 0, pointer, 100, pointer, 32)
            returnSize := returndatasize()
            returnValue := mload(pointer)
        }
        _validateTransferReturn(success, returnSize, returnValue);
    }

    function _validateTransferReturn(
        bool success,
        uint256 returnSize,
        uint256 returnValue
    ) private pure {
        if (!success) revert TokenCallFailed();
        if (returnSize == 0) return;
        if (returnSize != 32 || returnValue != 1) {
            revert TokenReturnMalformed();
        }
    }
}
