// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesTypes } from "../src/futures/FuturesTypes.sol";
import { FuturesCollateralMock } from "./futures/FuturesCollateralMock.sol";
import { RawReturnDependencyMock } from "./futures/RawReturnDependencyMock.sol";

contract ReentryRecorder {
    uint256 public calls;

    function record() external {
        calls += 1;
    }
}

contract FuturesTypesTest {
    FuturesTypes.MarketState public marketState;

    function testKnownOrderHashBindsEverySignedField() public pure {
        FuturesTypes.Order memory order = FuturesTypes.Order({
            trader: 0x000000000000000000000000000000000000a11c,
            side: FuturesTypes.Side.Short,
            quantity: 123_456_789,
            limitPrice: 987_654_321_000_000_000,
            leverage: 3,
            nonce: 42,
            deadline: 1_800_000_000,
            reduceOnly: true,
            role: FuturesTypes.OrderRole.Taker
        });

        assert(
            FuturesTypes.ORDER_TYPEHASH ==
                0x32fc444443cf02d88520b6e1921b3982d993d4c148b21bb1d1e35797e94f7b17
        );
        assert(
            FuturesTypes.EIP712_DOMAIN_TYPEHASH ==
                0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f
        );
        assert(
            FuturesTypes.hashOrder(order) ==
                0x47cbe97a5689cd143c1735afbb3463fcd10a38ea2e5c58af4109e87372626c63
        );
    }

    function testMarketStateDefaultsToCloseOnlyAndSidesAreStable()
        public
        view
    {
        assert(marketState == FuturesTypes.MarketState.CloseOnly);
        assert(uint8(FuturesTypes.Side.Long) == 0);
        assert(uint8(FuturesTypes.Side.Short) == 1);
    }

    function testCollateralMockSupportsAdversarialTransferModes() public {
        FuturesCollateralMock collateral = new FuturesCollateralMock();
        address recipient = address(0xB0B);
        collateral.mint(address(this), 1_000);

        require(collateral.transfer(recipient, 100), "STANDARD_TRANSFER");
        assert(collateral.balanceOf(recipient) == 100);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.FalseReturn);
        (bool falseSuccess, bytes memory falseData) = address(collateral).call(
            abi.encodeCall(collateral.transfer, (recipient, 100))
        );
        assert(falseSuccess);
        assert(falseData.length == 32);
        assert(!abi.decode(falseData, (bool)));
        assert(collateral.balanceOf(recipient) == 100);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.NoReturn);
        (bool emptySuccess, bytes memory emptyData) = address(collateral).call(
            abi.encodeCall(collateral.transfer, (recipient, 100))
        );
        assert(emptySuccess);
        assert(emptyData.length == 0);
        assert(collateral.balanceOf(recipient) == 200);

        collateral.setTransferMode(FuturesCollateralMock.TransferMode.FeeOnTransfer);
        collateral.setFeeBps(100);
        require(collateral.transfer(recipient, 100), "FEE_TRANSFER");
        assert(collateral.balanceOf(recipient) == 299);
        assert(collateral.totalSupply() == 999);

        ReentryRecorder recorder = new ReentryRecorder();
        collateral.setTransferMode(FuturesCollateralMock.TransferMode.Reenter);
        collateral.configureReentry(
            address(recorder), abi.encodeCall(recorder.record, ())
        );
        require(collateral.transfer(recipient, 1), "REENTRY_TRANSFER");
        assert(recorder.calls() == 1);
    }

    function testRawReturnDependencyMockBoundsAndSignalsPayloads() public {
        RawReturnDependencyMock dependency = new RawReturnDependencyMock();

        (bool validSuccess, bytes memory validData) = address(dependency).call(
            abi.encodeWithSignature("latestRoundData()")
        );
        assert(validSuccess);
        assert(validData.length == 32);
        assert(
            abi.decode(validData, (bytes32)) ==
                0x000000000000000000000000000000000000000000000000000000000000cafe
        );

        dependency.setMode(RawReturnDependencyMock.Mode.Revert);
        (bool revertSuccess, bytes memory revertData) = address(dependency).call(
            abi.encodeWithSignature("latestRoundData()")
        );
        assert(!revertSuccess);
        assert(revertData.length == 4);
        assert(bytes4(revertData) == 0xdeadbeef);

        dependency.setMode(RawReturnDependencyMock.Mode.Short);
        (bool shortSuccess, bytes memory shortData) = address(dependency).call(
            abi.encodeWithSignature("latestRoundData()")
        );
        assert(shortSuccess);
        assert(shortData.length == 31);

        dependency.setMode(RawReturnDependencyMock.Mode.Overlong);
        (bool longSuccess, bytes memory longData) = address(dependency).call(
            abi.encodeWithSignature("latestRoundData()")
        );
        assert(longSuccess);
        assert(longData.length == 64);
        (bytes32 firstWord, bytes32 secondWord) = abi.decode(
            longData, (bytes32, bytes32)
        );
        assert(
            firstWord ==
                0x000000000000000000000000000000000000000000000000000000000000cafe
        );
        assert(
            secondWord ==
                0x000000000000000000000000000000000000000000000000000000000000feed
        );

        dependency.setMode(RawReturnDependencyMock.Mode.Malformed);
        (bool malformedSuccess, bytes memory malformedData) = address(dependency)
            .call(abi.encodeWithSignature("latestRoundData()"));
        assert(malformedSuccess);
        assert(malformedData.length == 32);
        assert(
            abi.decode(malformedData, (uint256)) == 2
        );
    }
}
