// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract BNBXAiMembership {
    uint256 public constant MEMBERSHIP_PRICE = 0.1 ether;
    uint256 public constant LEVEL_ONE_REWARD = 0.05 ether;
    uint256 public constant LEVEL_TWO_REWARD = 0.025 ether;

    address payable public immutable aiTreasury;
    mapping(address => bool) private members;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public claimableRewards;
    mapping(address => uint256) public withdrawnRewards;
    mapping(address => uint256) public directMemberCount;
    mapping(address => uint256) public secondLevelMemberCount;
    uint256 private withdrawalLock = 1;

    error AlreadyMember();
    error ExactPaymentRequired();
    error InvalidTreasury();
    error InvalidReferrer();
    error ReferrerMustBeMember();
    error NothingToWithdraw();
    error TransferFailed();

    event MemberOpened(address indexed member, address indexed referrer, address indexed secondLevelReferrer);
    event ReferralRewardAccrued(address indexed promoter, address indexed member, uint8 level, uint256 amount);
    event TreasuryRevenue(address indexed member, uint256 amount);
    event RewardWithdrawn(address indexed promoter, uint256 amount);

    constructor(address payable treasury_, address[] memory initialMembers) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        aiTreasury = treasury_;
        for (uint256 i; i < initialMembers.length; ++i) {
            address member = initialMembers[i];
            if (member == address(0)) revert InvalidReferrer();
            members[member] = true;
            emit MemberOpened(member, address(0), address(0));
        }
    }

    function isMember(address wallet) external view returns (bool) {
        return members[wallet];
    }

    function openMembership(address referrer) external payable {
        if (msg.value != MEMBERSHIP_PRICE) revert ExactPaymentRequired();
        if (members[msg.sender]) revert AlreadyMember();
        address secondLevelReferrer;
        uint256 treasuryAmount = MEMBERSHIP_PRICE;

        if (referrer != address(0)) {
            if (referrer == msg.sender || referrerOf[referrer] == msg.sender) revert InvalidReferrer();
            if (!members[referrer]) revert ReferrerMustBeMember();
            referrerOf[msg.sender] = referrer;
            directMemberCount[referrer] += 1;
            claimableRewards[referrer] += LEVEL_ONE_REWARD;
            treasuryAmount -= LEVEL_ONE_REWARD;
            emit ReferralRewardAccrued(referrer, msg.sender, 1, LEVEL_ONE_REWARD);

            secondLevelReferrer = referrerOf[referrer];
            if (secondLevelReferrer != address(0)) {
                secondLevelMemberCount[secondLevelReferrer] += 1;
                claimableRewards[secondLevelReferrer] += LEVEL_TWO_REWARD;
                treasuryAmount -= LEVEL_TWO_REWARD;
                emit ReferralRewardAccrued(secondLevelReferrer, msg.sender, 2, LEVEL_TWO_REWARD);
            }
        }

        members[msg.sender] = true;
        emit MemberOpened(msg.sender, referrer, secondLevelReferrer);
        emit TreasuryRevenue(msg.sender, treasuryAmount);
        (bool success, ) = aiTreasury.call{value: treasuryAmount}("");
        if (!success) revert TransferFailed();
    }

    function withdrawRewards() external {
        if (withdrawalLock != 1) revert TransferFailed();
        uint256 amount = claimableRewards[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawalLock = 2;
        claimableRewards[msg.sender] = 0;
        withdrawnRewards[msg.sender] += amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        withdrawalLock = 1;
        if (!success) revert TransferFailed();
        emit RewardWithdrawn(msg.sender, amount);
    }
}
