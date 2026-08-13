// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesTypes } from "./FuturesTypes.sol";

contract FuturesOracle {
    enum ObservationStoreResult {
        NotStored,
        Stored,
        Invalid
    }

    struct Observation {
        uint256 cumulativePrice;
        uint64 observedAt;
    }

    struct AcceptedMark {
        uint256 markPriceWad;
        uint256 twapBnbPerTokenWad;
        uint256 bnbUsdWad;
        uint64 updatedAt;
    }

    error ZeroAddress();
    error DependencyHasNoCode();
    error PairMismatch();
    error Unauthorized();
    error InvalidDeviation();

    uint32 private constant TOKEN0_SELECTOR = 0x0dfe1681;
    uint32 private constant TOKEN1_SELECTOR = 0xd21220a7;
    uint32 private constant GET_RESERVES_SELECTOR = 0x0902f1ac;
    uint32 private constant PRICE0_CUMULATIVE_SELECTOR = 0x5909c0d5;
    uint32 private constant PRICE1_CUMULATIVE_SELECTOR = 0x5a3d5493;
    uint32 private constant DECIMALS_SELECTOR = 0x313ce567;
    uint32 private constant LATEST_ROUND_DATA_SELECTOR = 0xfeaf968c;
    uint256 private constant WAD = 1e18;
    uint256 private constant Q112 = 1 << 112;
    uint256 private constant BPS = 10_000;
    uint256 private constant OBSERVATION_SPACING = 5 minutes;
    uint256 private constant INTERMEDIATE_AGE = 15 minutes;
    uint256 private constant WINDOW_AGE = 30 minutes;
    uint256 private constant MAX_FEED_AGE = 5 minutes;
    uint256 private constant MAX_MARK_AGE = 5 minutes;
    uint8 private constant OBSERVATION_CAPACITY = 7;
    uint256 private constant TOKEN0_CALL_GAS = 30_000;
    uint256 private constant TOKEN1_CALL_GAS = 30_000;
    uint256 private constant TOKEN_DECIMALS_CALL_GAS = 30_000;
    uint256 private constant GET_RESERVES_CALL_GAS = 40_000;
    uint256 private constant PRICE0_CUMULATIVE_CALL_GAS = 30_000;
    uint256 private constant PRICE1_CUMULATIVE_CALL_GAS = 30_000;
    uint256 private constant FEED_DECIMALS_CALL_GAS = 30_000;
    uint256 private constant LATEST_ROUND_DATA_CALL_GAS = 100_000;
    uint256 private constant CALLER_GAS_RESERVE = 250_000;

    address public immutable pair;
    address public immutable bnbUsdFeed;
    address public immutable bnbxToken;
    address public immutable wbnbToken;
    address public immutable guardian;
    bool public immutable bnbxIsToken0;

    uint16 public maxDeviationBps = 1_000;
    bool public forcedClose;

    Observation[OBSERVATION_CAPACITY] private _observations;
    uint8 private _observationHead;
    uint8 private _observationCount;
    AcceptedMark private _accepted;
    bool private _acceptanceFault;
    bool private _rebuilding;

    constructor(
        address pair_,
        address bnbUsdFeed_,
        address bnbxToken_,
        address wbnbToken_,
        address guardian_
    ) {
        if (
            pair_ == address(0) || bnbUsdFeed_ == address(0)
                || bnbxToken_ == address(0) || wbnbToken_ == address(0)
                || guardian_ == address(0)
        ) revert ZeroAddress();
        if (bnbxToken_ == wbnbToken_) revert PairMismatch();
        if (
            pair_.code.length == 0 || bnbUsdFeed_.code.length == 0
                || bnbxToken_.code.length == 0 || wbnbToken_.code.length == 0
        ) revert DependencyHasNoCode();

        (bool identityValid, address token0_, address token1_) =
            _readPairIdentity(pair_);
        if (!identityValid) revert PairMismatch();
        if (!_tokenDecimalsValid(bnbxToken_, wbnbToken_)) {
            revert PairMismatch();
        }
        bool forward = token0_ == bnbxToken_ && token1_ == wbnbToken_;
        bool reverse = token0_ == wbnbToken_ && token1_ == bnbxToken_;
        if (!forward && !reverse) revert PairMismatch();

        pair = pair_;
        bnbUsdFeed = bnbUsdFeed_;
        bnbxToken = bnbxToken_;
        wbnbToken = wbnbToken_;
        guardian = guardian_;
        bnbxIsToken0 = forward;
    }

    function marketState() external view returns (FuturesTypes.MarketState) {
        (FuturesTypes.MarketState state,,,,) = safeRead();
        return state;
    }

    function safeRead()
        public
        view
        returns (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        )
    {
        AcceptedMark memory accepted = _accepted;
        if (
            forcedClose || _acceptanceFault || accepted.updatedAt == 0
                || block.timestamp < accepted.updatedAt
                || block.timestamp - accepted.updatedAt > MAX_MARK_AGE
        ) return _closeOnlyResult();
        (bool pairValid,) = _currentCumulativePrice();
        (bool feedValid, uint256 liveBnbUsdWad) = _readBnbUsdWad();
        if (!pairValid || !feedValid) return _closeOnlyResult();
        (bool liveMarkValid, uint256 liveMarkWad) = _tryMulDiv(
            accepted.twapBnbPerTokenWad, liveBnbUsdWad, WAD
        );
        if (
            !liveMarkValid
                || !_withinDeviation(
                    liveMarkWad, accepted.markPriceWad, maxDeviationBps
                )
        ) return _closeOnlyResult();
        return (
            FuturesTypes.MarketState.Open,
            accepted.markPriceWad,
            accepted.twapBnbPerTokenWad,
            accepted.bnbUsdWad,
            accepted.updatedAt
        );
    }

    function forceCloseOnly() external {
        if (msg.sender != guardian) revert Unauthorized();
        forcedClose = true;
    }

    function lowerMaxDeviationBps(uint16 newBps) external {
        if (msg.sender != guardian) revert Unauthorized();
        if (newBps == 0 || newBps >= maxDeviationBps) {
            revert InvalidDeviation();
        }
        maxDeviationBps = newBps;
    }

    function update()
        external
        returns (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        )
    {
        if (!_advance()) return _closeOnlyResult();
        return safeRead();
    }

    function _advance() private returns (bool mayReturnStoredMark) {
        if (forcedClose) {
            _clearObservations();
            return false;
        }
        (bool pairValid, uint256 cumulativePrice) = _currentCumulativePrice();
        (bool feedValid, uint256 candidateBnbUsdWad) = _readBnbUsdWad();
        if (!pairValid || !feedValid || block.timestamp > type(uint64).max) {
            _clearObservations();
            _rebuilding = true;
            return false;
        }

        uint64 observedAt = uint64(block.timestamp);
        AcceptedMark memory accepted = _accepted;
        ObservationStoreResult storeResult =
            _storeObservation(cumulativePrice, observedAt);
        if (storeResult == ObservationStoreResult.Invalid) {
            _acceptanceFault = true;
            _rebuilding = true;
            _clearObservations();
            return false;
        }
        if (storeResult == ObservationStoreResult.NotStored) {
            return true;
        }
        if (_observationCount == OBSERVATION_CAPACITY) {
            return _acceptStoredWindow(candidateBnbUsdWad);
        }

        if (
            accepted.updatedAt != 0
                && observedAt - accepted.updatedAt > MAX_MARK_AGE && !_rebuilding
        ) {
            _clearObservations();
            _rebuilding = true;
            _storeObservation(cumulativePrice, observedAt);
            return false;
        }
        return true;
    }

    function _acceptStoredWindow(uint256 candidateBnbUsdWad)
        private
        returns (bool accepted)
    {
        Observation memory current = _observationAt(
            _observationCount - 1
        );
        (
            bool windowValid,
            Observation memory baseline,
            uint256 elapsed
        ) = _selectWindow(current);
        if (!windowValid) {
            _latchRebuild(current);
            return false;
        }

        (
            bool candidateValid,
            uint256 candidateTwapWad,
            uint256 candidateMarkWad
        ) = _candidatePrice(
            baseline,
            current.cumulativePrice,
            elapsed,
            candidateBnbUsdWad
        );
        if (
            !candidateValid
                || !_withinDeviation(
                    candidateMarkWad,
                    _accepted.markPriceWad,
                    maxDeviationBps
                )
        ) {
            _latchRebuild(current);
            return false;
        }

        _accepted = AcceptedMark(
            candidateMarkWad,
            candidateTwapWad,
            candidateBnbUsdWad,
            current.observedAt
        );
        _acceptanceFault = false;
        _rebuilding = false;
        return true;
    }

    function _latchRebuild(Observation memory current) private {
        _acceptanceFault = true;
        _rebuilding = true;
        _clearObservations();
        _storeObservation(current.cumulativePrice, current.observedAt);
    }

    function _storeObservation(uint256 cumulativePrice, uint64 observedAt)
        private
        returns (ObservationStoreResult result)
    {
        uint8 count = _observationCount;
        if (count != 0) {
            Observation memory newest = _observationAt(count - 1);
            if (observedAt <= newest.observedAt) {
                return ObservationStoreResult.NotStored;
            }
            if (observedAt - newest.observedAt < OBSERVATION_SPACING) {
                return ObservationStoreResult.NotStored;
            }
            if (!_physicalCumulativeDeltaValid(newest, cumulativePrice, observedAt)) {
                return ObservationStoreResult.Invalid;
            }
        }

        if (count < OBSERVATION_CAPACITY) {
            uint8 index = uint8(
                (uint256(_observationHead) + count) % OBSERVATION_CAPACITY
            );
            _observations[index] = Observation(cumulativePrice, observedAt);
            _observationCount = count + 1;
        } else {
            uint8 head = _observationHead;
            _observations[head] = Observation(cumulativePrice, observedAt);
            _observationHead = uint8(
                (uint256(head) + 1) % OBSERVATION_CAPACITY
            );
        }
        return ObservationStoreResult.Stored;
    }

    function _physicalCumulativeDeltaValid(
        Observation memory previous,
        uint256 cumulativePrice,
        uint64 observedAt
    ) private pure returns (bool) {
        uint256 elapsed = observedAt - previous.observedAt;
        if (elapsed > type(uint32).max) return false;
        uint256 cumulativeDelta;
        unchecked {
            cumulativeDelta = cumulativePrice - previous.cumulativePrice;
        }
        uint256 maximumPriceX112 = uint256(type(uint112).max) << 112;
        return cumulativeDelta <= maximumPriceX112 * elapsed;
    }

    function _selectWindow(Observation memory current)
        private
        view
        returns (
            bool valid,
            Observation memory baseline,
            uint256 elapsed
        )
    {
        uint8 count = _observationCount;
        if (count < OBSERVATION_CAPACITY) return (false, baseline, 0);

        for (uint8 i = count - 1; i > 0; --i) {
            Observation memory candidate = _observationAt(i - 1);
            if (candidate.observedAt >= current.observedAt) {
                return (false, baseline, 0);
            }
            uint256 candidateElapsed =
                current.observedAt - candidate.observedAt;
            if (candidateElapsed >= WINDOW_AGE) {
                baseline = candidate;
                elapsed = candidateElapsed;
                bool hasIntermediate;
                for (uint8 j = i; j < count - 1; ++j) {
                    Observation memory intermediate = _observationAt(j);
                    if (
                        intermediate.observedAt > baseline.observedAt
                            && intermediate.observedAt - baseline.observedAt
                                >= INTERMEDIATE_AGE
                            && current.observedAt - intermediate.observedAt
                                >= INTERMEDIATE_AGE
                    ) {
                        hasIntermediate = true;
                        break;
                    }
                }
                return (
                    hasIntermediate && elapsed <= type(uint32).max,
                    baseline,
                    elapsed
                );
            }
        }
        return (false, baseline, 0);
    }

    function _observationAt(uint8 logicalIndex)
        private
        view
        returns (Observation memory)
    {
        return _observations[
            (uint256(_observationHead) + logicalIndex) % OBSERVATION_CAPACITY
        ];
    }

    function _candidatePrice(
        Observation memory baseline,
        uint256 cumulativePrice,
        uint256 elapsed,
        uint256 candidateBnbUsdWad
    ) private pure returns (bool valid, uint256 twapWad, uint256 markWad) {
        uint256 cumulativeDelta;
        unchecked {
            cumulativeDelta = cumulativePrice - baseline.cumulativePrice;
        }
        uint256 averagePriceX112 = cumulativeDelta / elapsed;
        (bool twapValid, uint256 candidateTwapWad) =
            _tryMulDiv(averagePriceX112, WAD, Q112);
        if (!twapValid || candidateTwapWad == 0) return (false, 0, 0);
        (bool markValid, uint256 candidateMarkWad) =
            _tryMulDiv(candidateTwapWad, candidateBnbUsdWad, WAD);
        if (!markValid || candidateMarkWad == 0) return (false, 0, 0);
        return (true, candidateTwapWad, candidateMarkWad);
    }

    function _clearObservations() private {
        for (uint8 i = 0; i < OBSERVATION_CAPACITY; ++i) {
            delete _observations[i];
        }
        _observationHead = 0;
        _observationCount = 0;
    }

    function _closeOnlyResult()
        private
        pure
        returns (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        )
    {
        return (FuturesTypes.MarketState.CloseOnly, 0, 0, 0, 0);
    }

    function _withinDeviation(
        uint256 candidate,
        uint256 previous,
        uint256 deviationBps
    ) private pure returns (bool) {
        if (previous == 0) return true;
        uint256 difference = candidate >= previous
            ? candidate - previous
            : previous - candidate;
        return _productLessThanOrEqual(
            difference, BPS, previous, deviationBps
        );
    }

    function _productLessThanOrEqual(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    ) private pure returns (bool) {
        (uint256 leftHigh, uint256 leftLow) = _fullProduct(a, b);
        (uint256 rightHigh, uint256 rightLow) = _fullProduct(c, d);
        return leftHigh < rightHigh
            || (leftHigh == rightHigh && leftLow <= rightLow);
    }

    function _fullProduct(uint256 a, uint256 b)
        private
        pure
        returns (uint256 high, uint256 low)
    {
        assembly ("memory-safe") {
            let mm := mulmod(a, b, not(0))
            low := mul(a, b)
            high := sub(sub(mm, low), lt(mm, low))
        }
    }

    function _tryMulDiv(uint256 x, uint256 y, uint256 denominator)
        private
        pure
        returns (bool valid, uint256 result)
    {
        if (denominator == 0) return (false, 0);
        unchecked {
            uint256 productLow;
            uint256 productHigh;
            assembly ("memory-safe") {
                let mm := mulmod(x, y, not(0))
                productLow := mul(x, y)
                productHigh := sub(sub(mm, productLow), lt(mm, productLow))
            }
            if (productHigh == 0) return (true, productLow / denominator);
            if (denominator <= productHigh) return (false, 0);
            uint256 remainder;
            assembly ("memory-safe") {
                remainder := mulmod(x, y, denominator)
                productHigh := sub(productHigh, gt(remainder, productLow))
                productLow := sub(productLow, remainder)
            }
            uint256 powerOfTwo = denominator & (0 - denominator);
            assembly ("memory-safe") {
                denominator := div(denominator, powerOfTwo)
                productLow := div(productLow, powerOfTwo)
                powerOfTwo := add(div(sub(0, powerOfTwo), powerOfTwo), 1)
            }
            productLow |= productHigh * powerOfTwo;
            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            return (true, productLow * inverse);
        }
    }

    function _currentCumulativePrice()
        private
        view
        returns (bool valid, uint256 cumulativePrice)
    {
        if (!_tokenDecimalsValid(bnbxToken, wbnbToken)) return (false, 0);
        if (!_pairIdentityMatches()) return (false, 0);
        (
            bool reservesValid,
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        ) = _readReserves(pair);
        if (!reservesValid || reserve0 == 0 || reserve1 == 0) {
            return (false, 0);
        }
        (bool cumulativeValid, uint256 cumulativeLast) = _readWord(
            pair,
            bnbxIsToken0
                ? PRICE0_CUMULATIVE_SELECTOR
                : PRICE1_CUMULATIVE_SELECTOR,
            bnbxIsToken0
                ? PRICE0_CUMULATIVE_CALL_GAS
                : PRICE1_CUMULATIVE_CALL_GAS
        );
        if (!cumulativeValid) return (false, 0);
        return _counterfactualCumulative(
            reserve0, reserve1, blockTimestampLast, cumulativeLast
        );
    }

    function _tokenDecimalsValid(address bnbx, address wbnb)
        private
        view
        returns (bool)
    {
        (bool bnbxValid, uint256 bnbxDecimals) =
            _readWord(bnbx, DECIMALS_SELECTOR, TOKEN_DECIMALS_CALL_GAS);
        (bool wbnbValid, uint256 wbnbDecimals) =
            _readWord(wbnb, DECIMALS_SELECTOR, TOKEN_DECIMALS_CALL_GAS);
        return bnbxValid && wbnbValid && bnbxDecimals == 18
            && wbnbDecimals == 18;
    }

    function _pairIdentityMatches() private view returns (bool) {
        (bool valid, address token0_, address token1_) = _readPairIdentity(pair);
        if (!valid) return false;
        return bnbxIsToken0
            ? token0_ == bnbxToken && token1_ == wbnbToken
            : token0_ == wbnbToken && token1_ == bnbxToken;
    }

    function _counterfactualCumulative(
        uint112 reserve0,
        uint112 reserve1,
        uint32 blockTimestampLast,
        uint256 cumulativeLast
    ) private view returns (bool valid, uint256 cumulativePrice) {
        uint32 elapsed;
        unchecked {
            elapsed = uint32(block.timestamp) - blockTimestampLast;
        }
        if (elapsed > type(uint32).max / 2) return (false, 0);
        if (elapsed == 0) return (true, cumulativeLast);
        uint256 baseReserve = bnbxIsToken0 ? reserve0 : reserve1;
        uint256 quoteReserve = bnbxIsToken0 ? reserve1 : reserve0;
        uint256 priceX112 = (quoteReserve << 112) / baseReserve;
        unchecked {
            return (true, cumulativeLast + priceX112 * elapsed);
        }
    }

    function _readBnbUsdWad() private view returns (bool valid, uint256 wad) {
        (bool decimalsValid, uint256 feedDecimals) =
            _readWord(
                bnbUsdFeed, DECIMALS_SELECTOR, FEED_DECIMALS_CALL_GAS
            );
        if (!decimalsValid || feedDecimals > 18) return (false, 0);

        bool success;
        uint256 returnSize;
        uint256 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint256 answeredInRound;
        address feed = bnbUsdFeed;
        uint32 selector = LATEST_ROUND_DATA_SELECTOR;
        if (gasleft() < LATEST_ROUND_DATA_CALL_GAS + CALLER_GAS_RESERVE) {
            return (false, 0);
        }
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, selector))
            success := staticcall(
                LATEST_ROUND_DATA_CALL_GAS, feed, pointer, 4, pointer, 160
            )
            returnSize := returndatasize()
            roundId := mload(pointer)
            answer := mload(add(pointer, 32))
            startedAt := mload(add(pointer, 64))
            updatedAt := mload(add(pointer, 96))
            answeredInRound := mload(add(pointer, 128))
        }
        if (!success || returnSize != 160) return (false, 0);
        if (roundId > type(uint80).max || answeredInRound > type(uint80).max) {
            return (false, 0);
        }
        if (
            answer <= 0 || answeredInRound < roundId || updatedAt == 0
                || startedAt > updatedAt || updatedAt > block.timestamp
                || startedAt > block.timestamp
                || block.timestamp - updatedAt > MAX_FEED_AGE
        ) return (false, 0);
        uint256 scale = 10 ** (18 - feedDecimals);
        uint256 unsignedAnswer = uint256(answer);
        if (unsignedAnswer > type(uint256).max / scale) return (false, 0);
        return (true, unsignedAnswer * scale);
    }

    function _readPairIdentity(address target)
        private
        view
        returns (bool valid, address token0_, address token1_)
    {
        (bool token0Valid, uint256 token0Word) =
            _readWord(target, TOKEN0_SELECTOR, TOKEN0_CALL_GAS);
        (bool token1Valid, uint256 token1Word) =
            _readWord(target, TOKEN1_SELECTOR, TOKEN1_CALL_GAS);
        if (
            !token0Valid || !token1Valid || token0Word >> 160 != 0
                || token1Word >> 160 != 0
        ) return (false, address(0), address(0));
        return (true, address(uint160(token0Word)), address(uint160(token1Word)));
    }

    function _readReserves(address target)
        private
        view
        returns (bool valid, uint112 reserve0, uint112 reserve1, uint32 timestamp)
    {
        bool success;
        uint256 returnSize;
        uint256 reserve0Word;
        uint256 reserve1Word;
        uint256 timestampWord;
        uint32 selector = GET_RESERVES_SELECTOR;
        if (gasleft() < GET_RESERVES_CALL_GAS + CALLER_GAS_RESERVE) {
            return (false, 0, 0, 0);
        }
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, selector))
            success := staticcall(
                GET_RESERVES_CALL_GAS, target, pointer, 4, pointer, 96
            )
            returnSize := returndatasize()
            reserve0Word := mload(pointer)
            reserve1Word := mload(add(pointer, 32))
            timestampWord := mload(add(pointer, 64))
        }
        if (
            !success || returnSize != 96 || reserve0Word > type(uint112).max
                || reserve1Word > type(uint112).max
                || timestampWord > type(uint32).max
        ) return (false, 0, 0, 0);
        return (
            true,
            uint112(reserve0Word),
            uint112(reserve1Word),
            uint32(timestampWord)
        );
    }

    function _readWord(address target, uint32 selector, uint256 callGas)
        private
        view
        returns (bool success, uint256 value)
    {
        if (gasleft() < callGas + CALLER_GAS_RESERVE) return (false, 0);
        uint256 returnSize;
        assembly ("memory-safe") {
            let pointer := mload(0x40)
            mstore(pointer, shl(224, selector))
            success := staticcall(callGas, target, pointer, 4, pointer, 32)
            returnSize := returndatasize()
            value := mload(pointer)
        }
        if (!success || returnSize != 32) return (false, 0);
    }
}
