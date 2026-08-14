// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ClearingHouse } from "../src/futures/ClearingHouse.sol";
import { FuturesTypes } from "../src/futures/FuturesTypes.sol";
import { OrderBook } from "../src/futures/OrderBook.sol";
import { RiskEngine } from "../src/futures/RiskEngine.sol";
import { FuturesCollateralMock } from "./futures/FuturesCollateralMock.sol";

contract MarketStateProviderMock {
    FuturesTypes.MarketState private _marketState = FuturesTypes.MarketState.Open;

    function marketState() external view returns (FuturesTypes.MarketState) {
        return _marketState;
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
        return (_marketState, 1e18, 1e18, 1e18, block.timestamp);
    }

    function setMarketState(FuturesTypes.MarketState newState) external {
        _marketState = newState;
    }
}

contract OrderBookFixtureDeployer {
    bytes32 private constant ORDER_BOOK_SALT = keccak256("ORDER_BOOK");

    function deploy(
        address collateral,
        address riskEngine,
        address marketStateProvider,
        address safetyController,
        address revenueRecipient,
        uint256 cap
    ) external returns (ClearingHouse clearingHouse, OrderBook orderBook) {
        address predictedClearingHouse = _firstCreateAddress(address(this));
        bytes32 creationHash = keccak256(
            abi.encodePacked(
                type(OrderBook).creationCode,
                abi.encode(
                    predictedClearingHouse,
                    riskEngine,
                    marketStateProvider
                )
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
            safetyController,
            revenueRecipient,
            cap,
            cap,
            cap
        );
        assert(address(clearingHouse) == predictedClearingHouse);
        orderBook = new OrderBook{ salt: ORDER_BOOK_SALT }(
            address(clearingHouse), riskEngine, marketStateProvider
        );
        assert(address(orderBook) == predictedOrderBook);
    }

    function _firstCreateAddress(address creator)
        private
        pure
        returns (address)
    {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(hex"d694", creator, hex"01"))))
        );
    }
}

contract OrderBookTest {
    uint256 private constant CAP = 1e48;

    FuturesCollateralMock public collateral;
    RiskEngine public riskEngine;
    MarketStateProviderMock public marketStateProvider;
    ClearingHouse public clearingHouse;
    OrderBook public orderBook;
    address public constant revenueRecipient = address(0xBEEF);

    function setUp() external {
        collateral = new FuturesCollateralMock();
        riskEngine = new RiskEngine();
        marketStateProvider = new MarketStateProviderMock();
        OrderBookFixtureDeployer deployer = new OrderBookFixtureDeployer();
        (clearingHouse, orderBook) = deployer.deploy(
            address(collateral),
            address(riskEngine),
            address(marketStateProvider),
            address(0xCAFE),
            revenueRecipient,
            CAP
        );
    }
}
