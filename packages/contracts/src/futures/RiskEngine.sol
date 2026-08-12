// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesTypes } from "./FuturesTypes.sol";

contract RiskEngine {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant TAKER_FEE_BPS = 100;
    uint256 public constant INITIAL_MARGIN_BPS = 3_334;
    uint256 public constant MAINTENANCE_MARGIN_BPS = 2_000;
    uint256 public constant LIQUIDATION_PENALTY_BPS = 100;
    uint256 public constant MAX_FUNDING_RATE_BPS = 30;
    uint256 public constant MAX_FUNDING_ELAPSED = 8 hours;

    error DivisionByZero();
    error QuotientOverflow();
    error SignedPnlOverflow();
    error FundingRateOutOfBounds();
    error FundingElapsedOutOfBounds();

    function orderFee(uint256 notional, FuturesTypes.OrderRole role)
        external
        pure
        returns (uint256)
    {
        if (role == FuturesTypes.OrderRole.Maker) return 0;
        return _mulDivUp(notional, TAKER_FEE_BPS, BPS);
    }

    function initialMargin(uint256 notional)
        external
        pure
        returns (uint256)
    {
        return _mulDivUp(notional, INITIAL_MARGIN_BPS, BPS);
    }

    function maintenanceMargin(uint256 notional)
        public
        pure
        returns (uint256)
    {
        return _mulDivUp(notional, MAINTENANCE_MARGIN_BPS, BPS);
    }

    function pairedPnl(
        uint256 quantity,
        uint256 entryPrice,
        uint256 exitPrice
    ) external pure returns (int256 longPnl, int256 shortPnl) {
        uint256 priceDifference = exitPrice >= entryPrice
            ? exitPrice - entryPrice
            : entryPrice - exitPrice;
        uint256 magnitude = _mulDiv(quantity, priceDifference, WAD);
        if (magnitude > uint256(type(int256).max)) {
            revert SignedPnlOverflow();
        }

        int256 signedMagnitude = int256(magnitude);
        if (exitPrice >= entryPrice) {
            return (signedMagnitude, -signedMagnitude);
        }
        return (-signedMagnitude, signedMagnitude);
    }

    function fundingPayment(
        uint256 notional,
        int256 rateBps,
        uint256 elapsed
    )
        external
        pure
        returns (
            uint256 payerDebit,
            uint256 receiverCredit,
            uint256 insuranceRounding
        )
    {
        if (
            rateBps < -int256(MAX_FUNDING_RATE_BPS)
                || rateBps > int256(MAX_FUNDING_RATE_BPS)
        ) revert FundingRateOutOfBounds();
        if (elapsed > MAX_FUNDING_ELAPSED) {
            revert FundingElapsedOutOfBounds();
        }

        uint256 rateMagnitude = rateBps < 0
            ? uint256(-rateBps)
            : uint256(rateBps);
        uint256 timeWeightedRate = rateMagnitude * elapsed;
        uint256 denominator = BPS * MAX_FUNDING_ELAPSED;
        receiverCredit = _mulDiv(notional, timeWeightedRate, denominator);
        payerDebit = _mulDivUp(notional, timeWeightedRate, denominator);
        insuranceRounding = payerDebit - receiverCredit;
    }

    function isLiquidatable(int256 equity, uint256 notional)
        external
        pure
        returns (bool)
    {
        uint256 requirement = maintenanceMargin(notional)
            + _mulDivUp(notional, TAKER_FEE_BPS, BPS);
        if (equity <= 0) return requirement > 0;
        return uint256(equity) < requirement;
    }

    function liquidationPenalty(uint256 notional, int256 equity)
        external
        pure
        returns (uint256)
    {
        if (equity <= 0) return 0;
        uint256 uncappedPenalty = _mulDivUp(
            notional, LIQUIDATION_PENALTY_BPS, BPS
        );
        uint256 positiveEquity = uint256(equity);
        return uncappedPenalty < positiveEquity
            ? uncappedPenalty
            : positiveEquity;
    }

    function mulDiv(uint256 x, uint256 y, uint256 denominator)
        external
        pure
        returns (uint256)
    {
        return _mulDiv(x, y, denominator);
    }

    function _mulDivUp(uint256 x, uint256 y, uint256 denominator)
        internal
        pure
        returns (uint256 result)
    {
        result = _mulDiv(x, y, denominator);
        if (mulmod(x, y, denominator) > 0) {
            if (result == type(uint256).max) revert QuotientOverflow();
            result += 1;
        }
    }

    function _mulDiv(uint256 x, uint256 y, uint256 denominator)
        internal
        pure
        returns (uint256 result)
    {
        if (denominator == 0) revert DivisionByZero();

        unchecked {
            uint256 productLow;
            uint256 productHigh;
            assembly ("memory-safe") {
                let mm := mulmod(x, y, not(0))
                productLow := mul(x, y)
                productHigh := sub(sub(mm, productLow), lt(mm, productLow))
            }

            if (productHigh == 0) return productLow / denominator;
            if (denominator <= productHigh) revert QuotientOverflow();

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
            result = productLow * inverse;
        }
    }
}
