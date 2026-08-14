// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ClearingHouse } from "../src/futures/ClearingHouse.sol";
import { FuturesTypes } from "../src/futures/FuturesTypes.sol";
import { OrderBook } from "../src/futures/OrderBook.sol";
import { RiskEngine } from "../src/futures/RiskEngine.sol";
import { FuturesCollateralMock } from "./futures/FuturesCollateralMock.sol";

contract Task6OracleMock {
    FuturesTypes.MarketState private _state = FuturesTypes.MarketState.Open;
    uint256 private _markPriceWad = 1e18;
    uint64 private _updatedAt;

    constructor() {
        _updatedAt = uint64(block.timestamp);
    }

    function marketState() external view returns (FuturesTypes.MarketState) {
        return _state;
    }

    function safeRead()
        external
        view
        returns (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        )
    {
        return (_state, _markPriceWad, 1e18, 1e18, _updatedAt);
    }

    function setRead(
        FuturesTypes.MarketState state_,
        uint256 markPriceWad_,
        uint64 updatedAt_
    ) external {
        _state = state_;
        _markPriceWad = markPriceWad_;
        _updatedAt = updatedAt_;
    }
}

contract Task6MarketStateOnlyProvider {
    function marketState()
        external
        pure
        returns (FuturesTypes.MarketState)
    {
        return FuturesTypes.MarketState.Open;
    }
}

contract Task6ShortReturnOracle {
    fallback() external {
        assembly ("memory-safe") {
            return(0, 128)
        }
    }
}

contract Task6InvalidEnumOracle {
    fallback() external {
        assembly ("memory-safe") {
            mstore(0, 2)
            return(0, 160)
        }
    }
}

contract FundingLiquidationFixtureDeployer {
    bytes32 private constant ORDER_BOOK_SALT = keccak256("TASK_6_ORDER_BOOK");

    function deploy(
        address collateral,
        address riskEngine,
        address oracle,
        address revenueRecipient
    ) external returns (ClearingHouse clearingHouse, OrderBook orderBook) {
        address predictedClearingHouse = _firstCreateAddress(address(this));
        bytes32 creationHash = keccak256(
            abi.encodePacked(
                type(OrderBook).creationCode,
                abi.encode(predictedClearingHouse, riskEngine, oracle)
            )
        );
        address predictedOrderBook = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            ORDER_BOOK_SALT,
                            creationHash
                        )
                    )
                )
            )
        );

        clearingHouse = new ClearingHouse(
            collateral,
            riskEngine,
            predictedOrderBook,
            address(0xCAFE),
            revenueRecipient,
            1e48,
            1_000e18,
            150e18
        );
        assert(address(clearingHouse) == predictedClearingHouse);
        orderBook = new OrderBook{ salt: ORDER_BOOK_SALT }(
            address(clearingHouse), riskEngine, oracle
        );
        assert(address(orderBook) == predictedOrderBook);
    }

    function _firstCreateAddress(address creator)
        private
        pure
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(hex"d694", creator, hex"01"))
                )
            )
        );
    }
}

contract FundingLiquidationTest {
    FuturesCollateralMock public collateral;
    RiskEngine public riskEngine;
    Task6OracleMock public oracle;
    Task6MarketStateOnlyProvider public marketStateOnlyProvider;
    Task6ShortReturnOracle public shortReturnOracle;
    Task6InvalidEnumOracle public invalidEnumOracle;
    ClearingHouse public clearingHouse;
    OrderBook public orderBook;

    function setUp() external {
        collateral = new FuturesCollateralMock();
        riskEngine = new RiskEngine();
        oracle = new Task6OracleMock();
        marketStateOnlyProvider = new Task6MarketStateOnlyProvider();
        shortReturnOracle = new Task6ShortReturnOracle();
        invalidEnumOracle = new Task6InvalidEnumOracle();
        FundingLiquidationFixtureDeployer deployer =
            new FundingLiquidationFixtureDeployer();
        (clearingHouse, orderBook) = deployer.deploy(
            address(collateral),
            address(riskEngine),
            address(oracle),
            address(0xBEEF)
        );
    }

    function providerConstructionRejected(address provider)
        external
        returns (bool rejected)
    {
        FundingLiquidationFixtureDeployer deployer =
            new FundingLiquidationFixtureDeployer();
        try deployer.deploy(
            address(collateral),
            address(riskEngine),
            provider,
            address(0xBEEF)
        ) returns (ClearingHouse, OrderBook) {
            return false;
        } catch {
            return true;
        }
    }

    function liquidateAtOracleAge(
        uint64 lotId,
        FuturesTypes.LiquidationOrder calldata replacement,
        bytes calldata signature,
        uint64 age
    ) external {
        oracle.setRead(
            FuturesTypes.MarketState.Open,
            replacement.limitPrice,
            uint64(block.timestamp) - age
        );
        orderBook.liquidate(lotId, replacement, signature);
    }
}
