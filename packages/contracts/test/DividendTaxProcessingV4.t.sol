// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXDividendTokenV4 } from "../src/BNBXDividendTokenV4.sol";
import { BNBXRewardVaultV4 } from "../src/BNBXRewardVaultV4.sol";
import { IERC20Minimal } from "../src/interfaces/IERC20Minimal.sol";
import { TemplateConfigV4 } from "../src/libraries/TemplateConfigV4.sol";
import {
    MockPancakeFactory,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";
import { RewardAssetMock } from "./DividendFactoryIntegration.t.sol";

contract TaxProcessingRouterV4Mock {
    address public immutable factory;
    address public immutable WETH;
    bool public failQuotes;

    constructor(address factory_, address wbnb_) {
        factory = factory_;
        WETH = wbnb_;
    }

    receive() external payable {}

    function setFailQuotes(bool value) external {
        failQuotes = value;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        require(!failQuotes, "QUOTE_FAILED");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        uint256 output = path[0] == WETH ? amountIn : amountIn / 1_000_000;
        for (uint256 i = 1; i < path.length; ++i) amounts[i] = output;
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata,
        address to,
        uint256
    ) external {
        uint256 bnbOut = amountIn / 1_000_000;
        require(bnbOut >= amountOutMin, "MIN_OUT");
        require(
            IERC20Minimal(msg.sender).transferFrom(msg.sender, address(this), amountIn),
            "TRANSFER_IN"
        );
        (bool success,) = to.call{ value: bnbOut }("");
        require(success, "BNB_OUT");
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable {
        require(msg.value >= amountOutMin, "MIN_OUT");
        (bool success,) = path[path.length - 1].call(
            abi.encodeWithSignature("mint(address,uint256)", to, msg.value)
        );
        require(success, "REWARD_MINT");
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
        require(pair != address(0), "PAIR_MISSING");
        require(
            IERC20Minimal(token).transferFrom(msg.sender, pair, amountTokenDesired),
            "LIQUIDITY_TRANSFER"
        );
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = amountTokenDesired + msg.value;
        MockPair(pair).seed(amountToken, amountETH, to, liquidity);
    }
}

contract TokenSellerV4 {
    function sell(BNBXDividendTokenV4 token, address pair, uint256 amount) external {
        token.transfer(pair, amount);
    }
}

contract DividendTaxProcessingV4Test {
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    MockPancakeFactory internal pancakeFactory;
    MockWBNB internal wbnb;
    TaxProcessingRouterV4Mock internal router;
    RewardAssetMock internal rewardToken;
    BNBXDividendTokenV4 internal token;
    BNBXRewardVaultV4 internal vault;
    MockPair internal pair;
    TokenSellerV4 internal seller;

    receive() external payable {}

    function setUp() public {
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new TaxProcessingRouterV4Mock(
            address(pancakeFactory), address(wbnb)
        );
        (bool funded,) = address(router).call{ value: 5 ether }("");
        require(funded, "ROUTER_FUNDING");
        rewardToken = new RewardAssetMock();
        address rewardPair =
            pancakeFactory.createPair(address(rewardToken), address(wbnb));
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);

        TemplateConfigV4.Taxes memory taxes = TemplateConfigV4.Taxes(
            TemplateConfigV4.SideTaxes(100, 100, 100, 100),
            TemplateConfigV4.SideTaxes(250, 250, 250, 250)
        );
        BNBXDividendTokenV4.Init memory init = BNBXDividendTokenV4.Init(
            "Tax Processing V4",
            "TPV4",
            address(this),
            address(router),
            address(this),
            address(rewardToken),
            taxes,
            TemplateConfigV4.Template.HolderRewards,
            10_000 ether
        );
        token = new BNBXDividendTokenV4(init);
        pair = MockPair(
            pancakeFactory.createPair(address(token), address(wbnb))
        );
        token.configureLaunch(address(this), address(pair));
        seller = new TokenSellerV4();
        token.transfer(address(seller), 30_000_000 ether);
        token.unlockLiquidityPair();
        token.transfer(address(pair), 200_000_000 ether);
        vault = token.rewardVault();
    }

    function testProcessesAllBucketsAndBurnsAutomaticLP() public {
        seller.sell(token, address(pair), 20_000_000 ether);
        assert(token.balanceOf(DEAD) == 500_000 ether);
        assert(token.balanceOf(address(token)) == 1_500_000 ether);

        uint256 marketingBefore = address(this).balance;
        token.processTaxes();

        assert(pair.liquidityBalance(DEAD) > 0);
        assert(address(this).balance > marketingBefore);
        assert(rewardToken.balanceOf(address(seller)) > 0);
        assert(vault.claimable(address(seller)) == 0);
        assert(vault.totalRewardsClaimed() == vault.totalRewardsReceived());
        assert(rewardToken.balanceOf(address(vault)) == 0);
        assert(token.tokensForLiquidity() == 0);
        assert(token.tokensForMarketing() == 0);
        assert(token.tokensForRewards() == 0);
    }

    function testFailedAutomaticProcessingCannotBlockSell() public {
        seller.sell(token, address(pair), 20_000_000 ether);
        router.setFailQuotes(true);
        uint256 pairBefore = token.balanceOf(address(pair));
        seller.sell(token, address(pair), 1_000_000 ether);
        assert(token.balanceOf(address(pair)) > pairBefore);
        assert(token.balanceOf(address(token)) > 1_500_000 ether);
    }

    function testPartialProcessingWithZeroMarketingTaxCannotUnderflow() public {
        TemplateConfigV4.Taxes memory taxes = TemplateConfigV4.Taxes(
            TemplateConfigV4.SideTaxes(0, 0, 0, 0),
            TemplateConfigV4.SideTaxes(0, 500, 0, 500)
        );
        BNBXDividendTokenV4.Init memory init = BNBXDividendTokenV4.Init(
            "Zero Marketing V4",
            "ZMV4",
            address(this),
            address(router),
            address(this),
            address(rewardToken),
            taxes,
            TemplateConfigV4.Template.HolderRewards,
            10_000 ether
        );
        BNBXDividendTokenV4 zeroMarketingToken =
            new BNBXDividendTokenV4(init);
        MockPair zeroMarketingPair = MockPair(
            pancakeFactory.createPair(address(zeroMarketingToken), address(wbnb))
        );
        zeroMarketingToken.configureLaunch(
            address(this), address(zeroMarketingPair)
        );
        TokenSellerV4 zeroMarketingSeller = new TokenSellerV4();
        zeroMarketingToken.transfer(
            address(zeroMarketingSeller), 100_000_000 ether
        );
        zeroMarketingToken.unlockLiquidityPair();
        zeroMarketingToken.transfer(
            address(zeroMarketingPair), 200_000_000 ether
        );

        router.setFailQuotes(true);
        zeroMarketingSeller.sell(
            zeroMarketingToken, address(zeroMarketingPair), 20_000_000 ether
        );
        zeroMarketingSeller.sell(
            zeroMarketingToken, address(zeroMarketingPair), 60_000_000 ether
        );
        router.setFailQuotes(false);

        zeroMarketingToken.processTaxes();

        assert(zeroMarketingToken.tokensForMarketing() == 0);
        assert(zeroMarketingToken.tokensForLiquidity() == 1_500_000 ether);
        assert(zeroMarketingToken.tokensForRewards() == 1_500_000 ether);
    }
}
