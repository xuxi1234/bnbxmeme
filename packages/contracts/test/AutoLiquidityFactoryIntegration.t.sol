// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXAutoLiquidityFactory } from "../src/BNBXAutoLiquidityFactory.sol";
import { BNBXAutoLiquidityToken } from "../src/BNBXAutoLiquidityToken.sol";
import { BNBXAdvancedTokenDeployer } from "../src/BNBXAdvancedTokenDeployer.sol";
import { BNBXRewardVault } from "../src/BNBXRewardVault.sol";
import { BondingCurve } from "../src/BondingCurve.sol";
import { TemplateConfig } from "../src/libraries/TemplateConfig.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";

interface VmAutoLiquidity {
    function deal(address account, uint256 newBalance) external;
}

contract AutoLiquidityFactoryIntegrationTest {
    VmAutoLiquidity private constant vm =
        VmAutoLiquidity(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    MockPancakeFactory internal pancakeFactory;
    MockPancakeRouter internal router;
    MockWBNB internal wbnb;
    BNBXAutoLiquidityFactory internal factory;

    receive() external payable {}

    function setUp() public {
        if (address(this).balance < 10 ether) vm.deal(address(this), 10 ether);
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        BNBXAdvancedTokenDeployer deployer =
            new BNBXAdvancedTokenDeployer(address(this));
        factory = new BNBXAutoLiquidityFactory(
            FEE_RECIPIENT, address(router), address(deployer)
        );
        deployer.configureManager(address(factory));
    }

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

    function request(string memory name, string memory symbol, uint8 target)
        internal
        view
        returns (BNBXAutoLiquidityFactory.CreateRequest memory configured)
    {
        TemplateConfig.Taxes memory launchTaxes = taxes();
        (bool found, bytes32 salt,) = factory.findVanitySalt(
            name,
            symbol,
            address(this),
            launchTaxes,
            TemplateConfig.Template.AutoLiquidity,
            0,
            0,
            500_000
        );
        require(found, "VANITY_NOT_FOUND");
        configured = BNBXAutoLiquidityFactory.CreateRequest(
            name,
            symbol,
            target,
            "ipfs://auto-liquidity",
            salt,
            address(this),
            launchTaxes,
            TemplateConfig.Template.AutoLiquidity,
            0
        );
    }

    function rewardRequest(
        string memory name,
        string memory symbol,
        TemplateConfig.Template template
    )
        internal
        view
        returns (BNBXAutoLiquidityFactory.CreateRequest memory configured)
    {
        TemplateConfig.Taxes memory launchTaxes = TemplateConfig.Taxes(
            TemplateConfig.SideTaxes(0, 100, 100, 100),
            TemplateConfig.SideTaxes(0, 100, 100, 200)
        );
        uint256 minimumShare = 10_000 ether;
        (bool found, bytes32 salt,) = factory.findVanitySalt(
            name,
            symbol,
            address(this),
            launchTaxes,
            template,
            minimumShare,
            0,
            500_000
        );
        require(found, "VANITY_NOT_FOUND");
        configured = BNBXAutoLiquidityFactory.CreateRequest(
            name,
            symbol,
            5,
            "ipfs://rewards",
            salt,
            address(this),
            launchTaxes,
            template,
            minimumShare
        );
    }

    function testCreateWithoutBuyKeepsCurveTaxFree() public {
        (address tokenAddress, address curveAddress) =
            factory.createVanityToken{ value: 0.001 ether }(
                request("Auto Tax", "AUTO", 5)
            );
        BNBXAutoLiquidityToken token =
            BNBXAutoLiquidityToken(payable(tokenAddress));

        assert(uint16(uint160(tokenAddress)) == 0x1111);
        assert(factory.curveOf(tokenAddress) == curveAddress);
        assert(token.balanceOf(curveAddress) == 1_000_000_000 ether);
        assert(!token.taxesEnabled());
        assert(token.balanceOf(address(token)) == 0);
        assert(token.balanceOf(DEAD) == 0);
    }

    function testAtomicFillGraduatesAndActivatesTax() public {
        (address tokenAddress, address curveAddress, uint256 tokensOut) =
            factory.createVanityTokenAndBuy{ value: 1.1 ether }(
                request("Graduated Tax", "GTAX", 1),
                BNBXAutoLiquidityFactory.BuyRequest(
                    799_999_999 ether, block.timestamp, address(this)
                )
            );
        BNBXAutoLiquidityToken token =
            BNBXAutoLiquidityToken(payable(tokenAddress));
        BondingCurve curve = BondingCurve(payable(curveAddress));
        address pairAddress =
            pancakeFactory.getPair(tokenAddress, address(wbnb));
        MockPair pair = MockPair(pairAddress);

        assert(tokensOut == 800_000_000 ether);
        assert(token.balanceOf(address(this)) == 800_000_000 ether);
        assert(token.balanceOf(pairAddress) == 200_000_000 ether);
        assert(token.balanceOf(address(token)) == 0);
        assert(token.balanceOf(DEAD) == 0);
        assert(token.taxesEnabled());
        assert(token.liquidityPairUnlocked());
        assert(
            uint256(curve.state()) == uint256(BondingCurve.State.Graduated)
        );
        assert(pair.liquidityBalance(DEAD) > 0);
    }

    function testCreatesHolderRewardsTemplateWithExcludedCurveAndPair() public {
        (address tokenAddress, address curveAddress) =
            factory.createVanityToken{ value: 0.001 ether }(
                rewardRequest(
                    "Holder Rewards",
                    "HOLD",
                    TemplateConfig.Template.HolderRewards
                )
            );
        BNBXAutoLiquidityToken token =
            BNBXAutoLiquidityToken(payable(tokenAddress));
        BNBXRewardVault vault = token.rewardVault();
        assert(
            uint8(vault.mode())
                == uint8(BNBXRewardVault.Mode.Holder)
        );
        assert(vault.isExcluded(curveAddress));
        assert(vault.isExcluded(token.liquidityPair()));
        assert(token.minimumRewardShare() == 10_000 ether);
    }

    function testCreatesLPRewardsTemplateAndConfiguresPairAsset() public {
        (address tokenAddress,) =
            factory.createVanityToken{ value: 0.001 ether }(
                rewardRequest(
                    "LP Rewards",
                    "LPRE",
                    TemplateConfig.Template.LPRewards
                )
            );
        BNBXAutoLiquidityToken token =
            BNBXAutoLiquidityToken(payable(tokenAddress));
        BNBXRewardVault vault = token.rewardVault();
        assert(
            uint8(vault.mode())
                == uint8(BNBXRewardVault.Mode.LiquidityProvider)
        );
        assert(vault.shareAsset() == token.liquidityPair());
        assert(vault.isExcluded(vault.DEAD()));
    }
}
