// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXAutoLiquidityToken } from "../src/BNBXAutoLiquidityToken.sol";
import { TemplateConfig } from "../src/libraries/TemplateConfig.sol";

contract AutoLiquidityRouterStub {
    address public constant WETH = address(0xBEEF);
}

contract TokenActor {
    function transferToken(
        BNBXAutoLiquidityToken token,
        address to,
        uint256 amount
    ) external {
        token.transfer(to, amount);
    }
}

contract BNBXAutoLiquidityTokenTest {
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    address internal constant MARKETING = address(0xCAFE);

    BNBXAutoLiquidityToken internal token;
    TokenActor internal pair;
    TokenActor internal buyer;

    function taxes()
        internal
        pure
        returns (TemplateConfig.Taxes memory configured)
    {
        configured = TemplateConfig.Taxes(
            TemplateConfig.SideTaxes(100, 100, 100, 0),
            TemplateConfig.SideTaxes(200, 300, 500, 0)
        );
    }

    function setUp() public {
        pair = new TokenActor();
        buyer = new TokenActor();
        token = new BNBXAutoLiquidityToken(
            "Taxed Meme",
            "TAX",
            address(this),
            address(new AutoLiquidityRouterStub()),
            MARKETING,
            taxes(),
            TemplateConfig.Template.AutoLiquidity,
            0
        );
        token.configureLaunch(address(this), address(pair));
    }

    function testFixedSupplyAndImmutableConfiguration() public view {
        assert(token.totalSupply() == 1_000_000_000 ether);
        assert(token.balanceOf(address(this)) == 1_000_000_000 ether);
        assert(token.marketingWallet() == MARKETING);
        (uint16 burn, uint16 liquidity, uint16 marketing, uint16 rewards) =
            token.buyTaxes();
        assert(burn == 100);
        assert(liquidity == 100);
        assert(marketing == 100);
        assert(rewards == 0);
    }

    function testBondingCurveTransfersStayTaxFreeBeforeGraduation() public {
        token.transfer(address(buyer), 10_000 ether);
        assert(token.balanceOf(address(buyer)) == 10_000 ether);
        assert(token.balanceOf(DEAD) == 0);
        assert(token.balanceOf(address(token)) == 0);
    }

    function testGraduationSeedTransferIsTaxExempt() public {
        token.unlockLiquidityPair();
        token.transfer(address(pair), 200_000_000 ether);
        assert(token.balanceOf(address(pair)) == 200_000_000 ether);
        assert(token.balanceOf(DEAD) == 0);
        assert(token.balanceOf(address(token)) == 0);
    }

    function testBuyTaxActivatesOnlyAfterGraduation() public {
        token.unlockLiquidityPair();
        token.transfer(address(pair), 1_000_000 ether);

        pair.transferToken(token, address(buyer), 10_000 ether);

        assert(token.balanceOf(address(buyer)) == 9_700 ether);
        assert(token.balanceOf(DEAD) == 100 ether);
        assert(token.balanceOf(address(token)) == 200 ether);
        assert(token.tokensForLiquidity() == 100 ether);
        assert(token.tokensForMarketing() == 100 ether);
    }

    function testSellUsesIndependentSellTax() public {
        token.transfer(address(buyer), 10_000 ether);
        token.unlockLiquidityPair();

        buyer.transferToken(token, address(pair), 10_000 ether);

        assert(token.balanceOf(address(pair)) == 9_000 ether);
        assert(token.balanceOf(DEAD) == 200 ether);
        assert(token.balanceOf(address(token)) == 800 ether);
        assert(token.tokensForLiquidity() == 300 ether);
        assert(token.tokensForMarketing() == 500 ether);
    }

    function testRejectsTaxAboveTwentyFivePercent() public {
        TemplateConfig.Taxes memory excessive = TemplateConfig.Taxes(
            TemplateConfig.SideTaxes(1_000, 1_000, 501, 0),
            TemplateConfig.SideTaxes(0, 0, 0, 0)
        );
        (bool success,) = address(this).call(
            abi.encodeWithSelector(
                this.deployWithTaxes.selector, excessive
            )
        );
        assert(!success);
    }

    function deployWithTaxes(TemplateConfig.Taxes memory configured) external {
        new BNBXAutoLiquidityToken(
            "Bad",
            "BAD",
            address(this),
            address(new AutoLiquidityRouterStub()),
            MARKETING,
            configured,
            TemplateConfig.Template.AutoLiquidity,
            0
        );
    }
}
