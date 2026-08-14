// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ClearingHouse } from "./ClearingHouse.sol";
import { FuturesTypes } from "./FuturesTypes.sol";
import { RiskEngine } from "./RiskEngine.sol";

interface IMarketStateProvider {
    function marketState() external view returns (FuturesTypes.MarketState);
}

interface IFuturesOracleRead {
    function safeRead()
        external
        view
        returns (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        );
}

contract OrderBook {
    struct Lot {
        uint64 id;
        address longTrader;
        address shortTrader;
        uint128 remainingQuantity;
        uint128 entryPrice;
        uint256 longMargin;
        uint256 shortMargin;
        uint256 remainingOpenInterest;
    }

    struct LotQueue {
        uint64[8] ids;
        uint8 head;
        uint8 count;
    }

    struct ClosePlan {
        uint64[8] ids;
        uint128[8] quantities;
        uint256[8] longMargins;
        uint256[8] shortMargins;
        uint256[8] openInterests;
        uint8 segmentCount;
        uint256 longMargin;
        uint256 shortMargin;
        uint256 openInterest;
        uint256 closeFeeNotional;
        int256 longPnl;
    }

    struct CloseSegment {
        uint64 id;
        uint128 quantity;
        uint256 longMargin;
        uint256 shortMargin;
        uint256 openInterest;
        int256 longPnl;
    }

    struct LiquidationPlan {
        Lot oldLot;
        address survivor;
        bool targetIsLong;
        uint256 targetMargin;
        uint256 survivorMargin;
        uint128 markPrice;
        uint256 newOpenInterest;
        int256 targetPnl;
        uint256 survivorNewMargin;
        uint256 replacementMargin;
    }

    error ZeroAddress();
    error DependencyHasNoCode();
    error DependencyMismatch();
    error Reentrancy();
    error Unauthorized();
    error InvalidOrder();
    error InvalidRole();
    error InvalidPair();
    error InvalidFill();
    error InvalidSignature();
    error Expired();
    error PriceDoesNotCross();
    error ReduceOnlyViolation();
    error CloseOnly();
    error TooManyActiveLots();
    error Cancelled();
    error InsufficientPairedLots();
    error InsufficientCloseProceeds();
    error NonzeroFundingRate();
    error TimestampOverflow();
    error InvalidOracleRead();
    error NotLiquidatable();
    error LiquidationNonceUnavailable();

    uint256 private constant WAD = 1e18;
    uint256 private constant MAX_ORACLE_AGE = 5 minutes;
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 private constant NAME_HASH = keccak256("BNBX Futures");
    bytes32 private constant VERSION_HASH = keccak256("1");

    ClearingHouse public immutable clearingHouse;
    RiskEngine public immutable riskEngine;
    address public immutable marketStateProvider;

    mapping(bytes32 orderHash_ => uint128 quantity) public filled;
    mapping(bytes32 orderHash_ => bool isCancelled) public cancelled;
    mapping(address trader => int256 quantity) public netQuantity;
    mapping(uint64 id => Lot lot) public lots;
    mapping(address trader => LotQueue queue) private _lotQueues;
    mapping(uint64 id => int256 index) private _lotFundingIndices;
    mapping(uint64 id => uint64 updatedAt) private _lotFundingUpdatedAts;
    mapping(address maker => mapping(uint64 nonce => bool used))
        public liquidationNonceUsed;
    mapping(address maker => mapping(uint64 nonce => bool isCancelled))
        public liquidationNonceCancelled;
    uint64 public nextLotId = 1;
    int256 public cumulativeFundingIndex;
    uint64 public fundingUpdatedAt;

    uint256 private _reentrancyState = 1;

    constructor(
        address clearingHouse_,
        address riskEngine_,
        address marketStateProvider_
    ) {
        if (
            clearingHouse_ == address(0) || riskEngine_ == address(0)
                || marketStateProvider_ == address(0)
        ) revert ZeroAddress();
        if (
            clearingHouse_.code.length == 0 || riskEngine_.code.length == 0
        ) revert DependencyHasNoCode();

        ClearingHouse house = ClearingHouse(clearingHouse_);
        if (
            address(house.riskEngine()) != riskEngine_
                || house.orderBook() != address(this)
        ) revert DependencyMismatch();

        clearingHouse = house;
        riskEngine = RiskEngine(riskEngine_);
        marketStateProvider = marketStateProvider_;
        fundingUpdatedAt = _currentTimestamp();
    }

    modifier nonReentrant() {
        if (_reentrancyState != 1) revert Reentrancy();
        _reentrancyState = 2;
        _;
        _reentrancyState = 1;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                FuturesTypes.EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function orderHash(FuturesTypes.Order calldata order)
        public
        view
        returns (bytes32)
    {
        FuturesTypes.Order memory orderCopy = order;
        return keccak256(
            abi.encodePacked(
                hex"1901", domainSeparator(), FuturesTypes.hashOrder(orderCopy)
            )
        );
    }

    function liquidationOrderHash(
        FuturesTypes.LiquidationOrder calldata order
    ) public view returns (bytes32) {
        FuturesTypes.LiquidationOrder memory orderCopy = order;
        return keccak256(
            abi.encodePacked(
                hex"1901",
                domainSeparator(),
                FuturesTypes.hashLiquidationOrder(orderCopy)
            )
        );
    }

    function activeLotCount(address trader) external view returns (uint8) {
        return _lotQueues[trader].count;
    }

    function lotFundingCheckpoint(uint64 lotId)
        external
        view
        returns (int256 index, uint64 updatedAt)
    {
        return (_lotFundingIndices[lotId], _lotFundingUpdatedAts[lotId]);
    }

    function checkpointFunding(int256 rateBps) external nonReentrant {
        _advanceFunding(rateBps);
    }

    function settleFunding(uint64 lotId) external nonReentrant {
        if (lots[lotId].remainingQuantity == 0) {
            revert InsufficientPairedLots();
        }
        _advanceFunding(0);
        _lotFundingIndices[lotId] = cumulativeFundingIndex;
        _lotFundingUpdatedAts[lotId] = fundingUpdatedAt;
    }

    function cancel(FuturesTypes.Order calldata order) external nonReentrant {
        if (msg.sender != order.trader) revert Unauthorized();
        cancelled[orderHash(order)] = true;
    }

    function cancelLiquidationOrder(
        FuturesTypes.LiquidationOrder calldata order
    ) external nonReentrant {
        if (msg.sender != order.maker) revert Unauthorized();
        if (liquidationNonceUsed[order.maker][order.nonce]) {
            revert LiquidationNonceUnavailable();
        }
        liquidationNonceCancelled[order.maker][order.nonce] = true;
    }

    function activeLotId(address trader, uint8 index)
        external
        view
        returns (uint64)
    {
        LotQueue storage queue = _lotQueues[trader];
        if (index >= queue.count) revert InvalidFill();
        return queue.ids[(uint256(queue.head) + index) % 8];
    }

    function matchOrders(
        FuturesTypes.Order calldata maker,
        bytes calldata makerSignature,
        FuturesTypes.Order calldata taker,
        bytes calldata takerSignature,
        uint128 fillQuantity
    ) external nonReentrant {
        _advanceFunding(0);
        (bytes32 makerHash, bytes32 takerHash) = _validateOrders(
            maker,
            makerSignature,
            taker,
            takerSignature,
            fillQuantity
        );
        _matchValidated(maker, taker, fillQuantity, makerHash, takerHash);
    }

    function liquidate(
        uint64 lotId,
        FuturesTypes.LiquidationOrder calldata replacement,
        bytes calldata signature
    ) external nonReentrant {
        _advanceFunding(0);
        LiquidationPlan memory plan;
        plan.oldLot = lots[lotId];
        if (plan.oldLot.remainingQuantity == 0) {
            revert InsufficientPairedLots();
        }
        (
            plan.survivor,
            plan.targetIsLong,
            plan.targetMargin,
            plan.survivorMargin
        ) = _validateLiquidationOrder(plan.oldLot, replacement, signature);
        uint256 markPrice = _currentOracleMark();
        if (
            (plan.targetIsLong && markPrice > replacement.limitPrice)
                || (!plan.targetIsLong && markPrice < replacement.limitPrice)
        ) revert PriceDoesNotCross();
        plan.markPrice = uint128(markPrice);
        plan.newOpenInterest = _executionNotional(
            plan.oldLot.remainingQuantity, plan.markPrice
        );
        (int256 longPnl,) = riskEngine.pairedPnl(
            plan.oldLot.remainingQuantity, plan.oldLot.entryPrice, markPrice
        );
        plan.targetPnl = plan.targetIsLong ? longPnl : -longPnl;
        if (plan.targetPnl >= 0) revert NotLiquidatable();
        int256 targetEquity = int256(plan.targetMargin) + plan.targetPnl;
        if (!riskEngine.isLiquidatable(targetEquity, plan.newOpenInterest)) {
            revert NotLiquidatable();
        }
        if (
            _lotQueues[replacement.maker].count == 8
                || nextLotId == type(uint64).max
        ) revert TooManyActiveLots();

        plan.survivorNewMargin = riskEngine.initialMargin(
            plan.newOpenInterest
        );
        plan.replacementMargin = _marginForLeverage(
            plan.newOpenInterest, replacement.leverage
        );
        _settleLiquidation(plan, replacement, msg.sender);
        _replaceLiquidatedLot(plan, replacement);
        liquidationNonceUsed[replacement.maker][replacement.nonce] = true;
    }

    function _matchValidated(
        FuturesTypes.Order calldata maker,
        FuturesTypes.Order calldata taker,
        uint128 fillQuantity,
        bytes32 makerHash,
        bytes32 takerHash
    ) private {
        int256 signedFill = int256(uint256(fillQuantity));
        int256 makerDelta = maker.side == FuturesTypes.Side.Long
            ? signedFill
            : -signedFill;
        int256 takerDelta = -makerDelta;
        bool makerIncreases = _increasesExposure(
            netQuantity[maker.trader], makerDelta
        );
        bool takerIncreases = _increasesExposure(
            netQuantity[taker.trader], takerDelta
        );
        if (makerIncreases != takerIncreases) revert InvalidPair();
        if (makerIncreases) {
            if (maker.reduceOnly || taker.reduceOnly) {
                revert ReduceOnlyViolation();
            }
            if (
                IMarketStateProvider(marketStateProvider).marketState()
                    == FuturesTypes.MarketState.CloseOnly
            ) revert CloseOnly();
            _openPair(maker, taker, fillQuantity, makerHash, takerHash);
        } else {
            if (
                !_canReduce(netQuantity[maker.trader], makerDelta)
                    || !_canReduce(netQuantity[taker.trader], takerDelta)
            ) revert ReduceOnlyViolation();
            _closePair(maker, taker, fillQuantity, makerHash, takerHash);
        }
    }

    function _openPair(
        FuturesTypes.Order calldata maker,
        FuturesTypes.Order calldata taker,
        uint128 fillQuantity,
        bytes32 makerHash,
        bytes32 takerHash
    ) private {
        int256 quantityDelta = int256(uint256(fillQuantity));
        int256 makerDelta = maker.side == FuturesTypes.Side.Long
            ? quantityDelta
            : -quantityDelta;
        int256 takerDelta = -makerDelta;

        if (
            _lotQueues[maker.trader].count == 8
                || _lotQueues[taker.trader].count == 8
        ) {
            revert TooManyActiveLots();
        }
        if (nextLotId == type(uint64).max) revert TooManyActiveLots();

        Lot memory lot = _accountOpen(maker, taker, fillQuantity);
        uint64 lotId = nextLotId;
        nextLotId = lotId + 1;
        lot.id = lotId;
        lots[lotId] = lot;
        _lotFundingIndices[lotId] = cumulativeFundingIndex;
        _lotFundingUpdatedAts[lotId] = fundingUpdatedAt;
        _pushLot(_lotQueues[maker.trader], lotId);
        _pushLot(_lotQueues[taker.trader], lotId);
        netQuantity[maker.trader] += makerDelta;
        netQuantity[taker.trader] += takerDelta;
        filled[makerHash] += fillQuantity;
        filled[takerHash] += fillQuantity;
    }

    function _closePair(
        FuturesTypes.Order calldata maker,
        FuturesTypes.Order calldata taker,
        uint128 fillQuantity,
        bytes32 makerHash,
        bytes32 takerHash
    ) private {
        bool makerWasLong = netQuantity[maker.trader] > 0;
        address longTrader = makerWasLong ? maker.trader : taker.trader;
        address shortTrader = makerWasLong ? taker.trader : maker.trader;
        ClosePlan memory plan = _buildClosePlan(
            longTrader, shortTrader, fillQuantity, maker.limitPrice
        );
        _settleClose(plan, longTrader, shortTrader, taker.trader);
        _applyClosePlan(plan, longTrader, shortTrader);
        int256 makerDelta = maker.side == FuturesTypes.Side.Long
            ? int256(uint256(fillQuantity))
            : -int256(uint256(fillQuantity));
        netQuantity[maker.trader] += makerDelta;
        netQuantity[taker.trader] -= makerDelta;
        filled[makerHash] += fillQuantity;
        filled[takerHash] += fillQuantity;
    }

    function _settleClose(
        ClosePlan memory plan,
        address longTrader,
        address shortTrader,
        address taker
    ) private {
        uint256 pnlAmount = plan.longPnl < 0
            ? uint256(-plan.longPnl)
            : uint256(plan.longPnl);
        address winner = plan.longPnl < 0 ? shortTrader : longTrader;
        uint256 takerFee = riskEngine.orderFee(
            plan.closeFeeNotional, FuturesTypes.OrderRole.Taker
        );
        _preflightCloseProceeds(
            plan,
            pnlAmount,
            takerFee,
            taker == longTrader
        );

        clearingHouse.closeMatchedPair(
            ClearingHouse.CloseMatchedPairParams({
                longTrader: longTrader,
                shortTrader: shortTrader,
                winner: winner,
                taker: taker,
                longMarginReleased: plan.longMargin,
                shortMarginReleased: plan.shortMargin,
                pnlAmount: pnlAmount,
                closeFeeNotional: plan.closeFeeNotional,
                matchedOpenInterestReduction: plan.openInterest,
                takerFee: takerFee
            })
        );
    }

    function _buildClosePlan(
        address longTrader,
        address shortTrader,
        uint128 fillQuantity,
        uint128 executionPrice
    ) private view returns (ClosePlan memory plan) {
        LotQueue storage longQueue = _lotQueues[longTrader];
        LotQueue storage shortQueue = _lotQueues[shortTrader];
        uint128 remaining = fillQuantity;

        for (uint8 index = 0; index < 8 && remaining != 0; index += 1) {
            if (index >= longQueue.count || index >= shortQueue.count) {
                revert InsufficientPairedLots();
            }
            uint64 longId =
                longQueue.ids[(uint256(longQueue.head) + index) % 8];
            uint64 shortId =
                shortQueue.ids[(uint256(shortQueue.head) + index) % 8];
            if (longId == 0 || longId != shortId) {
                revert InsufficientPairedLots();
            }
            CloseSegment memory segment = _closeSegment(
                longId,
                longTrader,
                shortTrader,
                remaining,
                executionPrice
            );
            plan.ids[index] = segment.id;
            plan.quantities[index] = segment.quantity;
            plan.longMargins[index] = segment.longMargin;
            plan.shortMargins[index] = segment.shortMargin;
            plan.openInterests[index] = segment.openInterest;
            plan.segmentCount = index + 1;
            plan.longMargin += segment.longMargin;
            plan.shortMargin += segment.shortMargin;
            plan.openInterest += segment.openInterest;
            plan.longPnl += segment.longPnl;
            remaining -= segment.quantity;
        }
        if (remaining != 0) revert InsufficientPairedLots();
        plan.closeFeeNotional = _executionNotional(
            fillQuantity, executionPrice
        );
        if (plan.openInterest == 0) revert InvalidFill();
    }

    function _closeSegment(
        uint64 id,
        address longTrader,
        address shortTrader,
        uint128 requestedQuantity,
        uint128 executionPrice
    ) private view returns (CloseSegment memory segment) {
        Lot storage lot = lots[id];
        if (
            lot.longTrader != longTrader || lot.shortTrader != shortTrader
                || lot.remainingQuantity == 0
        ) revert InsufficientPairedLots();

        uint128 quantity = requestedQuantity < lot.remainingQuantity
            ? requestedQuantity
            : lot.remainingQuantity;
        segment.id = id;
        segment.quantity = quantity;
        segment.longMargin = _proportionalRelease(
            lot.longMargin, quantity, lot.remainingQuantity
        );
        segment.shortMargin = _proportionalRelease(
            lot.shortMargin, quantity, lot.remainingQuantity
        );
        segment.openInterest = _proportionalRelease(
            lot.remainingOpenInterest, quantity, lot.remainingQuantity
        );
        (segment.longPnl,) = riskEngine.pairedPnl(
            quantity, lot.entryPrice, executionPrice
        );
    }

    function _preflightCloseProceeds(
        ClosePlan memory plan,
        uint256 pnlAmount,
        uint256 takerFee,
        bool longIsTaker
    ) private pure {
        uint256 longProceeds;
        uint256 shortProceeds;
        if (plan.longPnl < 0) {
            if (pnlAmount > plan.longMargin) {
                revert InsufficientCloseProceeds();
            }
            longProceeds = plan.longMargin - pnlAmount;
            shortProceeds = plan.shortMargin + pnlAmount;
        } else {
            if (pnlAmount > plan.shortMargin) {
                revert InsufficientCloseProceeds();
            }
            longProceeds = plan.longMargin + pnlAmount;
            shortProceeds = plan.shortMargin - pnlAmount;
        }
        if (
            (longIsTaker && takerFee > longProceeds)
                || (!longIsTaker && takerFee > shortProceeds)
        ) revert InsufficientCloseProceeds();
    }

    function _applyClosePlan(
        ClosePlan memory plan,
        address longTrader,
        address shortTrader
    ) private {
        for (uint8 index = 0; index < plan.segmentCount; index += 1) {
            uint64 id = plan.ids[index];
            Lot storage lot = lots[id];
            if (plan.quantities[index] == lot.remainingQuantity) {
                delete lots[id];
                delete _lotFundingIndices[id];
                delete _lotFundingUpdatedAts[id];
                _popLot(_lotQueues[longTrader], id);
                _popLot(_lotQueues[shortTrader], id);
            } else {
                lot.remainingQuantity -= plan.quantities[index];
                lot.longMargin -= plan.longMargins[index];
                lot.shortMargin -= plan.shortMargins[index];
                lot.remainingOpenInterest -= plan.openInterests[index];
                _lotFundingIndices[id] = cumulativeFundingIndex;
                _lotFundingUpdatedAts[id] = fundingUpdatedAt;
            }
        }
    }

    function _advanceFunding(int256 rateBps) private {
        if (rateBps != 0) revert NonzeroFundingRate();
        fundingUpdatedAt = _currentTimestamp();
    }

    function _currentTimestamp() private view returns (uint64 timestamp) {
        if (block.timestamp > type(uint64).max) revert TimestampOverflow();
        timestamp = uint64(block.timestamp);
    }

    function _accountOpen(
        FuturesTypes.Order calldata maker,
        FuturesTypes.Order calldata taker,
        uint128 fillQuantity
    ) private returns (Lot memory lot) {
        uint256 notional = _executionNotional(fillQuantity, maker.limitPrice);

        bool makerIsLong = maker.side == FuturesTypes.Side.Long;
        address longTrader = makerIsLong ? maker.trader : taker.trader;
        address shortTrader = makerIsLong ? taker.trader : maker.trader;
        uint256 longMargin = _marginForLeverage(
            notional, makerIsLong ? maker.leverage : taker.leverage
        );
        uint256 shortMargin = _marginForLeverage(
            notional, makerIsLong ? taker.leverage : maker.leverage
        );
        uint256 takerFee = riskEngine.orderFee(
            notional, FuturesTypes.OrderRole.Taker
        );

        clearingHouse.openMatchedPair(
            ClearingHouse.OpenMatchedPairParams({
                longTrader: longTrader,
                shortTrader: shortTrader,
                taker: taker.trader,
                longMargin: longMargin,
                shortMargin: shortMargin,
                matchedNotional: notional,
                takerFee: takerFee
            })
        );

        lot = Lot({
            id: 0,
            longTrader: longTrader,
            shortTrader: shortTrader,
            remainingQuantity: fillQuantity,
            entryPrice: maker.limitPrice,
            longMargin: longMargin,
            shortMargin: shortMargin,
            remainingOpenInterest: notional
        });
    }

    function _validateOrders(
        FuturesTypes.Order calldata maker,
        bytes calldata makerSignature,
        FuturesTypes.Order calldata taker,
        bytes calldata takerSignature,
        uint128 fillQuantity
    ) private view returns (bytes32 makerHash, bytes32 takerHash) {
        if (
            maker.role != FuturesTypes.OrderRole.Maker
                || taker.role != FuturesTypes.OrderRole.Taker
        ) revert InvalidRole();
        if (
            maker.trader == address(0) || taker.trader == address(0)
                || maker.trader == taker.trader
        ) revert InvalidPair();
        if (
            maker.side == taker.side || maker.quantity == 0
                || taker.quantity == 0 || maker.limitPrice == 0
                || taker.limitPrice == 0 || maker.leverage == 0
                || maker.leverage > 3 || taker.leverage == 0
                || taker.leverage > 3
        ) revert InvalidOrder();
        if (block.timestamp > maker.deadline || block.timestamp > taker.deadline) {
            revert Expired();
        }
        if (
            (
                maker.side == FuturesTypes.Side.Long
                    && maker.limitPrice < taker.limitPrice
            )
                || (
                    taker.side == FuturesTypes.Side.Long
                        && taker.limitPrice < maker.limitPrice
                )
        ) revert PriceDoesNotCross();
        if (fillQuantity == 0) revert InvalidFill();

        makerHash = orderHash(maker);
        takerHash = orderHash(taker);
        if (cancelled[makerHash] || cancelled[takerHash]) revert Cancelled();
        uint128 makerAlreadyFilled = filled[makerHash];
        uint128 takerAlreadyFilled = filled[takerHash];
        if (
            fillQuantity > maker.quantity - makerAlreadyFilled
                || fillQuantity > taker.quantity - takerAlreadyFilled
        ) revert InvalidFill();

        _requireSignature(makerHash, maker.trader, makerSignature);
        _requireSignature(takerHash, taker.trader, takerSignature);
    }

    function _validateLiquidationOrder(
        Lot memory oldLot,
        FuturesTypes.LiquidationOrder calldata replacement,
        bytes calldata signature
    )
        private
        view
        returns (
            address survivor,
            bool targetIsLong,
            uint256 targetMargin,
            uint256 survivorMargin
        )
    {
        if (
            replacement.maker == address(0)
                || replacement.target == address(0)
                || replacement.maker == replacement.target
                || replacement.quantity == 0 || replacement.limitPrice == 0
                || replacement.leverage == 0 || replacement.leverage > 3
        ) revert InvalidOrder();
        if (block.timestamp > replacement.deadline) revert Expired();
        if (replacement.target == oldLot.longTrader) {
            targetIsLong = true;
            survivor = oldLot.shortTrader;
            targetMargin = oldLot.longMargin;
            survivorMargin = oldLot.shortMargin;
        } else if (replacement.target == oldLot.shortTrader) {
            survivor = oldLot.longTrader;
            targetMargin = oldLot.shortMargin;
            survivorMargin = oldLot.longMargin;
        } else {
            revert InvalidPair();
        }
        if (
            replacement.maker == survivor
                || replacement.quantity != oldLot.remainingQuantity
                || uint8(replacement.side) != (targetIsLong ? 0 : 1)
        ) revert InvalidPair();
        int256 makerDelta = replacement.side == FuturesTypes.Side.Long
            ? int256(uint256(replacement.quantity))
            : -int256(uint256(replacement.quantity));
        if (!_increasesExposure(netQuantity[replacement.maker], makerDelta)) {
            revert InvalidPair();
        }
        if (
            liquidationNonceUsed[replacement.maker][replacement.nonce]
                || liquidationNonceCancelled[replacement.maker][replacement.nonce]
        ) revert LiquidationNonceUnavailable();
        _requireSignature(
            liquidationOrderHash(replacement), replacement.maker, signature
        );
    }

    function _currentOracleMark() private view returns (uint256 markPrice) {
        (FuturesTypes.MarketState state, uint256 mark,,, uint256 updatedAt) =
            IFuturesOracleRead(marketStateProvider).safeRead();
        if (
            state != FuturesTypes.MarketState.Open || mark == 0
                || mark > type(uint128).max || updatedAt == 0
                || updatedAt > block.timestamp
                || block.timestamp - updatedAt > MAX_ORACLE_AGE
        ) revert InvalidOracleRead();
        markPrice = mark;
    }

    function _settleLiquidation(
        LiquidationPlan memory plan,
        FuturesTypes.LiquidationOrder calldata replacement,
        address liquidator
    ) private {
        clearingHouse.liquidateAndReplace(
            ClearingHouse.LiquidateAndReplaceParams({
                target: replacement.target,
                survivor: plan.survivor,
                replacementMaker: replacement.maker,
                liquidator: liquidator,
                targetMarginReleased: plan.targetMargin,
                survivorMarginReleased: plan.survivorMargin,
                losingPnl: uint256(-plan.targetPnl),
                oldOpenInterest: plan.oldLot.remainingOpenInterest,
                newOpenInterest: plan.newOpenInterest,
                survivorNewMargin: plan.survivorNewMargin,
                replacementMargin: plan.replacementMargin
            })
        );
    }

    function _replaceLiquidatedLot(
        LiquidationPlan memory plan,
        FuturesTypes.LiquidationOrder calldata replacement
    ) private {
        Lot memory oldLot = plan.oldLot;
        uint64 oldId = oldLot.id;
        delete lots[oldId];
        delete _lotFundingIndices[oldId];
        delete _lotFundingUpdatedAts[oldId];
        _removeLot(_lotQueues[oldLot.longTrader], oldId);
        _removeLot(_lotQueues[oldLot.shortTrader], oldId);

        int256 quantity = int256(uint256(oldLot.remainingQuantity));
        if (replacement.side == FuturesTypes.Side.Long) {
            netQuantity[replacement.target] -= quantity;
            netQuantity[replacement.maker] += quantity;
        } else {
            netQuantity[replacement.target] += quantity;
            netQuantity[replacement.maker] -= quantity;
        }

        uint64 newId = nextLotId;
        nextLotId = newId + 1;
        bool replacementIsLong = replacement.side == FuturesTypes.Side.Long;
        Lot memory newLot = Lot({
            id: newId,
            longTrader: replacementIsLong
                ? replacement.maker
                : plan.survivor,
            shortTrader: replacementIsLong
                ? plan.survivor
                : replacement.maker,
            remainingQuantity: oldLot.remainingQuantity,
            entryPrice: plan.markPrice,
            longMargin: replacementIsLong
                ? plan.replacementMargin
                : plan.survivorNewMargin,
            shortMargin: replacementIsLong
                ? plan.survivorNewMargin
                : plan.replacementMargin,
            remainingOpenInterest: plan.newOpenInterest
        });
        lots[newId] = newLot;
        _lotFundingIndices[newId] = cumulativeFundingIndex;
        _lotFundingUpdatedAts[newId] = fundingUpdatedAt;
        _pushLot(_lotQueues[plan.survivor], newId);
        _pushLot(_lotQueues[replacement.maker], newId);
    }

    function _requireSignature(
        bytes32 digest,
        address expectedSigner,
        bytes calldata signature
    ) private pure {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > SECP256K1N_HALF) revert InvalidSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != expectedSigner) {
            revert InvalidSignature();
        }
    }

    function _marginForLeverage(uint256 notional, uint8 leverage)
        private
        view
        returns (uint256)
    {
        uint256 leverageMargin = notional / leverage;
        if (notional % leverage != 0) leverageMargin += 1;
        uint256 minimumMargin = riskEngine.initialMargin(notional);
        return leverageMargin > minimumMargin ? leverageMargin : minimumMargin;
    }

    function _executionNotional(uint128 quantity, uint128 price)
        private
        pure
        returns (uint256 notional)
    {
        uint256 product = uint256(quantity) * uint256(price);
        notional = product / WAD;
        if (product % WAD != 0) notional += 1;
    }

    function _increasesExposure(int256 current, int256 delta)
        private
        pure
        returns (bool)
    {
        return current == 0 || (current > 0) == (delta > 0);
    }

    function _canReduce(int256 current, int256 delta)
        private
        pure
        returns (bool)
    {
        if (current == 0 || (current > 0) == (delta > 0)) return false;
        uint256 currentMagnitude = current > 0
            ? uint256(current)
            : uint256(-current);
        uint256 deltaMagnitude = delta > 0
            ? uint256(delta)
            : uint256(-delta);
        return deltaMagnitude <= currentMagnitude;
    }

    function _proportionalRelease(
        uint256 amount,
        uint128 quantity,
        uint128 remainingQuantity
    ) private view returns (uint256) {
        if (quantity == remainingQuantity) return amount;
        return riskEngine.mulDiv(amount, quantity, remainingQuantity);
    }

    function _pushLot(LotQueue storage queue, uint64 lotId) private {
        uint256 tail = (uint256(queue.head) + queue.count) % 8;
        queue.ids[tail] = lotId;
        queue.count += 1;
    }

    function _popLot(LotQueue storage queue, uint64 expectedId) private {
        uint8 head = queue.head;
        if (queue.count == 0 || queue.ids[head] != expectedId) {
            revert InsufficientPairedLots();
        }
        queue.ids[head] = 0;
        queue.head = uint8((uint256(head) + 1) % 8);
        queue.count -= 1;
    }

    function _removeLot(LotQueue storage queue, uint64 expectedId) private {
        uint8 count = queue.count;
        uint8 found = type(uint8).max;
        for (uint8 index = 0; index < count; index += 1) {
            if (queue.ids[(uint256(queue.head) + index) % 8] == expectedId) {
                found = index;
                break;
            }
        }
        if (found == type(uint8).max) revert InsufficientPairedLots();
        for (uint8 index = found; index + 1 < count; index += 1) {
            uint256 current = (uint256(queue.head) + index) % 8;
            uint256 next = (current + 1) % 8;
            queue.ids[current] = queue.ids[next];
        }
        uint256 tail = (uint256(queue.head) + count - 1) % 8;
        queue.ids[tail] = 0;
        queue.count = count - 1;
    }
}
