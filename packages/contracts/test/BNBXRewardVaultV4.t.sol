// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXRewardVaultV4 } from "../src/BNBXRewardVaultV4.sol";

contract RewardAssetV4Mock {
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;
    bool public failTransfers;

    function setFailTransfers(bool value) external {
        failTransfers = value;
    }

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
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
        balanceOf[recipient] += amount;
        return true;
    }
}

contract BNBXRewardVaultV4Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    RewardAssetV4Mock internal rewardToken;
    RewardAssetV4Mock internal lpToken;
    BNBXRewardVaultV4 internal holderVault;
    BNBXRewardVaultV4 internal lpVault;

    function setUp() public {
        rewardToken = new RewardAssetV4Mock();
        lpToken = new RewardAssetV4Mock();
        holderVault = new BNBXRewardVaultV4(
            BNBXRewardVaultV4.Mode.Holder,
            address(this),
            address(rewardToken),
            1 ether
        );
        holderVault.configureShareAsset(address(this));
        lpVault = new BNBXRewardVaultV4(
            BNBXRewardVaultV4.Mode.LiquidityProvider,
            address(this),
            address(rewardToken),
            1 ether
        );
        lpVault.configureShareAsset(address(lpToken));
    }

    function testExternalRewardsFollowHolderSharesAndCanBeClaimed() public {
        holderVault.setHolderShare(address(this), 75 ether);
        holderVault.setHolderShare(ALICE, 25 ether);
        rewardToken.mint(address(holderVault), 100 ether);
        holderVault.syncRewards();
        assert(holderVault.automaticProcessingPending());

        assert(holderVault.claimable(address(this)) == 75 ether);
        assert(holderVault.claimable(ALICE) == 25 ether);
        uint256 claimed = holderVault.claim(address(this));
        assert(claimed == 75 ether);
        assert(rewardToken.balanceOf(address(this)) == 75 ether);
        assert(holderVault.totalRewardsClaimed() == 75 ether);
    }

    function testQueuedRewardsReleaseOnlyAfterFirstEligibleShare() public {
        rewardToken.mint(address(holderVault), 10 ether);
        holderVault.syncRewards();
        assert(holderVault.pendingRewards() == 10 ether);

        holderVault.setHolderShare(ALICE, 0.5 ether);
        assert(holderVault.totalShares() == 0);
        holderVault.setHolderShare(BOB, 2 ether);
        assert(holderVault.pendingRewards() == 0);
        assert(holderVault.claimable(BOB) == 10 ether);
    }

    function testLPRewardsUseOnlyCustodiedLiquidityAndPreservePastRewards() public {
        lpToken.mint(address(this), 10 ether);
        lpToken.mint(lpVault.DEAD(), 1_000 ether);
        lpToken.approve(address(lpVault), 10 ether);
        lpVault.stakeLP(10 ether);
        assert(lpVault.shares(address(this)) == 10 ether);
        assert(lpVault.shares(lpVault.DEAD()) == 0);
        assert(lpToken.balanceOf(address(lpVault)) == 10 ether);

        rewardToken.mint(address(lpVault), 5 ether);
        lpVault.syncRewards();
        lpVault.withdrawLP(10 ether, address(this));
        rewardToken.mint(address(lpVault), 5 ether);
        lpVault.syncRewards();

        assert(lpVault.claimable(address(this)) == 5 ether);
        assert(lpVault.pendingRewards() == 5 ether);
        assert(lpToken.balanceOf(address(this)) == 10 ether);
    }

    function testNewSharesCannotTakePreviouslyAccruedRewards() public {
        holderVault.setHolderShare(ALICE, 100 ether);
        rewardToken.mint(address(holderVault), 8 ether);
        holderVault.syncRewards();
        holderVault.setHolderShare(BOB, 100 ether);

        assert(holderVault.claimable(ALICE) == 8 ether);
        assert(holderVault.claimable(BOB) == 0);
    }

    function testExcludedAndSubminimumAccountsReceiveNoShares() public {
        holderVault.setExcluded(ALICE, true);
        holderVault.setHolderShare(ALICE, 100 ether);
        holderVault.setHolderShare(BOB, 0.5 ether);
        assert(holderVault.shares(ALICE) == 0);
        assert(holderVault.shares(BOB) == 0);
    }

    function testBoundedProcessorAutomaticallyPaysEligibleHolders() public {
        holderVault.setHolderShare(ALICE, 75 ether);
        holderVault.setHolderShare(BOB, 25 ether);
        rewardToken.mint(address(holderVault), 100 ether);
        holderVault.syncRewards();

        (uint256 iterations, uint256 claims,) =
            holderVault.processRewards(500_000);

        assert(iterations == 2);
        assert(claims == 2);
        assert(rewardToken.balanceOf(ALICE) == 75 ether);
        assert(rewardToken.balanceOf(BOB) == 25 ether);
        assert(holderVault.claimable(ALICE) == 0);
        assert(holderVault.claimable(BOB) == 0);
        assert(!holderVault.automaticProcessingPending());
        assert(holderVault.automaticCycleRemaining() == 0);
    }

    function testFailedAutomaticTransferStaysClaimable() public {
        holderVault.setHolderShare(ALICE, 10 ether);
        rewardToken.mint(address(holderVault), 4 ether);
        holderVault.syncRewards();
        rewardToken.setFailTransfers(true);

        (, uint256 claims,) = holderVault.processRewards(500_000);

        assert(claims == 0);
        assert(holderVault.claimable(ALICE) == 4 ether);
        assert(holderVault.totalRewardsClaimed() == 0);
        assert(!holderVault.automaticProcessingPending());
        rewardToken.setFailTransfers(false);
        assert(holderVault.claimFor(ALICE) == 4 ether);
        assert(rewardToken.balanceOf(ALICE) == 4 ether);
    }

    function testPastRewardsRemainAutomaticallyPayableAfterShareRemoval() public {
        holderVault.setHolderShare(ALICE, 10 ether);
        rewardToken.mint(address(holderVault), 3 ether);
        holderVault.syncRewards();
        holderVault.setHolderShare(ALICE, 0);

        assert(holderVault.shares(ALICE) == 0);
        assert(holderVault.claimable(ALICE) == 3 ether);
        assert(holderVault.eligibleAccountCount() == 1);
        holderVault.processRewards(500_000);
        assert(rewardToken.balanceOf(ALICE) == 3 ether);
        assert(holderVault.eligibleAccountCount() == 0);
    }

    function testStakedLPRewardsAreAutomaticallyPaid() public {
        lpToken.mint(address(this), 10 ether);
        lpToken.approve(address(lpVault), 10 ether);
        lpVault.stakeLP(10 ether);
        rewardToken.mint(address(lpVault), 6 ether);
        lpVault.syncRewards();

        lpVault.processRewards(500_000);

        assert(rewardToken.balanceOf(address(this)) == 6 ether);
        assert(lpVault.claimable(address(this)) == 0);
        assert(lpVault.shares(address(this)) == 10 ether);
    }
}
