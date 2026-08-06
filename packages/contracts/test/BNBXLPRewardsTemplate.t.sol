// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXLPRewardsFactory } from "../src/BNBXLPRewardsFactory.sol";
import { BNBXLPRewardsTokenDeployer } from "../src/BNBXLPRewardsTokenDeployer.sol";
import { BNBXLPRewardsVault } from "../src/BNBXLPRewardsVault.sol";
import { BNBXLPRewardsToken } from "../src/BNBXLPRewardsToken.sol";
import { BondingCurve } from "../src/BondingCurve.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";
import { TaxProcessingRouterV4Mock } from "./DividendTaxProcessingV4.t.sol";

contract LPRewardAssetMock {
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

contract LPRewardsStaker {
    function stake(LPStakePairMock pair, BNBXLPRewardsVault vault, uint256 amount)
        external
    {
        pair.approve(address(vault), type(uint256).max);
        vault.stakeLP(amount);
    }

    function claim(BNBXLPRewardsVault vault) external returns (uint256) {
        return vault.claim(address(this));
    }
}

contract LPRewardsSeller {
    function sell(BNBXLPRewardsToken token, address pair, uint256 amount)
        external
    {
        token.transfer(pair, amount);
    }
}

contract LPRewardsPairActor {
    function send(BNBXLPRewardsToken token, address to, uint256 amount)
        external
    {
        token.transfer(to, amount);
    }
}

contract LPRewardsCurveAuthority {
    function unlock(BNBXLPRewardsToken token) external {
        token.unlockLiquidityPair();
    }
}

contract BNBXLPRewardsTemplateTest {
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    MockPancakeFactory internal pancakeFactory;
    MockPancakeRouter internal router;
    MockWBNB internal wbnb;
    LPRewardAssetMock internal defaultRewardToken;
    BNBXLPRewardsFactory internal lpFactory;
    bytes32 internal creationSalt;

    receive() external payable { }

    function setUp() public {
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        defaultRewardToken = new LPRewardAssetMock();
        address rewardPair = pancakeFactory.createPair(
            address(defaultRewardToken), address(wbnb)
        );
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);
        lpFactory = new BNBXLPRewardsFactory(
            address(0xFEE), address(router), address(defaultRewardToken)
        );
    }

    function _zeroTaxes()
        internal
        pure
        returns (BNBXLPRewardsToken.Taxes memory taxes)
    {
        BNBXLPRewardsToken.SideTaxes memory zero =
            BNBXLPRewardsToken.SideTaxes(0, 0, 0);
        taxes = BNBXLPRewardsToken.Taxes(zero, zero);
    }

    function _creationRequest(bytes32 salt)
        internal
        pure
        returns (BNBXLPRewardsFactory.CreateRequest memory)
    {
        return BNBXLPRewardsFactory.CreateRequest(
            "LP Rewards Launch",
            "LPRL",
            1,
            "ipfs://lp-rewards-v2",
            salt,
            address(0),
            _zeroTaxes()
        );
    }

    function findTestSalt(uint256 start, uint256 maxIterations)
        external
        view
        returns (bool found, bytes32 salt, address predicted)
    {
        return lpFactory.findVanitySalt(
            _creationRequest(bytes32(0)), start, maxIterations
        );
    }

    function setTestSalt(bytes32 salt) external {
        creationSalt = salt;
    }

    function testFactoryOwnsDedicatedLPTokenDeployer() public {
        BNBXLPRewardsFactory factory = new BNBXLPRewardsFactory(
            address(this), address(router), address(defaultRewardToken)
        );

        BNBXLPRewardsTokenDeployer deployer = factory.tokenDeployer();
        assert(address(deployer) != address(0));
        assert(deployer.factory() == address(factory));
        assert(factory.defaultRewardToken() == address(defaultRewardToken));
    }

    function testFactoryCreatesIndependentTokenVaultAndCurve() public {
        assert(creationSalt != bytes32(0));
        uint256 feeBefore = address(0xFEE).balance;
        (address tokenAddress, address curveAddress) =
            lpFactory.createVanityToken{ value: 0.001 ether }(
                _creationRequest(creationSalt)
            );
        BNBXLPRewardsToken token = BNBXLPRewardsToken(payable(tokenAddress));
        assert(uint16(uint160(tokenAddress)) == 0x1111);
        assert(lpFactory.curveOf(tokenAddress) == curveAddress);
        assert(lpFactory.tokenCount() == 1);
        assert(lpFactory.allTokens(0) == tokenAddress);
        assert(
            keccak256(bytes(lpFactory.tokenMetadataURI(tokenAddress)))
                == keccak256(bytes("ipfs://lp-rewards-v2"))
        );
        assert(token.balanceOf(curveAddress) == 1_000_000_000 ether);
        assert(address(token.rewardVault()) != address(0));
        assert(token.rewardVault().controller() == tokenAddress);
        assert(token.rewardVault().curve() == curveAddress);
        assert(
            BondingCurve(payable(curveAddress)).graduationTarget()
                == 0.01 ether
        );
        assert(address(0xFEE).balance == feeBefore + 0.001 ether);
    }

    function testStakeRequiresAtLeastOneHundredthWbnbOfPairReserves() public {
        LPStakePairMock pair = new LPStakePairMock(address(defaultRewardToken), address(wbnb));
        pair.setReserves(100 ether, 1 ether);
        pair.mint(address(this), 1 ether);
        pair.approve(address(this), type(uint256).max);

        BNBXLPRewardsVault vault = new BNBXLPRewardsVault(
            address(0x70C0),
            address(pair),
            address(wbnb),
            address(defaultRewardToken),
            address(router),
            address(0xFAc7),
            address(0xDE9107),
            address(0xC0A7),
            0.01 ether
        );
        pair.approve(address(vault), type(uint256).max);

        (bool belowAccepted,) = address(vault).call(
            abi.encodeCall(vault.stakeLP, (0.5 ether))
        );
        assert(!belowAccepted);

        vault.stakeLP(1 ether);
        assert(vault.stakedLP(address(this)) == 1 ether);
        assert(vault.wbnbValueOf(address(this)) == 0.01 ether);
    }

    function testWithdrawalRejectsDustRemnantButAlwaysAllowsFullExit() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) = _vaultWithOneWbnbReserve();
        pair.mint(address(this), 2 ether);
        pair.approve(address(vault), type(uint256).max);
        vault.stakeLP(2 ether);

        (bool dustAccepted,) = address(vault).call(
            abi.encodeCall(vault.withdrawLP, (1.5 ether, address(this)))
        );
        assert(!dustAccepted);
        vault.withdrawLP(2 ether, address(this));
        assert(vault.stakedLP(address(this)) == 0);
        assert(pair.balanceOf(address(this)) == 2 ether);
    }

    function testStakedLPReceivesSynchronizedRewardsAndCanClaim() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) = _vaultWithOneWbnbReserve();
        pair.mint(address(this), 1 ether);
        pair.approve(address(vault), type(uint256).max);
        vault.stakeLP(1 ether);

        defaultRewardToken.mint(address(vault), 5 ether);
        assert(vault.syncRewards() == 5 ether);
        assert(vault.claimable(address(this)) == 5 ether);
        assert(vault.claim(address(this)) == 5 ether);
        assert(defaultRewardToken.balanceOf(address(this)) == 5 ether);
    }

    function testRejectsLPThatTransfersLessThanTheApprovedAmount() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) =
            _vaultWithOneWbnbReserve();
        pair.mint(address(this), 2 ether);
        pair.setTransferFeeBps(100);
        pair.approve(address(vault), type(uint256).max);

        (bool accepted,) = address(vault).call(
            abi.encodeCall(vault.stakeLP, (2 ether))
        );
        assert(!accepted);
        assert(vault.stakedLP(address(this)) == 0);
    }

    function testNewLPStakerCannotCapturePreviouslyAccruedRewards() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) =
            _vaultWithOneWbnbReserve();
        LPRewardsStaker first = new LPRewardsStaker();
        LPRewardsStaker second = new LPRewardsStaker();
        pair.mint(address(first), 1 ether);
        pair.mint(address(second), 1 ether);
        first.stake(pair, vault, 1 ether);

        defaultRewardToken.mint(address(vault), 10 ether);
        vault.syncRewards();
        second.stake(pair, vault, 1 ether);

        assert(vault.claimable(address(second)) == 0);
        assert(vault.claimable(address(first)) == 10 ether);
        assert(first.claim(vault) == 10 ether);
    }

    function testFailedAutomaticRewardTransferRemainsClaimable() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) =
            _vaultWithOneWbnbReserve();
        pair.mint(address(this), 1 ether);
        pair.approve(address(vault), type(uint256).max);
        vault.stakeLP(1 ether);
        defaultRewardToken.mint(address(vault), 4 ether);
        vault.syncRewards();

        defaultRewardToken.setFailTransfers(true);
        vault.processRewards(500_000);
        assert(vault.claimable(address(this)) == 4 ether);
        assert(vault.totalRewardsClaimed() == 0);

        defaultRewardToken.setFailTransfers(false);
        assert(vault.claim(address(this)) == 4 ether);
    }

    function testBoundedProcessorPaysEligibleLPStaker() public {
        (LPStakePairMock pair, BNBXLPRewardsVault vault) =
            _vaultWithOneWbnbReserve();
        pair.mint(address(this), 1 ether);
        pair.approve(address(vault), type(uint256).max);
        vault.stakeLP(1 ether);
        defaultRewardToken.mint(address(vault), 3 ether);
        vault.syncRewards();
        assert(vault.automaticProcessingPending());
        uint256 beforeBalance = defaultRewardToken.balanceOf(address(this));
        vault.processRewards(500_000);
        assert(defaultRewardToken.balanceOf(address(this)) == beforeBalance + 3 ether);
        assert(vault.claimable(address(this)) == 0);
    }

    function testTokenAcceptsExactlyTenPercentAndRejectsAnyHigherSide() public {
        BNBXLPRewardsToken.SideTaxes memory exact =
            BNBXLPRewardsToken.SideTaxes(300, 600, 100);
        BNBXLPRewardsToken token = new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Rewards",
                "LPR",
                address(this),
                address(router),
                address(defaultRewardToken),
                BNBXLPRewardsToken.Taxes(exact, exact),
                0.01 ether
            )
        );
        assert(token.MAX_SIDE_TAX_BPS() == 1_000);
        assert(token.minimumWbnbValue() == 0.01 ether);

        exact.burn = 101;
        bool overAccepted;
        try new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Rewards",
                "LPR",
                address(this),
                address(router),
                address(defaultRewardToken),
                BNBXLPRewardsToken.Taxes(exact, exact),
                0.01 ether
            )
        ) returns (BNBXLPRewardsToken) {
            overAccepted = true;
        } catch { }
        assert(!overAccepted);
    }

    function testBlankRewardPredictionUsesDefaultAndDeployerRejectsOutsiders()
        public
    {
        BNBXLPRewardsFactory factory = new BNBXLPRewardsFactory(
            address(this), address(router), address(defaultRewardToken)
        );
        BNBXLPRewardsToken.SideTaxes memory zero =
            BNBXLPRewardsToken.SideTaxes(0, 0, 0);
        BNBXLPRewardsToken.Taxes memory taxes =
            BNBXLPRewardsToken.Taxes(zero, zero);
        BNBXLPRewardsFactory.CreateRequest memory blank =
            BNBXLPRewardsFactory.CreateRequest(
                "LP Rewards",
                "LPR",
                1,
                "",
                bytes32(uint256(7)),
                address(0),
                taxes
            );
        BNBXLPRewardsFactory.CreateRequest memory explicitDefault = blank;
        explicitDefault.rewardToken = address(defaultRewardToken);
        assert(
            factory.predictTokenAddress(blank)
                == factory.predictTokenAddress(explicitDefault)
        );

        BNBXLPRewardsToken.Init memory init = BNBXLPRewardsToken.Init(
            "LP Rewards",
            "LPR",
            address(factory),
            address(router),
            address(defaultRewardToken),
            taxes,
            0.01 ether
        );
        (bool outsiderDeployed,) = address(factory.tokenDeployer()).call(
            abi.encodeCall(
                BNBXLPRewardsTokenDeployer.deploy,
                (bytes32(uint256(7)), init)
            )
        );
        assert(!outsiderDeployed);
    }

    function testLaunchConfigurationCreatesDedicatedVaultAndDestroysRoles() public {
        BNBXLPRewardsToken.SideTaxes memory zero =
            BNBXLPRewardsToken.SideTaxes(0, 0, 0);
        BNBXLPRewardsToken token = new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Rewards",
                "LPR",
                address(this),
                address(router),
                address(defaultRewardToken),
                BNBXLPRewardsToken.Taxes(zero, zero),
                0.01 ether
            )
        );
        LPStakePairMock pair =
            new LPStakePairMock(address(token), address(wbnb));

        token.configureLaunch(address(this), address(pair), address(0xDE9107));
        assert(token.launchManager() == DEAD);
        assert(address(token.rewardVault()) != address(0));
        assert(address(token.rewardVault().pair()) == address(pair));
        assert(token.rewardVault().factory() == address(this));
        assert(token.rewardVault().deployer() == address(0xDE9107));

        token.unlockLiquidityPair();
        assert(token.taxesEnabled());
        assert(token.graduationAuthority() == DEAD);
        (bool configuredAgain,) = address(token).call(
            abi.encodeCall(
                token.configureLaunch,
                (address(this), address(pair), address(0xDE9107))
            )
        );
        assert(!configuredAgain);
    }

    function testBuyAndSellAccountThreeTaxBucketsIndependently() public {
        BNBXLPRewardsToken.SideTaxes memory taxes =
            BNBXLPRewardsToken.SideTaxes(200, 300, 100);
        BNBXLPRewardsToken token = new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Rewards",
                "LPR",
                address(this),
                address(router),
                address(defaultRewardToken),
                BNBXLPRewardsToken.Taxes(taxes, taxes),
                0.01 ether
            )
        );
        LPRewardsCurveAuthority curve = new LPRewardsCurveAuthority();
        LPStakePairMock pair =
            new LPStakePairMock(address(token), address(wbnb));
        pair.setReserves(100 ether, 1 ether);
        token.transfer(address(pair), 10_000 ether);
        token.configureLaunch(address(curve), address(pair), address(0xDE9107));
        curve.unlock(token);

        pair.sendLaunchToken(token, address(0xA11CE), 1_000 ether);
        assert(token.balanceOf(address(0xA11CE)) == 940 ether);
        assert(token.tokensForLiquidity() == 20 ether);
        assert(token.tokensForRewards() == 30 ether);
        assert(token.balanceOf(token.DEAD()) == 10 ether);

        token.transfer(address(pair), 1_000 ether);
        assert(token.tokensForLiquidity() == 40 ether);
        assert(token.tokensForRewards() == 60 ether);
        assert(token.balanceOf(token.DEAD()) == 20 ether);
    }

    function testProcessesTaxesBurnsAutomaticLPAndFundsOnlyLPVault() public {
        MockPancakeFactory processingFactory = new MockPancakeFactory();
        MockWBNB processingWbnb = new MockWBNB();
        TaxProcessingRouterV4Mock processingRouter = new TaxProcessingRouterV4Mock(
            address(processingFactory), address(processingWbnb)
        );
        (bool funded,) = address(processingRouter).call{ value: 5 ether }("");
        assert(funded);
        LPRewardAssetMock processingReward = new LPRewardAssetMock();
        address rewardPair = processingFactory.createPair(
            address(processingReward), address(processingWbnb)
        );
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);

        BNBXLPRewardsToken.SideTaxes memory taxes =
            BNBXLPRewardsToken.SideTaxes(200, 300, 100);
        BNBXLPRewardsToken token = new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Processing",
                "LPP",
                address(this),
                address(processingRouter),
                address(processingReward),
                BNBXLPRewardsToken.Taxes(taxes, taxes),
                0.01 ether
            )
        );
        MockPair pair = MockPair(
            processingFactory.createPair(address(token), address(processingWbnb))
        );
        token.configureLaunch(address(this), address(pair), address(0xDE9107));
        LPRewardsSeller seller = new LPRewardsSeller();
        token.transfer(address(seller), 30_000_000 ether);
        token.unlockLiquidityPair();
        token.transfer(address(pair), 200_000_000 ether);

        seller.sell(token, address(pair), 20_000_000 ether);
        assert(token.balanceOf(DEAD) == 200_000 ether);
        assert(token.tokensForLiquidity() == 400_000 ether);
        assert(token.tokensForRewards() == 600_000 ether);

        token.processTaxes();
        assert(pair.liquidityBalance(DEAD) > 0);
        assert(processingReward.balanceOf(address(token.rewardVault())) > 0);
        assert(token.rewardVault().totalRewardsReceived() > 0);
        assert(token.tokensForLiquidity() == 0);
        assert(token.tokensForRewards() == 0);
    }

    function testFailedAutomaticTaxProcessingCannotBlockSell() public {
        MockPancakeFactory processingFactory = new MockPancakeFactory();
        MockWBNB processingWbnb = new MockWBNB();
        TaxProcessingRouterV4Mock processingRouter = new TaxProcessingRouterV4Mock(
            address(processingFactory), address(processingWbnb)
        );
        LPRewardAssetMock processingReward = new LPRewardAssetMock();
        address rewardPair = processingFactory.createPair(
            address(processingReward), address(processingWbnb)
        );
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);
        BNBXLPRewardsToken.SideTaxes memory taxes =
            BNBXLPRewardsToken.SideTaxes(200, 300, 100);
        BNBXLPRewardsToken token = new BNBXLPRewardsToken(
            BNBXLPRewardsToken.Init(
                "LP Deferred",
                "LPD",
                address(this),
                address(processingRouter),
                address(processingReward),
                BNBXLPRewardsToken.Taxes(taxes, taxes),
                0.01 ether
            )
        );
        MockPair pair = MockPair(
            processingFactory.createPair(address(token), address(processingWbnb))
        );
        token.configureLaunch(address(this), address(pair), address(0xDE9107));
        LPRewardsSeller seller = new LPRewardsSeller();
        token.transfer(address(seller), 30_000_000 ether);
        token.unlockLiquidityPair();
        token.transfer(address(pair), 200_000_000 ether);
        seller.sell(token, address(pair), 20_000_000 ether);

        processingRouter.setFailQuotes(true);
        uint256 pairBefore = token.balanceOf(address(pair));
        seller.sell(token, address(pair), 1_000_000 ether);
        assert(token.balanceOf(address(pair)) > pairBefore);
        assert(token.balanceOf(address(token)) > 1_000_000 ether);
    }

    function _vaultWithOneWbnbReserve()
        internal
        returns (LPStakePairMock pair, BNBXLPRewardsVault vault)
    {
        pair = new LPStakePairMock(address(defaultRewardToken), address(wbnb));
        pair.setReserves(100 ether, 1 ether);
        vault = new BNBXLPRewardsVault(
            address(0x70C0),
            address(pair),
            address(wbnb),
            address(defaultRewardToken),
            address(router),
            address(0xFAc7),
            address(0xDE9107),
            address(0xC0A7),
            0.01 ether
        );
    }
}

contract LPStakePairMock {
    address public immutable token0;
    address public immutable token1;
    uint112 public reserve0;
    uint112 public reserve1;
    uint256 public totalSupply = 100 ether;
    uint256 public transferFeeBps;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setReserves(uint112 reserve0_, uint112 reserve1_) external {
        reserve0 = reserve0_;
        reserve1 = reserve1_;
    }

    function setTransferFeeBps(uint256 value) external {
        transferFeeBps = value;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, uint32(block.timestamp));
    }

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function sendLaunchToken(
        BNBXLPRewardsToken token,
        address recipient,
        uint256 amount
    ) external {
        token.transfer(recipient, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        returns (bool)
    {
        uint256 permitted = allowance[sender][msg.sender];
        if (permitted != type(uint256).max) {
            allowance[sender][msg.sender] = permitted - amount;
        }
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount - amount * transferFeeBps / 10_000;
        return true;
    }
}
