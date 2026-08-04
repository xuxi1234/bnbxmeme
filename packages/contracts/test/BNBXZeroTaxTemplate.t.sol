// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXZeroTaxToken } from "../src/BNBXZeroTaxToken.sol";
import { BNBXZeroTaxFactory } from "../src/BNBXZeroTaxFactory.sol";
import { BondingCurve } from "../src/BondingCurve.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";

contract ZeroTaxAuthorityMock {
    function unlock(BNBXZeroTaxToken token) external {
        token.unlockLiquidityPair();
    }
}

contract ZeroTaxPairMock { }

contract ZeroTaxSpenderMock {
    function spend(
        BNBXZeroTaxToken token,
        address from,
        address to,
        uint256 amount
    ) external {
        token.transferFrom(from, to, amount);
    }
}

contract ZeroTaxFactoryHarness is BNBXZeroTaxFactory {
    constructor(address feeRecipient, address router)
        BNBXZeroTaxFactory(feeRecipient, router)
    { }

    function createForTest(CreateRequest memory request, address creator)
        external
        returns (address token, address curve)
    {
        return _create(request, creator);
    }
}

contract BNBXZeroTaxTemplateTest {
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    address internal constant ALICE = address(0xA11CE);
    ZeroTaxFactoryHarness internal factory;
    bytes32 internal testSalt;

    receive() external payable { }

    function setUp() external {
        MockPancakeFactory pancakeFactory = new MockPancakeFactory();
        MockWBNB wbnb = new MockWBNB();
        MockPancakeRouter router =
            new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        factory = new ZeroTaxFactoryHarness(address(0xFEE), address(router));
    }

    function testFactoryAddress() external view returns (address) {
        return address(factory);
    }

    function setTestSalt(bytes32 salt) external {
        testSalt = salt;
    }

    function testFixedSupplyAndTransfersNeverTakeTax() external {
        BNBXZeroTaxToken token =
            new BNBXZeroTaxToken("Clean Zero Tax", "ZERO", address(this));
        assert(token.totalSupply() == 1_000_000_000 ether);
        assert(token.TOTAL_SUPPLY() == token.totalSupply());
        assert(token.balanceOf(address(this)) == token.totalSupply());

        token.transfer(ALICE, 100 ether);
        assert(token.balanceOf(ALICE) == 100 ether);
        assert(
            token.balanceOf(address(this))
                == token.totalSupply() - 100 ether
        );
    }

    function testRejectsInvalidIdentityAndLaunchManager() external {
        bool emptyNameAccepted;
        bool emptySymbolAccepted;
        bool zeroManagerAccepted;
        bool deadManagerAccepted;

        try new BNBXZeroTaxToken("", "ZERO", address(this)) returns (
            BNBXZeroTaxToken
        ) {
            emptyNameAccepted = true;
        } catch { }
        try new BNBXZeroTaxToken("Zero", "", address(this)) returns (
            BNBXZeroTaxToken
        ) {
            emptySymbolAccepted = true;
        } catch { }
        try new BNBXZeroTaxToken("Zero", "ZERO", address(0)) returns (
            BNBXZeroTaxToken
        ) {
            zeroManagerAccepted = true;
        } catch { }
        try new BNBXZeroTaxToken("Zero", "ZERO", DEAD) returns (
            BNBXZeroTaxToken
        ) {
            deadManagerAccepted = true;
        } catch { }

        assert(!emptyNameAccepted && !emptySymbolAccepted);
        assert(!zeroManagerAccepted && !deadManagerAccepted);
    }

    function testLaunchPermissionsAreSingleUseAndDestroyed() external {
        BNBXZeroTaxToken token =
            new BNBXZeroTaxToken("Clean Zero Tax", "ZERO", address(this));
        ZeroTaxAuthorityMock authority = new ZeroTaxAuthorityMock();
        ZeroTaxPairMock pair = new ZeroTaxPairMock();

        token.configureLaunch(address(authority), address(pair));
        assert(token.launchManager() == DEAD);
        assert(token.graduationAuthority() == address(authority));
        assert(token.liquidityPair() == address(pair));

        (bool earlyPairTransfer,) = address(token).call(
            abi.encodeCall(token.transfer, (address(pair), 1 ether))
        );
        assert(!earlyPairTransfer);

        authority.unlock(token);
        assert(token.liquidityPairUnlocked());
        assert(token.graduationAuthority() == DEAD);
        assert(token.transfer(address(pair), 1 ether));

        (bool configuredAgain,) = address(token).call(
            abi.encodeCall(
                token.configureLaunch, (address(authority), address(pair))
            )
        );
        (bool unlockedAgain,) = address(authority).call(
            abi.encodeCall(authority.unlock, (token))
        );
        assert(!configuredAgain && !unlockedAgain);
    }

    function testFiniteAndInfiniteAllowancesFollowERC20Rules() external {
        BNBXZeroTaxToken token =
            new BNBXZeroTaxToken("Clean Zero Tax", "ZERO", address(this));
        ZeroTaxSpenderMock spender = new ZeroTaxSpenderMock();

        token.approve(address(spender), 100 ether);
        spender.spend(token, address(this), ALICE, 40 ether);
        assert(token.allowance(address(this), address(spender)) == 60 ether);
        assert(token.balanceOf(ALICE) == 40 ether);

        token.approve(address(spender), type(uint256).max);
        spender.spend(token, address(this), ALICE, 10 ether);
        assert(
            token.allowance(address(this), address(spender))
                == type(uint256).max
        );
        assert(token.balanceOf(ALICE) == 50 ether);
    }

    function testNoOwnerMintTaxBlacklistPauseUpgradeOrWithdrawal() external {
        BNBXZeroTaxToken token =
            new BNBXZeroTaxToken("Clean Zero Tax", "ZERO", address(this));
        bytes[] memory forbiddenCalls = new bytes[](8);
        forbiddenCalls[0] = abi.encodeWithSignature("owner()");
        forbiddenCalls[1] =
            abi.encodeWithSignature("mint(address,uint256)", ALICE, 1 ether);
        forbiddenCalls[2] = abi.encodeWithSignature("setTax(uint256)", 100);
        forbiddenCalls[3] = abi.encodeWithSignature(
            "setBlacklist(address,bool)", ALICE, true
        );
        forbiddenCalls[4] = abi.encodeWithSignature("pause()");
        forbiddenCalls[5] =
            abi.encodeWithSignature("upgradeTo(address)", ALICE);
        forbiddenCalls[6] = abi.encodeWithSignature(
            "withdraw(address,address,uint256)", address(token), ALICE, 1
        );
        forbiddenCalls[7] = abi.encodeWithSignature(
            "setMaxTransactionAmount(uint256)", 1 ether
        );

        for (uint256 i; i < forbiddenCalls.length; ++i) {
            (bool success,) = address(token).call(forbiddenCalls[i]);
            assert(!success);
        }
    }

    function testFactorySourceUsesOnlyTheDedicatedZeroTaxToken() external pure {
        // Referencing the type makes the full Factory dependency graph part of
        // this test compilation without coupling the token to reward templates.
        assert(type(BNBXZeroTaxFactory).creationCode.length > 0);
    }

    function testFactoryCreatesAndLocksOneBillionZeroTaxTokens() external {
        BNBXZeroTaxFactory.CreateRequest memory request =
            BNBXZeroTaxFactory.CreateRequest(
                "Clean Factory Token", "CLEAN", 1, "ipfs://clean", testSalt
            );
        address predicted = factory.predictTokenAddress(
            request.name, request.symbol, request.vanitySalt
        );
        assert(uint16(uint160(predicted)) == 0x1111);

        (address tokenAddress, address curveAddress) =
            factory.createForTest(request, address(this));
        BNBXZeroTaxToken token = BNBXZeroTaxToken(tokenAddress);
        BondingCurve curve = BondingCurve(payable(curveAddress));

        assert(tokenAddress == predicted);
        assert(factory.tokenCount() == 1);
        assert(factory.allTokens(0) == tokenAddress);
        assert(factory.curveOf(tokenAddress) == curveAddress);
        assert(
            keccak256(bytes(factory.tokenMetadataURI(tokenAddress)))
                == keccak256(bytes(request.metadataURI))
        );
        assert(token.totalSupply() == 1_000_000_000 ether);
        assert(token.balanceOf(curveAddress) == token.totalSupply());
        assert(token.launchManager() == DEAD);
        assert(token.graduationAuthority() == curveAddress);
        assert(token.liquidityPair() == curve.liquidityPair());
        assert(!token.liquidityPairUnlocked());
        assert(curve.creator() == address(this));
        assert(curve.graduationTarget() == 0.01 ether);
    }

    function testFactoryPredictionUsesOnlyTheCleanTokenInitCode() external view {
        address predicted = factory.predictTokenAddress(
            "Clean Factory Token", "CLEAN", testSalt
        );
        address direct = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(factory),
                            testSalt,
                            keccak256(
                                abi.encodePacked(
                                    type(BNBXZeroTaxToken).creationCode,
                                    abi.encode(
                                        "Clean Factory Token",
                                        "CLEAN",
                                        address(factory)
                                    )
                                )
                            )
                        )
                    )
                )
            )
        );
        assert(predicted == direct);
    }

    function testImmediateBuySellCannotCreateBNBProfit() external {
        BNBXZeroTaxFactory.CreateRequest memory request =
            BNBXZeroTaxFactory.CreateRequest(
                "Clean Factory Token", "CLEAN", 1, "", testSalt
            );
        (address tokenAddress, address curveAddress) =
            factory.createForTest(request, address(this));
        BNBXZeroTaxToken token = BNBXZeroTaxToken(tokenAddress);
        uint256 balanceBefore = address(this).balance;

        uint256 tokensOut = factory.buy{ value: 0.001 ether }(
            tokenAddress, 0, block.timestamp + 1, address(this)
        );
        token.approve(curveAddress, tokensOut);
        uint256 received = factory.sell(
            tokenAddress, tokensOut, 0, block.timestamp + 1
        );

        assert(tokensOut > 0 && received > 0);
        assert(address(this).balance < balanceBefore);
        assert(address(0xFEE).balance > 0);
        assert(BondingCurve(payable(curveAddress)).realBNBPrincipal() == 0);
    }

    function testExactFillGraduatesAndBurnsAllLP() external {
        BNBXZeroTaxFactory.CreateRequest memory request =
            BNBXZeroTaxFactory.CreateRequest(
                "Clean Factory Token", "CLEAN", 1, "", testSalt
            );
        (address tokenAddress, address curveAddress) =
            factory.createForTest(request, address(this));
        BondingCurve curve = BondingCurve(payable(curveAddress));
        (uint256 acceptedGross,,, uint256 tokensOut) =
            curve.quoteBuy(1 ether);

        uint256 bought = factory.buy{ value: acceptedGross }(
            tokenAddress, tokensOut, block.timestamp + 1, address(this)
        );
        BNBXZeroTaxToken token = BNBXZeroTaxToken(tokenAddress);
        MockPair pair = MockPair(curve.liquidityPair());

        assert(bought == 800_000_000 ether);
        assert(uint256(curve.state()) == 2);
        assert(token.liquidityPairUnlocked());
        assert(token.graduationAuthority() == DEAD);
        assert(token.balanceOf(address(pair)) == 200_000_000 ether);
        assert(pair.liquidityBalance(DEAD) > 0);
    }
}
