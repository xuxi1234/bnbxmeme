// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXRewardVault } from "../src/BNBXRewardVault.sol";

contract RewardShareMock {
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] = amount;
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
        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }
}

contract RewardVaultReceiver {
    receive() external payable {}
}

contract BNBXRewardVaultIntegrationTest {
    BNBXRewardVault internal holderVault;
    BNBXRewardVault internal lpVault;
    RewardShareMock internal pair;
    RewardVaultReceiver internal alice;
    RewardVaultReceiver internal bob;

    receive() external payable {}

    function setUp() public {
        alice = new RewardVaultReceiver();
        bob = new RewardVaultReceiver();
        pair = new RewardShareMock();
        holderVault = new BNBXRewardVault(
            BNBXRewardVault.Mode.Holder, address(this)
        );
        holderVault.configureShareAsset(address(this));
        lpVault = new BNBXRewardVault(
            BNBXRewardVault.Mode.LiquidityProvider, address(this)
        );
        lpVault.configureShareAsset(address(pair));
    }

    function testHolderRewardsFollowConfiguredShares() public {
        holderVault.setHolderShare(address(alice), 75 ether);
        holderVault.setHolderShare(address(bob), 25 ether);
        holderVault.depositRewards{ value: 1 ether }();
        assert(holderVault.claimable(address(alice)) == 0.75 ether);
        assert(holderVault.claimable(address(bob)) == 0.25 ether);
    }

    function testQueuedRewardsReleaseWhenFirstShareArrives() public {
        holderVault.depositRewards{ value: 1 ether }();
        assert(holderVault.pendingRewards() == 1 ether);
        holderVault.setHolderShare(address(alice), 100 ether);
        assert(holderVault.claimable(address(alice)) == 1 ether);
    }

    function testLPRewardsUseCustodiedUserLiquidity() public {
        pair.mint(address(this), 10 ether);
        pair.mint(lpVault.DEAD(), 1_000 ether);
        pair.approve(address(lpVault), 10 ether);
        lpVault.stakeLP(10 ether);
        assert(lpVault.shares(address(this)) == 10 ether);
        assert(lpVault.shares(lpVault.DEAD()) == 0);
        assert(pair.balanceOf(address(lpVault)) == 10 ether);
    }

    function testLPWithdrawalStopsFutureRewardsWithoutLosingPastRewards() public {
        pair.mint(address(this), 10 ether);
        pair.approve(address(lpVault), 10 ether);
        lpVault.stakeLP(10 ether);
        lpVault.depositRewards{ value: 1 ether }();
        lpVault.withdrawLP(10 ether, address(this));
        lpVault.depositRewards{ value: 1 ether }();
        assert(lpVault.claimable(address(this)) == 1 ether);
        assert(pair.balanceOf(address(this)) == 10 ether);
    }

    function testShareChangesDoNotStealPastRewards() public {
        holderVault.setHolderShare(address(alice), 100 ether);
        holderVault.depositRewards{ value: 1 ether }();
        holderVault.setHolderShare(address(bob), 100 ether);
        assert(holderVault.claimable(address(alice)) == 1 ether);
        assert(holderVault.claimable(address(bob)) == 0);
    }
}
