// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXFactory } from "../src/BNBXFactory.sol";
import { BNBXTokenV3 } from "../src/BNBXTokenV3.sol";
import { BondingCurve } from "../src/BondingCurve.sol";
import { IERC20Minimal } from "../src/interfaces/IERC20Minimal.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
}

contract RevertingReceiver {
    receive() external payable {
        revert("REJECT_BNB");
    }
}

contract ReenteringFeeRecipient {
    BNBXFactory public factory;
    bool public attempted;
    bool public succeeded;

    function setFactory(BNBXFactory factory_) external {
        require(address(factory) == address(0), "ALREADY_SET");
        factory = factory_;
    }

    receive() external payable {
        attempted = true;
        (succeeded,) = address(factory).call{ value: msg.value }(
            abi.encodeCall(
                factory.createVanityToken,
                (
                    BNBXFactory.CreateRequest(
                        "Reentered", "REENTER", uint8(1), "", bytes32(0)
                    )
                )
            )
        );
    }
}

contract MockPair {
    address public immutable token0;
    address public immutable token1;
    uint112 public reserve0;
    uint112 public reserve1;
    uint256 public totalSupply;
    mapping(address account => uint256 amount) public liquidityBalance;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function seed(
        uint256 tokenAmount,
        uint256 bnbAmount,
        address liquidityRecipient,
        uint256 liquidity
    ) external {
        reserve0 = uint112(tokenAmount);
        reserve1 = uint112(bnbAmount);
        liquidityBalance[liquidityRecipient] += liquidity;
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        liquidity = _sqrt(balance0 * balance1);
        require(liquidity > 0, "ZERO_LIQUIDITY");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        totalSupply += liquidity;
        liquidityBalance[to] += liquidity;
    }

    function sync() external {
        reserve0 = uint112(IERC20Minimal(token0).balanceOf(address(this)));
        reserve1 = uint112(IERC20Minimal(token1).balanceOf(address(this)));
    }

    function transferAsset(address asset, address to, uint256 amount) external {
        require(IERC20Minimal(asset).transfer(to, amount), "TRANSFER");
    }

    function getReserves()
        external
        view
        returns (uint112, uint112, uint32)
    {
        return (reserve0, reserve1, uint32(block.timestamp));
    }

    function _sqrt(uint256 value) internal pure returns (uint256 result) {
        if (value == 0) return 0;
        result = value;
        uint256 estimate = (value + 1) / 2;
        while (estimate < result) {
            result = estimate;
            estimate = (value / estimate + estimate) / 2;
        }
    }
}

contract MockPancakeFactory {
    mapping(address token => mapping(address quote => address pair)) public getPair;

    function createPair(address token, address quote) external returns (address pair) {
        require(getPair[token][quote] == address(0), "PAIR_EXISTS");
        pair = address(new MockPair(token, quote));
        getPair[token][quote] = pair;
        getPair[quote][token] = pair;
    }
}

contract MockWBNB {
    string public constant name = "Wrapped BNB";
    string public constant symbol = "WBNB";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        totalSupply += msg.value;
        balanceOf[msg.sender] += msg.value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            require(permitted >= amount, "ALLOWANCE");
            allowance[from][msg.sender] = permitted - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MockPancakeRouter {
    address public immutable factory;
    address public immutable WETH;

    constructor(address factory_, address wbnb_) {
        factory = factory_;
        WETH = wbnb_;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(amountTokenDesired >= amountTokenMin, "TOKEN_MIN");
        require(msg.value >= amountETHMin, "BNB_MIN");

        address pair = MockPancakeFactory(factory).getPair(token, WETH);
        if (pair == address(0)) {
            pair = MockPancakeFactory(factory).createPair(token, WETH);
        }

        require(
            IERC20Minimal(token).transferFrom(msg.sender, pair, amountTokenDesired),
            "TRANSFER"
        );

        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = _sqrt(amountToken * amountETH);
        MockPair(pair).seed(amountToken, amountETH, to, liquidity);
    }

    function _sqrt(uint256 value) internal pure returns (uint256 result) {
        if (value == 0) return 0;
        result = value;
        uint256 estimate = (value + 1) / 2;
        while (estimate < result) {
            result = estimate;
            estimate = (value / estimate + estimate) / 2;
        }
    }
}

contract FactoryIntegrationTest {
    Vm private constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address private constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    MockPancakeFactory internal pancakeFactory;
    MockPancakeRouter internal router;
    MockWBNB internal wbnb;
    BNBXFactory internal launchFactory;
    RevertingReceiver internal rejectingFees;
    BNBXFactory internal rejectingFactory;
    ReenteringFeeRecipient internal reentering;
    BNBXFactory internal protectedFactory;
    mapping(bytes32 key => bytes32 salt) internal testSalts;

    receive() external payable {}

    function setUp() public {
        if (address(this).balance < 10 ether) {
            vm.deal(address(this), 10 ether);
        }
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        launchFactory = new BNBXFactory(FEE_RECIPIENT, address(router));
        rejectingFees = new RevertingReceiver();
        rejectingFactory =
            new BNBXFactory(address(rejectingFees), address(router));
        reentering = new ReenteringFeeRecipient();
        protectedFactory =
            new BNBXFactory(address(reentering), address(router));
        reentering.setFactory(protectedFactory);
    }

    function findTestSalt(
        uint8 factoryKind,
        string calldata name,
        string calldata symbol,
        uint256 start,
        uint256 maxIterations
    ) external view returns (bool found, bytes32 salt, address predicted) {
        BNBXFactory factory = factoryKind == 1
            ? rejectingFactory
            : factoryKind == 2 ? protectedFactory : launchFactory;
        return factory.findVanitySalt(name, symbol, start, maxIterations);
    }

    function testFactoryAddress(uint8 factoryKind)
        external
        view
        returns (address)
    {
        if (factoryKind == 1) return address(rejectingFactory);
        if (factoryKind == 2) return address(protectedFactory);
        return address(launchFactory);
    }

    function setTestSalt(string calldata name, string calldata symbol, bytes32 salt)
        external
    {
        require(salt != bytes32(0), "ZERO_SALT");
        testSalts[_saltKey(name, symbol)] = salt;
    }

    function vanityRequest(
        string memory name,
        string memory symbol,
        uint8 target,
        string memory metadataURI
    ) internal view returns (BNBXFactory.CreateRequest memory request) {
        bytes32 salt = testSalts[_saltKey(name, symbol)];
        require(salt != bytes32(0), "SALT_NOT_PREPARED");
        request = BNBXFactory.CreateRequest(name, symbol, target, metadataURI, salt);
    }

    function _saltKey(string memory name, string memory symbol)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(name, symbol));
    }

    function testCreateBuyFillGraduateAndBurnLPAtomically() public {
        uint256 balanceBefore = address(this).balance;
        uint256 feeBalanceBefore = FEE_RECIPIENT.balance;

        (address tokenAddress, address curveAddress, uint256 tokensOut) =
            launchFactory.createVanityTokenAndBuy{ value: 5.5 ether }(
                vanityRequest("Zhang San", "ZS", 5, "ipfs://bnbx-test-metadata"),
                BNBXFactory.BuyRequest(
                    799_999_999 ether, block.timestamp, address(this)
                )
            );

        BNBXTokenV3 token = BNBXTokenV3(tokenAddress);
        assert(uint16(uint160(tokenAddress)) == 0x1111);
        BondingCurve curve = BondingCurve(payable(curveAddress));
        address pairAddress = pancakeFactory.getPair(tokenAddress, address(wbnb));
        MockPair pair = MockPair(pairAddress);

        require(tokensOut == 800_000_000 ether, "TOKENS_OUT");
        require(
            keccak256(bytes(launchFactory.tokenMetadataURI(tokenAddress)))
                == keccak256(bytes("ipfs://bnbx-test-metadata")),
            "METADATA"
        );
        require(token.balanceOf(address(this)) == 800_000_000 ether, "USER_BALANCE");
        require(token.balanceOf(pairAddress) == 200_000_000 ether, "PAIR_BALANCE");
        require(curve.realBNBPrincipal() == 0.05 ether, "PRINCIPAL");
        require(
            uint256(curve.state()) == uint256(BondingCurve.State.Graduated),
            "STATE"
        );
        require(pair.reserve0() == uint112(200_000_000 ether), "TOKEN_RESERVE");
        require(pair.reserve1() == uint112(0.05 ether), "BNB_RESERVE");
        require(pair.liquidityBalance(DEAD) > 0, "LP_NOT_DEAD");
        require(
            FEE_RECIPIENT.balance - feeBalanceBefore == 0.001505050505050506 ether,
            "FEE_BALANCE"
        );

        // Net cost is creation fee + the exact gross amount needed for 0.05 BNB
        // principal. The rest of the supplied 5.5 BNB is refunded.
        uint256 expectedCost = 0.051505050505050506 ether;
        require(balanceBefore - address(this).balance == expectedCost, "NET_COST");
    }

    function testCreateWithoutInitialBuy() public {
        uint256 feeBalanceBefore = FEE_RECIPIENT.balance;
        (address tokenAddress, address curveAddress) =
            launchFactory.createVanityToken{ value: 0.001 ether }(
                vanityRequest(
                    "No First Buy", "NFB", 1, "ipfs://no-first-buy"
                )
            );

        BNBXTokenV3 token = BNBXTokenV3(tokenAddress);
        assert(uint16(uint160(tokenAddress)) == 0x1111);
        BondingCurve curve = BondingCurve(payable(curveAddress));
        assert(launchFactory.tokenCount() == 1);
        assert(launchFactory.allTokens(0) == tokenAddress);
        assert(launchFactory.curveOf(tokenAddress) == curveAddress);
        assert(token.balanceOf(curveAddress) == 1_000_000_000 ether);
        assert(curve.realBNBPrincipal() == 0);
        assert(curve.graduationTarget() == 0.01 ether);
        assert(curve.TRADE_FEE_BPS() == 100);
        assert(uint256(curve.state()) == uint256(BondingCurve.State.Trading));
        assert(FEE_RECIPIENT.balance - feeBalanceBefore == 0.001 ether);
    }

    function testGraduationTargetEndpoints() public {
        (, address oneBNBCurve) = launchFactory.createVanityToken{
            value: 0.001 ether
        }(vanityRequest("One", "ONE", 1, ""));
        (, address eighteenBNBCurve) =
            launchFactory.createVanityToken{ value: 0.001 ether }(
                vanityRequest("Eighteen", "EIGHTEEN", 18, "")
            );

        assert(BondingCurve(payable(oneBNBCurve)).graduationTarget() == 0.01 ether);
        assert(
            BondingCurve(payable(eighteenBNBCurve)).graduationTarget() == 0.18 ether
        );

        (bool belowSuccess,) = address(launchFactory).call{ value: 0.001 ether }(
            abi.encodeCall(
                launchFactory.createVanityToken,
                (vanityRequest("Below", "LOW", 0, ""))
            )
        );
        (bool aboveSuccess,) = address(launchFactory).call{ value: 0.001 ether }(
            abi.encodeCall(
                launchFactory.createVanityToken,
                (vanityRequest("Above", "HIGH", 19, ""))
            )
        );
        assert(!belowSuccess);
        assert(!aboveSuccess);
    }

    function testRejectsOversizedMetadataURI() public {
        string memory oversized = string(new bytes(257));
        (bool success,) = address(launchFactory).call{ value: 0.001 ether }(
            abi.encodeCall(
                launchFactory.createVanityToken,
                (vanityRequest("Oversized", "BIG", 5, oversized))
            )
        );
        assert(!success);
        assert(launchFactory.tokenCount() == 0);
    }

    function testBuyEnforcesDeadlineAndSlippage() public {
        (address tokenAddress,) = launchFactory.createVanityToken{
            value: 0.001 ether
        }(vanityRequest("Protected", "SAFE", 5, ""));

        (bool expiredSuccess,) = address(launchFactory).call{ value: 0.1 ether }(
            abi.encodeCall(
                launchFactory.buy,
                (tokenAddress, uint256(1), uint256(0), address(this))
            )
        );
        assert(!expiredSuccess);

        (bool slippageSuccess,) = address(launchFactory).call{ value: 0.1 ether }(
            abi.encodeCall(
                launchFactory.buy,
                (
                    tokenAddress,
                    type(uint256).max,
                    block.timestamp,
                    address(this)
                )
            )
        );
        assert(!slippageSuccess);
        assert(
            BondingCurve(payable(launchFactory.curveOf(tokenAddress)))
                .realBNBPrincipal() == 0
        );
    }

    function testPairLockDefeatsOneSidedWBNBGriefing() public {
        (address tokenAddress, address curveAddress,) =
            launchFactory.createVanityTokenAndBuy{ value: 0.011 ether }(
                vanityRequest("Pair Safe", "PAIRSAFE", 5, ""),
                BNBXFactory.BuyRequest(1, block.timestamp, address(this))
            );
        BNBXTokenV3 token = BNBXTokenV3(tokenAddress);
        BondingCurve curve = BondingCurve(payable(curveAddress));
        address pairAddress =
            pancakeFactory.getPair(tokenAddress, address(wbnb));
        MockPair pair = MockPair(pairAddress);

        assert(token.launchManager() == DEAD);
        assert(token.graduationAuthority() == curveAddress);
        (bool earlyPairTransfer,) = tokenAddress.call(
            abi.encodeCall(token.transfer, (pairAddress, 1 ether))
        );
        assert(!earlyPairTransfer);

        wbnb.deposit{ value: 0.001 ether }();
        wbnb.transfer(pairAddress, 0.001 ether);
        pair.sync();
        assert(pair.reserve0() == 0);
        assert(pair.reserve1() == uint112(0.001 ether));
        assert(pair.totalSupply() == 0);

        (uint256 acceptedGross,,, uint256 quotedTokens) =
            curve.quoteBuy(10 ether);
        launchFactory.buy{ value: acceptedGross }(
            tokenAddress,
            quotedTokens,
            block.timestamp,
            address(this)
        );

        assert(uint256(curve.state()) == uint256(BondingCurve.State.Graduated));
        assert(token.liquidityPairUnlocked());
        assert(token.graduationAuthority() == DEAD);
        assert(token.balanceOf(pairAddress) == 200_000_000 ether);
        assert(wbnb.balanceOf(pairAddress) == 0.051 ether);
        assert(pair.liquidityBalance(DEAD) > 0);
    }

    function testFailedRefundRevertsCompleteBuy() public {
        (address tokenAddress, address curveAddress) =
            launchFactory.createVanityToken{ value: 0.001 ether }(
                vanityRequest("Refund Safe", "REFUND", 5, "")
            );
        RevertingReceiver rejectingRefund = new RevertingReceiver();
        uint256 feeBalanceBefore = FEE_RECIPIENT.balance;

        (bool success,) = address(launchFactory).call{ value: 6 ether }(
            abi.encodeCall(
                launchFactory.buy,
                (
                    tokenAddress,
                    uint256(1),
                    block.timestamp,
                    address(rejectingRefund)
                )
            )
        );

        assert(!success);
        assert(
            BondingCurve(payable(curveAddress)).realBNBPrincipal() == 0
        );
        assert(BNBXTokenV3(tokenAddress).balanceOf(address(this)) == 0);
        assert(FEE_RECIPIENT.balance == feeBalanceBefore);
    }

    function testRejectingFeeRecipientRevertsCreation() public {
        (bool success,) = address(rejectingFactory).call{ value: 0.001 ether }(
            abi.encodeCall(
                rejectingFactory.createVanityToken,
                (vanityRequest("Reject Fee", "NOFEE", 5, ""))
            )
        );

        assert(!success);
        assert(rejectingFactory.tokenCount() == 0);
    }

    function testFeeRecipientCannotReenterFactory() public {
        protectedFactory.createVanityToken{ value: 0.001 ether }(
            vanityRequest("Protected", "LOCKED", 5, "")
        );

        assert(reentering.attempted());
        assert(!reentering.succeeded());
        assert(protectedFactory.tokenCount() == 1);
        assert(address(reentering).balance == 0.001 ether);
    }

    function testGraduatedLaunchCannotTradeAgain() public {
        (address tokenAddress, address curveAddress,) =
            launchFactory.createVanityTokenAndBuy{ value: 5.5 ether }(
                vanityRequest("Finished", "DONE", 5, ""),
                BNBXFactory.BuyRequest(1, block.timestamp, address(this))
            );
        BNBXTokenV3 token = BNBXTokenV3(tokenAddress);
        token.approve(curveAddress, 1 ether);

        (bool buySuccess,) = address(launchFactory).call{ value: 0.01 ether }(
            abi.encodeCall(
                launchFactory.buy,
                (
                    tokenAddress,
                    uint256(1),
                    block.timestamp,
                    address(this)
                )
            )
        );
        (bool sellSuccess,) = address(launchFactory).call(
            abi.encodeCall(
                launchFactory.sell,
                (tokenAddress, 1 ether, uint256(1), block.timestamp)
            )
        );

        assert(!buySuccess);
        assert(!sellSuccess);
        assert(
            uint256(BondingCurve(payable(curveAddress)).state())
                == uint256(BondingCurve.State.Graduated)
        );
    }
}

contract TradingIntegrationTest is FactoryIntegrationTest {
    function testPartialBuyThenSellChargesFeeBothWays() public {
        (, address curveAddress,) = launchFactory.createVanityTokenAndBuy{ value: 0.011 ether }(
            vanityRequest("Round Trip", "RT", 5, ""),
            BNBXFactory.BuyRequest(1, block.timestamp, address(this))
        );

        BondingCurve curve = BondingCurve(payable(curveAddress));
        BNBXTokenV3 token = BNBXTokenV3(address(curve.token()));
        uint256 principalAfterBuy = curve.realBNBPrincipal();
        uint256 tokensBought = token.balanceOf(address(this));
        uint256 sellAmount = tokensBought / 2;
        uint256 feesAfterBuy = FEE_RECIPIENT.balance;

        token.approve(curveAddress, sellAmount);
        uint256 sellerBalanceBefore = address(this).balance;
        uint256 netBNB = launchFactory.sell(
            address(token), sellAmount, 1, block.timestamp
        );

        assert(netBNB > 0);
        assert(address(this).balance - sellerBalanceBefore == netBNB);
        assert(curve.realBNBPrincipal() < principalAfterBuy);
        assert(token.balanceOf(address(this)) == tokensBought - sellAmount);
        assert(FEE_RECIPIENT.balance > feesAfterBuy);
        assert(uint256(curve.state()) == uint256(BondingCurve.State.Trading));
    }
}
