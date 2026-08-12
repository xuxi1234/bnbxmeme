// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesTypes } from "../src/futures/FuturesTypes.sol";
import { RiskEngine } from "../src/futures/RiskEngine.sol";

contract RiskEngineTest {
    RiskEngine internal engine;

    function setUp() public {
        engine = new RiskEngine();
    }

    function testTakerFeeRoundsUpAndMakerFeeIsZero() public view {
        assert(engine.orderFee(1, FuturesTypes.OrderRole.Maker) == 0);
        assert(engine.orderFee(10_000, FuturesTypes.OrderRole.Taker) == 100);
        assert(engine.orderFee(10_001, FuturesTypes.OrderRole.Taker) == 101);
    }

    function testInitialMarginRoundsUpAtThirtyThreePointThreeFourPercent()
        public
        view
    {
        assert(engine.initialMargin(10_000) == 3_334);
        assert(engine.initialMargin(3) == 2);
    }

    function testMaintenanceMarginRoundsUpAtTwentyPercent() public view {
        assert(engine.maintenanceMargin(10_000) == 2_000);
        assert(engine.maintenanceMargin(1) == 1);
    }

    function testPairedPnlIsZeroSumForProfitLossAndNoPriceMove()
        public
        view
    {
        (int256 longProfit, int256 shortLoss) = engine.pairedPnl(
            3e18, 2e18, 5e18
        );
        assert(longProfit == 9e18);
        assert(shortLoss == -9e18);

        (int256 longLoss, int256 shortProfit) = engine.pairedPnl(
            3e18, 5e18, 2e18
        );
        assert(longLoss == -9e18);
        assert(shortProfit == 9e18);

        (int256 longFlat, int256 shortFlat) = engine.pairedPnl(
            17e18, 4e18, 4e18
        );
        assert(longFlat == 0);
        assert(shortFlat == 0);
    }

    function testPairedPnlSupportsTheSignedBoundaryAndRejectsLargerMagnitude()
        public
    {
        uint256 signedMaximum = uint256(type(int256).max);
        (int256 longPnl, int256 shortPnl) = engine.pairedPnl(
            signedMaximum, 0, 1e18
        );
        assert(longPnl == type(int256).max);
        assert(shortPnl == -type(int256).max);

        _assertReverts(
            abi.encodeCall(
                engine.pairedPnl, (signedMaximum + 1, 0, 1e18)
            )
        );
    }

    function testLiquidationUsesStrictRequirementEqualityAndNonPositiveEquity()
        public
        view
    {
        assert(!engine.isLiquidatable(2_100, 10_000));
        assert(engine.isLiquidatable(2_099, 10_000));
        assert(engine.isLiquidatable(0, 10_000));
        assert(engine.isLiquidatable(-1, 10_000));
        assert(!engine.isLiquidatable(0, 0));
    }

    function testLiquidationPenaltyRoundsUpAndCannotExceedPositiveEquity()
        public
        view
    {
        assert(engine.liquidationPenalty(10_001, 500) == 101);
        assert(engine.liquidationPenalty(10_001, 50) == 50);
        assert(engine.liquidationPenalty(10_001, 0) == 0);
        assert(engine.liquidationPenalty(10_001, -1) == 0);
    }

    function testFundingCapsRateAndTimeAndAssignsRoundingToInsurance()
        public
    {
        (uint256 fullDebit, uint256 fullCredit, uint256 fullInsurance) =
            engine.fundingPayment(100_000, 30, 8 hours);
        assert(fullDebit == 300);
        assert(fullCredit == 300);
        assert(fullInsurance == 0);

        (uint256 halfDebit, uint256 halfCredit, uint256 halfInsurance) =
            engine.fundingPayment(100_000, -30, 4 hours);
        assert(halfDebit == 150);
        assert(halfCredit == 150);
        assert(halfInsurance == 0);

        (uint256 debit, uint256 credit, uint256 insurance) =
            engine.fundingPayment(1, 1, 1);
        assert(debit == 1);
        assert(credit == 0);
        assert(insurance == 1);

        _assertReverts(
            abi.encodeCall(engine.fundingPayment, (100_000, 31, 8 hours))
        );
        _assertReverts(
            abi.encodeCall(engine.fundingPayment, (100_000, -31, 8 hours))
        );
        _assertReverts(
            abi.encodeCall(engine.fundingPayment, (100_000, 30, 8 hours + 1))
        );
    }

    function testMulDivHandlesA512BitProductAndRejectsInvalidQuotients()
        public
    {
        assert(
            engine.mulDiv(
                uint256(1) << 200,
                uint256(1) << 100,
                uint256(1) << 100
            ) == uint256(1) << 200
        );
        assert(
            engine.mulDiv(
                type(uint256).max,
                type(uint256).max,
                type(uint256).max
            ) == type(uint256).max
        );

        _assertReverts(abi.encodeCall(engine.mulDiv, (1, 1, 0)));
        _assertReverts(
            abi.encodeCall(
                engine.mulDiv,
                (
                    type(uint256).max,
                    type(uint256).max,
                    type(uint256).max - 1
                )
            )
        );
    }

    function testDeployedRuntimeRejectsPrivilegedAndFallbackSelectors()
        public
    {
        assert(address(engine).code.length > 0);

        bytes4[6] memory forbiddenSelectors = [
            bytes4(0x8da5cb5b), // owner()
            bytes4(0xf2fde38b), // transferOwnership(address)
            bytes4(0x4f1ef286), // upgradeToAndCall(address,bytes)
            bytes4(0xb61d27f6), // execute(address,bytes)
            bytes4(0xf3fef3a3), // withdraw(address,uint256)
            bytes4(0x83197ef0) // setFeeBps(uint256)
        ];
        for (uint256 i = 0; i < forbiddenSelectors.length; i += 1) {
            (bool success,) = address(engine).call(
                abi.encodePacked(forbiddenSelectors[i], bytes32(0), bytes32(0))
            );
            assert(!success);
        }

        (bool emptyCallSuccess,) = address(engine).call("");
        assert(!emptyCallSuccess);
    }

    function _assertReverts(bytes memory callData) internal {
        (bool success,) = address(engine).call(callData);
        assert(!success);
    }
}
