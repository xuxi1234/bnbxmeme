// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXRewardsFactoryV3 } from "../src/BNBXRewardsFactoryV3.sol";
import { BNBXAdvancedTokenDeployer } from "../src/BNBXAdvancedTokenDeployer.sol";
import { BNBXDividendTokenV3 } from "../src/BNBXDividendTokenV3.sol";
import { BNBXRewardVaultV3 } from "../src/BNBXRewardVaultV3.sol";
import { BondingCurve } from "../src/BondingCurve.sol";
import { TemplateConfigV3 } from "../src/libraries/TemplateConfigV3.sol";
import {
    MockPancakeFactory,
    MockPancakeRouter,
    MockWBNB,
    MockPair
} from "./FactoryIntegration.t.sol";

interface VmDividend {
    function deal(address account, uint256 newBalance) external;
}

contract RewardAssetMock {
    string public constant name = "Reward Asset";
    string public constant symbol = "RWD";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address account, uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
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

contract TemplateConfigV3Harness {
    function validate(TemplateConfigV3.Taxes memory taxes) external pure {
        TemplateConfigV3.validate(taxes);
    }
}

contract DividendFactoryIntegrationTest {
    VmDividend private constant vm =
        VmDividend(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    address internal constant ALICE = address(0xA11CE);

    MockPancakeFactory internal pancakeFactory;
    MockPancakeRouter internal router;
    MockWBNB internal wbnb;
    RewardAssetMock internal rewardToken;
    BNBXRewardsFactoryV3 internal factory;
    bytes32 internal holderSalt;
    bytes32 internal zeroTaxSalt;
    bytes32 internal lpSalt;

    receive() external payable {}

    function setUp() public {
        if (address(this).balance < 10 ether) vm.deal(address(this), 10 ether);
        pancakeFactory = new MockPancakeFactory();
        wbnb = new MockWBNB();
        router = new MockPancakeRouter(address(pancakeFactory), address(wbnb));
        rewardToken = new RewardAssetMock();
        address rewardPair =
            pancakeFactory.createPair(address(rewardToken), address(wbnb));
        MockPair(rewardPair).seed(1 ether, 1 ether, DEAD, 1 ether);

        BNBXAdvancedTokenDeployer deployer =
            new BNBXAdvancedTokenDeployer(address(this));
        factory = new BNBXRewardsFactoryV3(
            FEE_RECIPIENT, address(router), address(deployer)
        );
        deployer.configureManager(address(factory));
    }

    function configuredTaxes()
        internal
        pure
        returns (TemplateConfigV3.Taxes memory taxes)
    {
        taxes = TemplateConfigV3.Taxes(
            TemplateConfigV3.SideTaxes(100, 100, 100, 100),
            TemplateConfigV3.SideTaxes(200, 200, 200, 400)
        );
    }

    function request(
        TemplateConfigV3.Template template,
        TemplateConfigV3.Taxes memory taxes,
        bytes32 salt
    ) internal view returns (BNBXRewardsFactoryV3.CreateRequest memory result) {
        require(salt != bytes32(0), "SALT_NOT_PREPARED");
        result = BNBXRewardsFactoryV3.CreateRequest(
            "Dividend V3",
            "DIV3",
            1,
            "ipfs://v3",
            salt,
            address(this),
            address(rewardToken),
            taxes,
            template,
            10_000 ether
        );
    }

    function findTestSalt(uint8 kind, uint256 start, uint256 maxIterations)
        external
        view
        returns (bool found, bytes32 salt, address predicted)
    {
        TemplateConfigV3.Template template = kind == 2
            ? TemplateConfigV3.Template.LPRewards
            : TemplateConfigV3.Template.HolderRewards;
        TemplateConfigV3.Taxes memory taxes = kind == 1
            ? TemplateConfigV3.Taxes(
                TemplateConfigV3.SideTaxes(0, 0, 0, 0),
                TemplateConfigV3.SideTaxes(0, 0, 0, 0)
            )
            : configuredTaxes();
        BNBXRewardsFactoryV3.CreateRequest memory saltRequest =
            BNBXRewardsFactoryV3.CreateRequest(
            "Dividend V3",
            "DIV3",
            1,
            "",
            bytes32(0),
            address(this),
            address(rewardToken),
            taxes,
            template,
            10_000 ether
        );
        return factory.findVanitySalt(
            saltRequest, start, maxIterations
        );
    }

    function setTestSalts(bytes32 holder, bytes32 zeroTax, bytes32 lp) external {
        holderSalt = holder;
        zeroTaxSalt = zeroTax;
        lpSalt = lp;
    }

    function testHolderTemplateUsesExternalRewardTokenAndDeadRoles() public {
        (address tokenAddress, address curveAddress) = factory.createVanityToken{
            value: 0.001 ether
        }(
            request(
                TemplateConfigV3.Template.HolderRewards,
                configuredTaxes(),
                holderSalt
            )
        );
        BNBXDividendTokenV3 token = BNBXDividendTokenV3(payable(tokenAddress));
        BNBXRewardVaultV3 vault = token.rewardVault();

        assert(token.launchManager() == DEAD);
        assert(token.graduationAuthority() == curveAddress);
        assert(address(token.rewardToken()) == address(rewardToken));
        assert(uint8(vault.mode()) == uint8(BNBXRewardVaultV3.Mode.Holder));
        assert(vault.isExcluded(curveAddress));
        assert(vault.isExcluded(token.liquidityPair()));
        assert(token.balanceOf(curveAddress) == 1_000_000_000 ether);
        assert(!token.taxesEnabled());
    }

    function testEveryTaxFieldMayBeZero() public {
        TemplateConfigV3.Taxes memory zeroTaxes = TemplateConfigV3.Taxes(
            TemplateConfigV3.SideTaxes(0, 0, 0, 0),
            TemplateConfigV3.SideTaxes(0, 0, 0, 0)
        );
        (address tokenAddress,) = factory.createVanityToken{ value: 0.001 ether }(
            request(
                TemplateConfigV3.Template.HolderRewards,
                zeroTaxes,
                zeroTaxSalt
            )
        );
        BNBXDividendTokenV3 token = BNBXDividendTokenV3(payable(tokenAddress));
        (uint16 burn, uint16 liquidity, uint16 marketing, uint16 rewards) =
            token.buyTaxes();
        assert(burn == 0 && liquidity == 0 && marketing == 0 && rewards == 0);
    }

    function testGraduationActivatesTaxesAndBurnsLPAndRoles() public {
        (address tokenAddress, address curveAddress, uint256 tokensOut) =
            factory.createVanityTokenAndBuy{ value: 0.1 ether }(
                request(
                    TemplateConfigV3.Template.HolderRewards,
                    configuredTaxes(),
                    holderSalt
                ),
                BNBXRewardsFactoryV3.BuyRequest(
                    799_999_999 ether, block.timestamp, address(this)
                )
            );
        BNBXDividendTokenV3 token = BNBXDividendTokenV3(payable(tokenAddress));
        BondingCurve curve = BondingCurve(payable(curveAddress));
        address pairAddress = token.liquidityPair();

        assert(tokensOut == 800_000_000 ether);
        assert(uint256(curve.state()) == uint256(BondingCurve.State.Graduated));
        assert(token.taxesEnabled());
        assert(token.graduationAuthority() == DEAD);
        assert(MockPair(pairAddress).liquidityBalance(DEAD) > 0);

        token.transfer(pairAddress, 1_000_000 ether);
        assert(token.balanceOf(DEAD) == 20_000 ether);
        assert(token.balanceOf(address(token)) == 80_000 ether);
    }

    function testHolderRewardsUseBalanceDeltaAccounting() public {
        (address tokenAddress,,) = factory.createVanityTokenAndBuy{
            value: 0.1 ether
        }(
            request(
                TemplateConfigV3.Template.HolderRewards,
                configuredTaxes(),
                holderSalt
            ),
            BNBXRewardsFactoryV3.BuyRequest(
                799_999_999 ether, block.timestamp, address(this)
            )
        );
        BNBXDividendTokenV3 token = BNBXDividendTokenV3(payable(tokenAddress));
        token.transfer(ALICE, 100_000 ether);
        BNBXRewardVaultV3 vault = token.rewardVault();
        rewardToken.mint(address(vault), 500 ether);
        vault.syncRewards();
        assert(vault.claimable(ALICE) > 0);
    }

    function testLPTemplateConfiguresCustodyBackedPairShares() public {
        (address tokenAddress,) = factory.createVanityToken{ value: 0.001 ether }(
            request(
                TemplateConfigV3.Template.LPRewards,
                configuredTaxes(),
                lpSalt
            )
        );
        BNBXDividendTokenV3 token = BNBXDividendTokenV3(payable(tokenAddress));
        BNBXRewardVaultV3 vault = token.rewardVault();
        assert(
            uint8(vault.mode())
                == uint8(BNBXRewardVaultV3.Mode.LiquidityProvider)
        );
        assert(vault.shareAsset() == token.liquidityPair());
        assert(vault.isExcluded(DEAD));
    }

    function testContractRejectsMoreThanTenPercentPerSide() public {
        TemplateConfigV3Harness harness = new TemplateConfigV3Harness();
        TemplateConfigV3.Taxes memory excessive = TemplateConfigV3.Taxes(
            TemplateConfigV3.SideTaxes(250, 250, 250, 251),
            TemplateConfigV3.SideTaxes(0, 0, 0, 0)
        );
        (bool success,) = address(harness).call(
            abi.encodeCall(harness.validate, (excessive))
        );
        assert(!success);
    }

    function testContractAllowsExactlyTenPercentPerSide() public {
        TemplateConfigV3Harness harness = new TemplateConfigV3Harness();
        TemplateConfigV3.Taxes memory boundary = TemplateConfigV3.Taxes(
            TemplateConfigV3.SideTaxes(250, 250, 250, 250),
            TemplateConfigV3.SideTaxes(1_000, 0, 0, 0)
        );
        harness.validate(boundary);
    }

    function testRejectsRewardTokenWithoutLiveWbnbPool() public {
        RewardAssetMock unsupportedReward = new RewardAssetMock();
        BNBXDividendTokenV3.Init memory init = BNBXDividendTokenV3.Init(
            "Unsupported Reward",
            "BAD",
            address(this),
            address(router),
            address(this),
            address(unsupportedReward),
            configuredTaxes(),
            TemplateConfigV3.Template.HolderRewards,
            1 ether
        );
        bool reverted;
        try new BNBXDividendTokenV3(init) returns (BNBXDividendTokenV3) { }
        catch {
            reverted = true;
        }
        assert(reverted);
    }

    function testRejectsWbnbAsRewardToken() public {
        BNBXDividendTokenV3.Init memory init = BNBXDividendTokenV3.Init(
            "Invalid Reward",
            "BAD",
            address(this),
            address(router),
            address(this),
            address(wbnb),
            configuredTaxes(),
            TemplateConfigV3.Template.LPRewards,
            1 ether
        );
        bool reverted;
        try new BNBXDividendTokenV3(init) returns (BNBXDividendTokenV3) { }
        catch {
            reverted = true;
        }
        assert(reverted);
    }

    function testPathologicalRewardAccountingCannotFreezeTokenTransfers()
        public
    {
        BNBXDividendTokenV3 token = new BNBXDividendTokenV3(
            BNBXDividendTokenV3.Init(
                "Transfer Safe",
                "SAFE",
                address(this),
                address(router),
                address(this),
                address(rewardToken),
                TemplateConfigV3.Taxes(
                    TemplateConfigV3.SideTaxes(0, 0, 0, 0),
                    TemplateConfigV3.SideTaxes(0, 0, 0, 0)
                ),
                TemplateConfigV3.Template.HolderRewards,
                1
            )
        );
        token.configureLaunch(address(this), address(0xBEEF));
        BNBXRewardVaultV3 vault = token.rewardVault();

        token.transfer(ALICE, 1);
        rewardToken.mint(address(vault), 1e40);
        vault.syncRewards();

        address bob = address(0xB0B);
        token.transfer(bob, 1 ether);
        assert(token.balanceOf(bob) == 1 ether);
        assert(vault.shares(bob) == 0);
    }
}
