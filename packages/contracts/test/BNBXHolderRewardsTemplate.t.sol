// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXHolderRewardsToken } from "../src/BNBXHolderRewardsToken.sol";
import { BNBXHolderRewardsTokenDeployer } from "../src/BNBXHolderRewardsTokenDeployer.sol";
import { BNBXHolderRewardsFactory } from "../src/BNBXHolderRewardsFactory.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";
import { TaxProcessingRouterV4Mock } from "./DividendTaxProcessingV4.t.sol";

contract HolderRewardAssetMock {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            allowance[from][msg.sender] = permitted - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract HolderSeller {
    function sell(BNBXHolderRewardsToken token, address pair, uint256 amount)
        external
    {
        token.transfer(pair, amount);
    }
}

contract HolderPairActor {
    function send(BNBXHolderRewardsToken token, address to, uint256 amount)
        external
    {
        token.transfer(to, amount);
    }
}

contract HolderCurveAuthority {
    function unlock(BNBXHolderRewardsToken token) external {
        token.unlockLiquidityPair();
    }
}

contract HolderTokenDeployerHarness {
    BNBXHolderRewardsTokenDeployer public immutable deployer;

    constructor() {
        deployer = new BNBXHolderRewardsTokenDeployer();
    }

    function predict(bytes32 salt, BNBXHolderRewardsToken.Init calldata init)
        external
        view
        returns (address)
    {
        return deployer.predict(salt, init);
    }

    function deploy(bytes32 salt, BNBXHolderRewardsToken.Init calldata init)
        external
        returns (BNBXHolderRewardsToken)
    {
        return deployer.deploy(salt, init);
    }
}

contract BNBXHolderRewardsTemplateTest {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant FEE_RECIPIENT = address(0xFEE);

    HolderRewardAssetMock internal reward;
    MockPancakeFactory internal pancakeFactory;
    MockWBNB internal wbnb;
    MockPancakeRouter internal router;
    BNBXHolderRewardsFactory internal factory;

    function setUp() external {
        reward = new HolderRewardAssetMock();
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        address rewardPair = pancakeFactory.createPair(address(reward), address(wbnb));
        MockPair(rewardPair).seed(1 ether, 1 ether, address(0xBEEF), 1 ether);
        factory = new BNBXHolderRewardsFactory(
            FEE_RECIPIENT, address(router), address(reward)
        );
    }

    function _taxes(uint16 liquidity, uint16 rewards, uint16 burn)
        internal
        pure
        returns (BNBXHolderRewardsToken.Taxes memory taxes)
    {
        taxes.buy = BNBXHolderRewardsToken.SideTaxes(liquidity, rewards, burn);
        taxes.sell = BNBXHolderRewardsToken.SideTaxes(liquidity, rewards, burn);
    }

    function _init(address launchManager, address rewardToken)
        internal
        view
        returns (BNBXHolderRewardsToken.Init memory)
    {
        return BNBXHolderRewardsToken.Init({
            name: "Holder Rewards V2",
            symbol: "HRV2",
            launchManager: launchManager,
            router: address(router),
            rewardToken: rewardToken,
            taxes: _taxes(200, 300, 100),
            minimumRewardBalance: 1_001 ether
        });
    }

    function _request(address rewardToken)
        internal
        pure
        returns (BNBXHolderRewardsFactory.CreateRequest memory)
    {
        return BNBXHolderRewardsFactory.CreateRequest({
            name: "Holder Rewards V2",
            symbol: "HRV2",
            graduationTargetBNB: 1,
            metadataURI: "",
            vanitySalt: bytes32(uint256(17)),
            rewardToken: rewardToken,
            taxes: _taxes(200, 300, 100),
            minimumRewardBalance: 1_001 ether
        });
    }

    function testFactoryUsesThreeImmutableConstructorValuesAndPrivateDeployer()
        external
        view
    {
        assert(factory.feeRecipient() == FEE_RECIPIENT);
        assert(factory.pancakeV2Router() == address(router));
        assert(factory.defaultRewardToken() == address(reward));
        assert(address(factory.tokenDeployer()) != address(0));
        assert(factory.tokenDeployer().factory() == address(factory));
    }

    function testBlankAndExplicitDefaultRewardPredictTheSameAddress() external view {
        BNBXHolderRewardsFactory.CreateRequest memory blank = _request(address(0));
        BNBXHolderRewardsFactory.CreateRequest memory explicitDefault =
            _request(address(reward));
        assert(factory.predictTokenAddress(blank) == factory.predictTokenAddress(explicitDefault));
    }

    function testRejectsCustomRewardWithoutLiveWbnbPool() external {
        HolderRewardAssetMock unsupported = new HolderRewardAssetMock();
        BNBXHolderRewardsFactory.CreateRequest memory request =
            _request(address(unsupported));
        (bool success,) = address(factory).call(
            abi.encodeCall(factory.predictTokenAddress, (request))
        );
        assert(!success);
    }

    function testDedicatedDeployerAuthorizationAndCreate2Parity() external {
        HolderTokenDeployerHarness harness = new HolderTokenDeployerHarness();
        BNBXHolderRewardsToken.Init memory init =
            _init(address(harness), address(reward));
        bytes32 salt = bytes32(uint256(99));
        address predicted = harness.predict(salt, init);
        BNBXHolderRewardsToken deployed = harness.deploy(salt, init);
        assert(address(deployed) == predicted);

        (bool unauthorized,) = address(harness.deployer()).call(
            abi.encodeCall(harness.deployer().deploy, (bytes32(uint256(100)), init))
        );
        assert(!unauthorized);
    }

    function testFixedThreeWayTaxesAndNoOwnerSurface() external {
        BNBXHolderRewardsToken token =
            new BNBXHolderRewardsToken(_init(address(this), address(reward)));
        (uint16 buyLiquidity, uint16 buyRewards, uint16 buyBurn) = token.buyTaxes();
        (uint16 sellLiquidity, uint16 sellRewards, uint16 sellBurn) = token.sellTaxes();
        assert(buyLiquidity == 200 && buyRewards == 300 && buyBurn == 100);
        assert(sellLiquidity == 200 && sellRewards == 300 && sellBurn == 100);
        assert(token.totalSupply() == 1_000_000_000 ether);
        (bool owner,) = address(token).call(abi.encodeWithSignature("owner()"));
        (bool setter,) = address(token).call(
            abi.encodeWithSignature("setTaxes(uint16,uint16,uint16)", 0, 0, 0)
        );
        (bool mint,) = address(token).call(
            abi.encodeWithSignature("mint(address,uint256)", ALICE, 1)
        );
        assert(!owner && !setter && !mint);
    }

    function testBuyAndSellAccountLiquidityRewardsAndBurnIndependently() external {
        BNBXHolderRewardsToken token =
            new BNBXHolderRewardsToken(_init(address(this), address(reward)));
        HolderCurveAuthority curve = new HolderCurveAuthority();
        HolderPairActor pair = new HolderPairActor();
        token.transfer(address(pair), 10_000 ether);
        token.configureLaunch(address(curve), address(pair));
        curve.unlock(token);

        pair.send(token, ALICE, 1_000 ether);
        assert(token.balanceOf(ALICE) == 940 ether);
        assert(token.tokensForLiquidity() == 20 ether);
        assert(token.tokensForRewards() == 30 ether);
        assert(token.balanceOf(token.DEAD()) == 10 ether);

        token.transfer(address(pair), 1_000 ether);
        assert(token.tokensForLiquidity() == 40 ether);
        assert(token.tokensForRewards() == 60 ether);
        assert(token.balanceOf(token.DEAD()) == 20 ether);
    }

    function testRejectsAnySideTotalAboveTenPercent() external {
        BNBXHolderRewardsToken.Init memory init =
            _init(address(this), address(reward));
        init.taxes.buy = BNBXHolderRewardsToken.SideTaxes(400, 400, 201);
        bool accepted;
        try new BNBXHolderRewardsToken(init) returns (BNBXHolderRewardsToken) {
            accepted = true;
        } catch { }
        assert(!accepted);
    }

    function testLaunchRolesAreSingleUseAndDestroyed() external {
        BNBXHolderRewardsToken token =
            new BNBXHolderRewardsToken(_init(address(this), address(reward)));
        HolderCurveAuthority curve = new HolderCurveAuthority();
        HolderPairActor pair = new HolderPairActor();
        token.configureLaunch(address(curve), address(pair));
        assert(token.launchManager() == token.DEAD());
        curve.unlock(token);
        assert(token.graduationAuthority() == token.DEAD());
        (bool again,) = address(token).call(
            abi.encodeCall(token.configureLaunch, (address(curve), address(pair)))
        );
        assert(!again);
    }

    function testBoundedAutomaticRewardsPayAndIsolateFailedRecipients() external {
        BNBXHolderRewardsToken token =
            new BNBXHolderRewardsToken(_init(address(this), address(reward)));
        token.transfer(ALICE, 10_000 ether);
        token.transfer(token.DEAD(), token.balanceOf(address(this)));
        reward.mint(address(this), 4 ether);
        reward.approve(address(token), type(uint256).max);
        reward.setFailTransfers(true);
        token.fundRewards(4 ether);
        assert(token.withdrawableRewardOf(ALICE) == 4 ether);
        assert(reward.balanceOf(ALICE) == 0);

        reward.setFailTransfers(false);
        token.processRewards(500_000);
        assert(reward.balanceOf(ALICE) == 4 ether);
        assert(token.withdrawableRewardOf(ALICE) == 0);
    }

    function testProcessesLiquidityAndRewardsAndBurnsAutomaticLp() external {
        MockPancakeFactory processingFactory = new MockPancakeFactory();
        MockWBNB processingWbnb = new MockWBNB();
        TaxProcessingRouterV4Mock processingRouter = new TaxProcessingRouterV4Mock(
            address(processingFactory), address(processingWbnb)
        );
        (bool funded,) = address(processingRouter).call{ value: 5 ether }("");
        assert(funded);
        HolderRewardAssetMock processingReward = new HolderRewardAssetMock();
        address rewardPair = processingFactory.createPair(
            address(processingReward), address(processingWbnb)
        );
        MockPair(rewardPair).seed(1 ether, 1 ether, address(0xBEEF), 1 ether);

        BNBXHolderRewardsToken.Init memory init = BNBXHolderRewardsToken.Init({
            name: "Processing Holder V2",
            symbol: "PHV2",
            launchManager: address(this),
            router: address(processingRouter),
            rewardToken: address(processingReward),
            taxes: _taxes(200, 300, 100),
            minimumRewardBalance: 1_001 ether
        });
        BNBXHolderRewardsToken processingToken =
            new BNBXHolderRewardsToken(init);
        MockPair pair = MockPair(
            processingFactory.createPair(
                address(processingToken), address(processingWbnb)
            )
        );
        processingToken.configureLaunch(address(this), address(pair));
        HolderSeller seller = new HolderSeller();
        processingToken.transfer(address(seller), 30_000_000 ether);
        processingToken.unlockLiquidityPair();
        processingToken.transfer(address(pair), 200_000_000 ether);

        seller.sell(processingToken, address(pair), 20_000_000 ether);
        assert(processingToken.balanceOf(processingToken.DEAD()) == 200_000 ether);
        assert(processingToken.tokensForLiquidity() == 400_000 ether);
        assert(processingToken.tokensForRewards() == 600_000 ether);

        processingToken.processTaxes();
        assert(pair.liquidityBalance(processingToken.DEAD()) > 0);
        assert(processingReward.balanceOf(address(seller)) > 0);
        assert(processingToken.tokensForLiquidity() == 0);
        assert(processingToken.tokensForRewards() == 0);
    }

    receive() external payable { }
}
