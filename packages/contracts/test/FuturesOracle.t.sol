// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FuturesOracle } from "../src/futures/FuturesOracle.sol";
import { FuturesTypes } from "../src/futures/FuturesTypes.sol";
import { ClearingHouse } from "../src/futures/ClearingHouse.sol";
import { OrderBook } from "../src/futures/OrderBook.sol";
import { RiskEngine } from "../src/futures/RiskEngine.sol";
import { FuturesCollateralMock } from "./futures/FuturesCollateralMock.sol";

contract OracleTokenMock {
    uint8 public constant decimals = 18;
}

contract OracleTokenConfigurableMock {
    enum Mode {
        Valid,
        Revert,
        Short,
        Overlong,
        Malformed,
        Bomb,
        GasBurn
    }

    uint256 private _decimals;
    Mode private _mode;

    constructor(uint256 decimals_) {
        _decimals = decimals_;
    }

    function setMode(Mode mode) external {
        _mode = mode;
    }

    fallback() external {
        Mode mode = _mode;
        if (mode == Mode.Revert) {
            assembly ("memory-safe") {
                revert(0, 0)
            }
        }
        if (mode == Mode.Bomb) {
            assembly ("memory-safe") {
                return(0, 65536)
            }
        }
        if (mode == Mode.GasBurn) {
            assembly ("memory-safe") {
                for { } 1 { } { }
            }
        }
        uint256 value = mode == Mode.Malformed ? 256 : _decimals;
        uint256 size = mode == Mode.Short ? 31 : 32;
        if (mode == Mode.Overlong) size = 64;
        assembly ("memory-safe") {
            mstore(0, value)
            mstore(32, 0xfeed)
            return(0, size)
        }
    }
}

contract OraclePairMock {
    enum Mode {
        Valid,
        Revert,
        Short,
        Overlong,
        Malformed,
        Bomb,
        GasBurn
    }

    bytes4 private constant TOKEN0_SELECTOR = 0x0dfe1681;
    bytes4 private constant TOKEN1_SELECTOR = 0xd21220a7;
    bytes4 private constant GET_RESERVES_SELECTOR = 0x0902f1ac;
    bytes4 private constant PRICE0_CUMULATIVE_SELECTOR = 0x5909c0d5;
    bytes4 private constant PRICE1_CUMULATIVE_SELECTOR = 0x5a3d5493;

    address private _token0;
    address private _token1;
    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 private _blockTimestampLast;
    uint256 private _price0CumulativeLast;
    uint256 private _price1CumulativeLast;
    mapping(bytes4 selector => Mode mode) private _modes;
    uint8 private _reserveMalformedField;

    constructor(address token0_, address token1_) {
        _token0 = token0_;
        _token1 = token1_;
        _blockTimestampLast = uint32(block.timestamp);
    }

    function setMode(bytes4 selector, Mode mode) external {
        _modes[selector] = mode;
    }

    function setTokens(address token0_, address token1_) external {
        _token0 = token0_;
        _token1 = token1_;
    }

    function setReserveMalformedField(uint8 field) external {
        _reserveMalformedField = field;
    }

    function setReserves(uint112 reserve0_, uint112 reserve1_) external {
        _accumulate();
        _reserve0 = reserve0_;
        _reserve1 = reserve1_;
        _blockTimestampLast = uint32(block.timestamp);
    }

    function setRawState(
        uint112 reserve0_,
        uint112 reserve1_,
        uint32 blockTimestampLast_,
        uint256 price0CumulativeLast_,
        uint256 price1CumulativeLast_
    ) external {
        _reserve0 = reserve0_;
        _reserve1 = reserve1_;
        _blockTimestampLast = blockTimestampLast_;
        _price0CumulativeLast = price0CumulativeLast_;
        _price1CumulativeLast = price1CumulativeLast_;
    }

    function _accumulate() private {
        if (_reserve0 == 0 || _reserve1 == 0) return;
        uint32 elapsed;
        unchecked {
            elapsed = uint32(block.timestamp) - _blockTimestampLast;
            _price0CumulativeLast +=
                ((uint256(_reserve1) << 112) / _reserve0) * elapsed;
            _price1CumulativeLast +=
                ((uint256(_reserve0) << 112) / _reserve1) * elapsed;
        }
    }

    fallback() external {
        bytes4 selector = msg.sig;
        Mode mode = _modes[selector];
        if (mode == Mode.Revert) {
            assembly ("memory-safe") {
                mstore(0, 0xdeadbeef)
                revert(28, 4)
            }
        }
        if (mode == Mode.Bomb) {
            assembly ("memory-safe") {
                return(0, 65536)
            }
        }
        if (mode == Mode.GasBurn) {
            assembly ("memory-safe") {
                for { } 1 { } { }
            }
        }

        bytes memory data;
        if (selector == TOKEN0_SELECTOR) {
            data = mode == Mode.Malformed
                ? abi.encode(uint256(uint160(_token0)) | (uint256(1) << 200))
                : abi.encode(_token0);
        } else if (selector == TOKEN1_SELECTOR) {
            data = mode == Mode.Malformed
                ? abi.encode(uint256(uint160(_token1)) | (uint256(1) << 200))
                : abi.encode(_token1);
        } else if (selector == GET_RESERVES_SELECTOR) {
            if (mode == Mode.Malformed) {
                uint256 reserve0Word = _reserve0;
                uint256 reserve1Word = _reserve1;
                uint256 timestampWord = _blockTimestampLast;
                if (_reserveMalformedField == 0) {
                    reserve0Word = uint256(type(uint112).max) + 1;
                } else if (_reserveMalformedField == 1) {
                    reserve1Word = uint256(type(uint112).max) + 1;
                } else {
                    timestampWord = uint256(type(uint32).max) + 1;
                }
                data = abi.encode(reserve0Word, reserve1Word, timestampWord);
            } else {
                data = abi.encode(_reserve0, _reserve1, _blockTimestampLast);
            }
        } else if (selector == PRICE0_CUMULATIVE_SELECTOR) {
            data = abi.encode(_price0CumulativeLast);
        } else if (selector == PRICE1_CUMULATIVE_SELECTOR) {
            data = abi.encode(_price1CumulativeLast);
        } else {
            revert("UNKNOWN_SELECTOR");
        }

        uint256 size = data.length;
        if (mode == Mode.Short) size -= 1;
        if (mode == Mode.Overlong) {
            data = bytes.concat(data, abi.encode(uint256(0xfeed)));
            size = data.length;
        }
        assembly ("memory-safe") {
            return(add(data, 32), size)
        }
    }
}

contract OracleFeedMock {
    enum Mode {
        Valid,
        Revert,
        Short,
        Overlong,
        Malformed,
        Bomb,
        GasBurn
    }

    bytes4 private constant DECIMALS_SELECTOR = 0x313ce567;
    bytes4 private constant LATEST_ROUND_DATA_SELECTOR = 0xfeaf968c;

    uint256 private _decimals = 8;
    uint256 private _roundId = 1;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint256 private _answeredInRound = 1;
    mapping(bytes4 selector => Mode mode) private _modes;
    uint8 private _roundMalformedField;

    function setMode(bytes4 selector, Mode mode) external {
        _modes[selector] = mode;
    }

    function setDecimals(uint256 decimals_) external {
        _decimals = decimals_;
    }

    function setRoundMalformedField(uint8 field) external {
        _roundMalformedField = field;
    }

    function setRoundData(
        uint256 roundId_,
        int256 answer_,
        uint256 startedAt_,
        uint256 updatedAt_,
        uint256 answeredInRound_
    ) external {
        _roundId = roundId_;
        _answer = answer_;
        _startedAt = startedAt_;
        _updatedAt = updatedAt_;
        _answeredInRound = answeredInRound_;
    }

    function setFreshAnswer(int256 answer_) external {
        _roundId += 1;
        _answer = answer_;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }

    function setAnswerWithAge(int256 answer_, uint256 age) external {
        _roundId += 1;
        _answer = answer_;
        _startedAt = block.timestamp - age;
        _updatedAt = block.timestamp - age;
        _answeredInRound = _roundId;
    }

    function setFutureAnswer(int256 answer_, uint256 ahead) external {
        _roundId += 1;
        _answer = answer_;
        _startedAt = block.timestamp + ahead;
        _updatedAt = block.timestamp + ahead;
        _answeredInRound = _roundId;
    }

    fallback() external {
        bytes4 selector = msg.sig;
        Mode mode = _modes[selector];
        if (mode == Mode.Revert) {
            assembly ("memory-safe") {
                mstore(0, 0xdeadbeef)
                revert(28, 4)
            }
        }
        if (mode == Mode.Bomb) {
            assembly ("memory-safe") {
                return(0, 65536)
            }
        }
        if (mode == Mode.GasBurn) {
            assembly ("memory-safe") {
                for { } 1 { } { }
            }
        }

        bytes memory data;
        if (selector == DECIMALS_SELECTOR) {
            data = mode == Mode.Malformed
                ? abi.encode(uint256(type(uint8).max) + 1)
                : abi.encode(_decimals);
        } else if (selector == LATEST_ROUND_DATA_SELECTOR) {
            if (mode == Mode.Malformed) {
                uint256 roundIdWord = _roundId;
                uint256 answeredInRoundWord = _answeredInRound;
                if (_roundMalformedField == 0) {
                    roundIdWord = uint256(type(uint80).max) + 1;
                } else {
                    answeredInRoundWord = uint256(type(uint80).max) + 1;
                }
                data = abi.encode(
                    roundIdWord,
                    _answer,
                    _startedAt,
                    _updatedAt,
                    answeredInRoundWord
                );
            } else {
                data = abi.encode(
                    _roundId,
                    _answer,
                    _startedAt,
                    _updatedAt,
                    _answeredInRound
                );
            }
        } else {
            revert("UNKNOWN_SELECTOR");
        }

        uint256 size = data.length;
        if (mode == Mode.Short) size -= 1;
        if (mode == Mode.Overlong) {
            data = bytes.concat(data, abi.encode(uint256(0xfeed)));
            size = data.length;
        }
        assembly ("memory-safe") {
            return(add(data, 32), size)
        }
    }
}

contract OracleUnauthorizedCaller {
    function force(address oracle)
        external
        returns (bool success, bytes4 selector)
    {
        bytes memory returnData;
        (success, returnData) = oracle.call(
            abi.encodeWithSignature("forceCloseOnly()")
        );
        if (returnData.length >= 4) selector = bytes4(returnData);
    }

    function lower(address oracle, uint16 newBps)
        external
        returns (bool success, bytes4 selector)
    {
        bytes memory returnData;
        (success, returnData) = oracle.call(
            abi.encodeWithSignature("lowerMaxDeviationBps(uint16)", newBps)
        );
        if (returnData.length >= 4) selector = bytes4(returnData);
    }
}

contract OracleOrderBookFixtureDeployer {
    bytes32 private constant ORDER_BOOK_SALT = keccak256("ORACLE_ORDER_BOOK");

    ClearingHouse public clearingHouse;
    OrderBook public orderBook;

    function deploy(
        address collateral,
        address riskEngine,
        address marketStateProvider,
        address safetyController,
        address revenueRecipient,
        uint256 cap
    ) external {
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
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"d694", creator, hex"01")
                    )
                )
            )
        );
    }
}

contract FuturesOracleTest {
    OracleTokenMock public bnbx;
    OracleTokenMock public wbnb;
    OraclePairMock public pair;
    OracleFeedMock public feed;
    FuturesOracle public oracle;

    function setUp() external {
        bnbx = new OracleTokenMock();
        wbnb = new OracleTokenMock();
        pair = new OraclePairMock(address(bnbx), address(wbnb));
        feed = new OracleFeedMock();
        pair.setReserves(100 ether, 1 ether);
        feed.setFreshAnswer(60_000_000_000);
        oracle = new FuturesOracle(
            address(pair),
            address(feed),
            address(bnbx),
            address(wbnb),
            address(this)
        );
    }

    function testStartsCloseOnlyAndBaselineDoesNotOpen() public {
        (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        ) = oracle.update();
        assert(state == FuturesTypes.MarketState.CloseOnly);
        assert(markPriceWad == 0);
        assert(twapBnbPerTokenWad == 0);
        assert(bnbUsdWad == 0);
        assert(updatedAt == 0);
        assert(oracle.marketState() == FuturesTypes.MarketState.CloseOnly);
    }

    function testSafeReadIsZeroBeforeACompleteWindow() public view {
        (
            FuturesTypes.MarketState state,
            uint256 markPriceWad,
            uint256 twapBnbPerTokenWad,
            uint256 bnbUsdWad,
            uint256 updatedAt
        ) = oracle.safeRead();
        assert(state == FuturesTypes.MarketState.CloseOnly);
        assert(markPriceWad == 0);
        assert(twapBnbPerTokenWad == 0);
        assert(bnbUsdWad == 0);
        assert(updatedAt == 0);
    }

    function testGuardianCanOnlyLowerDeviationAndForceClose() public {
        assert(oracle.maxDeviationBps() == 1_000);
        oracle.lowerMaxDeviationBps(500);
        assert(oracle.maxDeviationBps() == 500);

        (bool equalSuccess, bytes memory equalData) = address(oracle).call(
            abi.encodeCall(oracle.lowerMaxDeviationBps, (500))
        );
        (bool increaseSuccess, bytes memory increaseData) = address(oracle).call(
            abi.encodeCall(oracle.lowerMaxDeviationBps, (501))
        );
        (bool zeroSuccess, bytes memory zeroData) = address(oracle).call(
            abi.encodeCall(oracle.lowerMaxDeviationBps, (0))
        );
        assert(!equalSuccess && !increaseSuccess && !zeroSuccess);
        assert(bytes4(equalData) == FuturesOracle.InvalidDeviation.selector);
        assert(bytes4(increaseData) == FuturesOracle.InvalidDeviation.selector);
        assert(bytes4(zeroData) == FuturesOracle.InvalidDeviation.selector);

        OracleUnauthorizedCaller caller = new OracleUnauthorizedCaller();
        (bool lowerSuccess, bytes4 lowerError) = caller.lower(
            address(oracle), 499
        );
        (bool forceSuccess, bytes4 forceError) = caller.force(address(oracle));
        assert(!lowerSuccess && lowerError == FuturesOracle.Unauthorized.selector);
        assert(!forceSuccess && forceError == FuturesOracle.Unauthorized.selector);
        oracle.forceCloseOnly();
        assert(oracle.forcedClose());
        oracle.forceCloseOnly();
        assert(oracle.forcedClose());
    }
}
