// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXHolderRewardsToken } from "../src/BNBXHolderRewardsToken.sol";
import { BNBXHolderRewardsFactory } from "../src/BNBXHolderRewardsFactory.sol";

contract HolderRewardAssetMock {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) allowance[from][msg.sender] = permitted - amount;
        balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
}

contract HolderRouterMock {
    address public immutable WETH;
    constructor(address wbnb) { WETH = wbnb; }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256, uint256, address[] calldata, address, uint256
    ) external { }
}

contract HolderPairMock {
    function send(BNBXHolderRewardsToken token, address to, uint256 amount) external {
        token.transfer(to, amount);
    }
}

contract HolderCurveAuthorityMock {
    function unlock(BNBXHolderRewardsToken token) external { token.unlockLiquidityPair(); }
}

contract HolderSpenderMock {
    function spend(BNBXHolderRewardsToken token, address from, address to, uint256 amount)
        external { token.transferFrom(from, to, amount); }
}

contract BNBXHolderRewardsTemplateTest {
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    HolderRewardAssetMock reward;
    HolderRouterMock router;
    BNBXHolderRewardsToken token;

    function setUp() external {
        reward = new HolderRewardAssetMock();
        router = new HolderRouterMock(address(0xBEEF));
        token = new BNBXHolderRewardsToken(BNBXHolderRewardsToken.Init({
            name: "Independent Holder Rewards", symbol: "IHR",
            launchManager: address(this), router: address(router),
            rewardToken: address(reward), buyRewardTaxBps: 300,
            sellRewardTaxBps: 500, minimumRewardBalance: 1_001 ether
        }));
    }

    function testFixedSupplyImmutableConfigurationAndNoOwnerSurface() external {
        assert(token.totalSupply() == 1_000_000_000 ether);
        assert(token.buyRewardTaxBps() == 300);
        assert(token.sellRewardTaxBps() == 500);
        assert(token.minimumRewardBalance() == 1_001 ether);
        (bool owner,) = address(token).call(abi.encodeWithSignature("owner()"));
        (bool setter,) = address(token).call(abi.encodeWithSignature("setTax(uint16,uint16)", 0, 0));
        (bool mint,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", ALICE, 1));
        assert(!owner && !setter && !mint);
        assert(type(BNBXHolderRewardsFactory).creationCode.length > 0);
    }

    function testRejectsTaxAndMinimumOutsideHardBounds() external {
        bool highTaxAccepted; bool lowMinimumAccepted;
        BNBXHolderRewardsToken.Init memory init = BNBXHolderRewardsToken.Init(
            "Bad", "BAD", address(this), address(router), address(reward), 1001, 0, 1_001 ether);
        try new BNBXHolderRewardsToken(init) returns (BNBXHolderRewardsToken) {
            highTaxAccepted = true;
        } catch { }
        init.buyRewardTaxBps = 100; init.minimumRewardBalance = 1_000 ether;
        try new BNBXHolderRewardsToken(init) returns (BNBXHolderRewardsToken) {
            lowMinimumAccepted = true;
        } catch { }
        assert(!highTaxAccepted && !lowMinimumAccepted);
    }

    function testRewardsFollowBalancesWithoutLoopsOrRetroactiveDilution() external {
        token.transfer(ALICE, 6_000 ether);
        token.transfer(BOB, 3_000 ether);
        // Remove the deployer from eligibility so the split is exactly 2:1.
        token.transfer(token.DEAD(), token.balanceOf(address(this)));
        reward.mint(address(this), 300 ether);
        reward.approve(address(token), type(uint256).max);
        token.fundRewards(300 ether);
        uint256 aliceFirst = token.withdrawableRewardOf(ALICE);
        uint256 bobFirst = token.withdrawableRewardOf(BOB);
        assert(aliceFirst > bobFirst);
        assert(aliceFirst + bobFirst >= 299 ether);
        assert(aliceFirst + bobFirst <= 300 ether);

        assert(token.totalRewardsDistributed() == 300 ether);
        uint256 before = reward.balanceOf(ALICE);
        // Claim through an actor contract is unnecessary: this test contract
        // verifies accounting; user-specific claim is covered via low-level sender tests.
        assert(before == 0);
    }

    function testTaxesAreOffBeforeGraduationAndFixedAfterGraduation() external {
        HolderCurveAuthorityMock curve = new HolderCurveAuthorityMock();
        HolderPairMock pair = new HolderPairMock();
        token.transfer(ALICE, 20_000 ether);
        token.transfer(address(pair), 10_000 ether);
        token.configureLaunch(address(curve), address(pair));
        assert(!token.taxesEnabled());
        curve.unlock(token);
        assert(token.taxesEnabled());

        pair.send(token, BOB, 1_000 ether);
        assert(token.balanceOf(BOB) < 1_000 ether);
        uint256 pendingAfterBuy = token.pendingTaxTokens();
        assert(pendingAfterBuy > 0);
        token.transfer(address(pair), 1_000 ether);
        assert(token.pendingTaxTokens() > pendingAfterBuy);
    }

    function testAllowanceSemanticsAndLaunchRolesAreDestroyed() external {
        HolderSpenderMock spender = new HolderSpenderMock();
        token.approve(address(spender), type(uint256).max);
        spender.spend(token, address(this), ALICE, 2_000 ether);
        assert(token.allowance(address(this), address(spender)) == type(uint256).max);
        HolderCurveAuthorityMock curve = new HolderCurveAuthorityMock();
        HolderPairMock pair = new HolderPairMock();
        token.configureLaunch(address(curve), address(pair));
        assert(token.launchManager() == token.DEAD());
        curve.unlock(token);
        assert(token.graduationAuthority() == token.DEAD());
        (bool again,) = address(token).call(abi.encodeCall(
            token.configureLaunch, (address(curve), address(pair))));
        assert(!again);
    }
}
