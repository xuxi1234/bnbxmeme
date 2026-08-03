// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXTokenV4 } from "../src/BNBXTokenV4.sol";
import { BNBXDividendTokenV4 } from "../src/BNBXDividendTokenV4.sol";
import { BNBXRewardsFactoryV4 } from "../src/BNBXRewardsFactoryV4.sol";
import { BNBXAdvancedTokenDeployerV4 } from "../src/BNBXAdvancedTokenDeployerV4.sol";
import { TemplateConfigV4 } from "../src/libraries/TemplateConfigV4.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";
import { RewardAssetMock } from "./DividendFactoryIntegration.t.sol";

contract RewardsFactoryV4Harness is BNBXRewardsFactoryV4 {
    constructor(address feeRecipient, address router, address deployer)
        BNBXRewardsFactoryV4(feeRecipient, router, deployer)
    { }

    function validateMinimum(CreateRequest memory request) external pure {
        _validateMinimumRewardShare(request);
    }

    function createForTest(CreateRequest memory request, address creator)
        external
        returns (address token, address curve)
    {
        return _create(request, creator);
    }
}

contract BNBXV4SecurityTest {
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    address internal constant ALICE = address(0xA11CE);

    MockPancakeFactory internal pancakeFactory;
    MockPancakeRouter internal router;
    MockWBNB internal wbnb;
    RewardAssetMock internal rewardToken;

    function setUp() public {
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        rewardToken = new RewardAssetMock();
        address rewardPair =
            pancakeFactory.createPair(address(rewardToken), address(wbnb));
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);
    }

    function testZeroTaxV4HasNoOwnerMintBlacklistOrTaxSetter() public {
        BNBXTokenV4 token = new BNBXTokenV4("Clean", "CLN", address(this));
        assert(token.totalSupply() == 1_000_000_000 ether);
        token.transfer(ALICE, 10 ether);
        assert(token.balanceOf(ALICE) == 10 ether);

        (bool ownerSuccess,) =
            address(token).call(abi.encodeWithSignature("owner()"));
        (bool mintSuccess,) = address(token).call(
            abi.encodeWithSignature("mint(address,uint256)", ALICE, 1 ether)
        );
        (bool blacklistSuccess,) = address(token).call(
            abi.encodeWithSignature("setBlacklist(address,bool)", ALICE, true)
        );
        (bool taxSuccess,) = address(token).call(
            abi.encodeWithSignature("setTax(uint256)", 1_000)
        );
        assert(!ownerSuccess && !mintSuccess && !blacklistSuccess && !taxSuccess);
    }

    function testHolderMinimumIsStrictlyAboveOneThousandOnToken() public {
        bool boundaryAccepted;
        try new BNBXDividendTokenV4(
            _init(TemplateConfigV4.Template.HolderRewards, 1_000 ether)
        ) returns (BNBXDividendTokenV4) {
            boundaryAccepted = true;
        } catch { }
        assert(!boundaryAccepted);

        BNBXDividendTokenV4 token = new BNBXDividendTokenV4(
            _init(TemplateConfigV4.Template.HolderRewards, 1_000 ether + 1)
        );
        assert(token.minimumRewardShare() == 1_000 ether + 1);
    }

    function testFactoryAlsoRejectsBypassedHolderMinimum() public {
        BNBXAdvancedTokenDeployerV4 deployer =
            new BNBXAdvancedTokenDeployerV4(address(this));
        RewardsFactoryV4Harness factory = new RewardsFactoryV4Harness(
            address(this), address(router), address(deployer)
        );
        deployer.configureManager(address(factory));

        BNBXRewardsFactoryV4.CreateRequest memory request =
            _request(TemplateConfigV4.Template.HolderRewards, 1_000 ether);
        (bool boundarySuccess,) = address(factory).call(
            abi.encodeCall(factory.validateMinimum, (request))
        );
        assert(!boundarySuccess);

        request.minimumRewardShare = 1_000 ether + 1;
        factory.validateMinimum(request);
        request.template = TemplateConfigV4.Template.LPRewards;
        request.minimumRewardShare = 1;
        factory.validateMinimum(request);
    }

    function testDividendLaunchRolesAreOneTimeAndDestroyed() public {
        BNBXDividendTokenV4 token = new BNBXDividendTokenV4(
            _init(TemplateConfigV4.Template.HolderRewards, 1_000 ether + 1)
        );
        address pair =
            pancakeFactory.createPair(address(token), address(wbnb));
        token.configureLaunch(address(this), pair);

        (bool configureAgain,) = address(token).call(
            abi.encodeCall(token.configureLaunch, (address(this), pair))
        );
        assert(!configureAgain);
        assert(token.launchManager() == DEAD);
        token.unlockLiquidityPair();
        assert(token.graduationAuthority() == DEAD);
        assert(token.taxesEnabled());

        (bool unlockAgain,) =
            address(token).call(abi.encodeCall(token.unlockLiquidityPair, ()));
        assert(!unlockAgain);
        (bool ownerSuccess,) =
            address(token).call(abi.encodeWithSignature("owner()"));
        (bool feeSetterSuccess,) = address(token).call(
            abi.encodeWithSignature("setTradeFee(uint256[])", new uint256[](8))
        );
        (bool withdrawSuccess,) = address(token).call(
            abi.encodeWithSignature(
                "withdraw(address,address,uint256)",
                address(rewardToken),
                address(this),
                1
            )
        );
        assert(!ownerSuccess && !feeSetterSuccess && !withdrawSuccess);
    }

    function testFactoryManagerBindingCannotBeChanged() public {
        BNBXAdvancedTokenDeployerV4 deployer =
            new BNBXAdvancedTokenDeployerV4(address(this));
        RewardsFactoryV4Harness factory = new RewardsFactoryV4Harness(
            address(this), address(router), address(deployer)
        );
        deployer.configureManager(address(factory));
        assert(deployer.manager() == address(factory));

        (bool changed,) = address(deployer).call(
            abi.encodeCall(deployer.configureManager, (address(factory)))
        );
        assert(!changed);
    }

    function testRewardsFactoryCreatesConfiguredV4TokenAndDestroysSetupRole()
        public
    {
        BNBXAdvancedTokenDeployerV4 deployer =
            new BNBXAdvancedTokenDeployerV4(address(this));
        RewardsFactoryV4Harness factory = new RewardsFactoryV4Harness(
            address(this), address(router), address(deployer)
        );
        deployer.configureManager(address(factory));

        BNBXRewardsFactoryV4.CreateRequest memory request =
            _request(TemplateConfigV4.Template.HolderRewards, 1_000_000 ether);
        uint256 start;
        bool found;
        address predicted;
        for (uint256 round; round < 12 && !found; ++round) {
            (found, request.vanitySalt, predicted) =
                factory.findVanitySalt(request, start, 20_000);
            start += 20_000;
        }
        assert(found && uint16(uint160(predicted)) == 0x1111);

        (address tokenAddress, address curveAddress) =
            factory.createForTest(request, address(this));
        BNBXDividendTokenV4 token =
            BNBXDividendTokenV4(payable(tokenAddress));
        assert(tokenAddress == predicted);
        assert(factory.curveOf(tokenAddress) == curveAddress);
        assert(token.launchManager() == DEAD);
        assert(token.minimumRewardShare() == 1_000_000 ether);
        assert(address(token.rewardToken()) == address(rewardToken));
        assert(token.balanceOf(curveAddress) == token.TOTAL_SUPPLY());
        assert(token.rewardVault().controller() == tokenAddress);
    }

    function _init(TemplateConfigV4.Template template, uint256 minimumShare)
        internal
        view
        returns (BNBXDividendTokenV4.Init memory)
    {
        return BNBXDividendTokenV4.Init(
            "Dividend V4",
            "DIV4",
            address(this),
            address(router),
            address(this),
            address(rewardToken),
            _zeroTaxes(),
            template,
            minimumShare
        );
    }

    function _request(TemplateConfigV4.Template template, uint256 minimumShare)
        internal
        view
        returns (BNBXRewardsFactoryV4.CreateRequest memory)
    {
        return BNBXRewardsFactoryV4.CreateRequest(
            "Dividend V4",
            "DIV4",
            1,
            "",
            bytes32(0),
            address(this),
            address(rewardToken),
            _zeroTaxes(),
            template,
            minimumShare
        );
    }

    function _zeroTaxes()
        internal
        pure
        returns (TemplateConfigV4.Taxes memory)
    {
        return TemplateConfigV4.Taxes(
            TemplateConfigV4.SideTaxes(0, 0, 0, 0),
            TemplateConfigV4.SideTaxes(0, 0, 0, 0)
        );
    }
}
