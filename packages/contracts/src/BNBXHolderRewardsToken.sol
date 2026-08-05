// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";

interface IHolderRewardsRouter {
    function WETH() external view returns (address);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @title BNBX independent holder-rewards token
/// @notice Fixed-supply launch token with immutable post-graduation reward
/// taxes and pull-based, O(1) reward accounting. It has no owner or setters.
contract BNBXHolderRewardsToken {
    struct Init {
        string name;
        string symbol;
        address launchManager;
        address router;
        address rewardToken;
        uint16 buyRewardTaxBps;
        uint16 sellRewardTaxBps;
        uint256 minimumRewardBalance;
    }

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant totalSupply = TOTAL_SUPPLY;
    uint256 public constant MAX_TAX_BPS = 1_000;
    uint256 public constant MINIMUM_PROCESS_AMOUNT = 100_000 ether;
    uint256 public constant MAX_PROCESS_AMOUNT = 5_000_000 ether;
    uint256 private constant BPS = 10_000;
    uint256 private constant MAGNITUDE = 2 ** 128;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public excludedFromRewards;
    mapping(address => uint256) public rewardShare;
    mapping(address => int256) private magnifiedCorrections;
    mapping(address => uint256) public withdrawnRewards;

    IHolderRewardsRouter public immutable router;
    IERC20Minimal public immutable rewardToken;
    address public immutable wbnb;
    uint16 public immutable buyRewardTaxBps;
    uint16 public immutable sellRewardTaxBps;
    uint256 public immutable minimumRewardBalance;

    address public launchManager;
    address public launchCurve;
    address public graduationAuthority;
    address public liquidityPair;
    bool public taxesEnabled;
    bool private swapping;
    uint256 public pendingTaxTokens;
    uint256 public totalRewardShares;
    uint256 public magnifiedRewardPerShare;
    uint256 public totalRewardsDistributed;

    error InvalidIdentity();
    error InvalidAddress();
    error InvalidTax();
    error InvalidMinimum();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();
    error InvalidAmount();
    error BelowProcessThreshold();
    error TransferFailed();
    error RouterCallFailed();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LaunchConfigured(address indexed curve, address indexed pair);
    event TaxesActivated(address indexed pair);
    event RewardTaxCollected(address indexed account, bool indexed buy, uint256 amount);
    event RewardsDistributed(uint256 amount, uint256 totalShares);
    event RewardsProcessed(uint256 tokenAmount, uint256 rewardAmount);
    event RewardsClaimed(address indexed account, uint256 amount);

    constructor(Init memory init) {
        if (bytes(init.name).length == 0 || bytes(init.name).length > 128
            || bytes(init.symbol).length == 0 || bytes(init.symbol).length > 64) {
            revert InvalidIdentity();
        }
        if (init.launchManager == address(0) || init.launchManager == DEAD
            || init.router == address(0) || init.router.code.length == 0
            || init.rewardToken == address(0) || init.rewardToken == DEAD
            || init.rewardToken.code.length == 0) revert InvalidAddress();
        if (init.buyRewardTaxBps > MAX_TAX_BPS
            || init.sellRewardTaxBps > MAX_TAX_BPS) revert InvalidTax();
        if (init.minimumRewardBalance <= 1_000 ether
            || init.minimumRewardBalance > TOTAL_SUPPLY) revert InvalidMinimum();

        name = init.name;
        symbol = init.symbol;
        launchManager = init.launchManager;
        router = IHolderRewardsRouter(init.router);
        wbnb = IHolderRewardsRouter(init.router).WETH();
        if (init.rewardToken == wbnb) revert InvalidAddress();
        rewardToken = IERC20Minimal(init.rewardToken);
        buyRewardTaxBps = init.buyRewardTaxBps;
        sellRewardTaxBps = init.sellRewardTaxBps;
        minimumRewardBalance = init.minimumRewardBalance;

        excludedFromRewards[address(this)] = true;
        excludedFromRewards[DEAD] = true;
        balanceOf[init.launchManager] = TOTAL_SUPPLY;
        _setRewardShare(init.launchManager, TOTAL_SUPPLY);
        emit Transfer(address(0), init.launchManager, TOTAL_SUPPLY);
    }

    function configureLaunch(address curve, address pair) external {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (curve == address(0) || pair == address(0) || curve == pair
            || curve.code.length == 0 || pair.code.length == 0) revert InvalidAddress();
        if (graduationAuthority != address(0) || liquidityPair != address(0)) {
            revert LaunchAlreadyConfigured();
        }
        graduationAuthority = curve;
        launchCurve = curve;
        liquidityPair = pair;
        excludedFromRewards[curve] = true;
        excludedFromRewards[pair] = true;
        _setRewardShare(curve, 0);
        _setRewardShare(pair, 0);
        launchManager = DEAD;
        emit LaunchConfigured(curve, pair);
    }

    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) revert OnlyGraduationAuthority();
        taxesEnabled = true;
        graduationAuthority = DEAD;
        emit TaxesActivated(liquidityPair);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = permitted - amount; }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    /// @notice Permissionless conversion of a bounded amount of collected tax.
    function processRewards(uint256 requestedAmount, uint256 minRewardsOut, uint256 deadline)
        external returns (uint256 tokenAmount, uint256 rewardAmount)
    {
        if (pendingTaxTokens < MINIMUM_PROCESS_AMOUNT) revert BelowProcessThreshold();
        tokenAmount = requestedAmount < pendingTaxTokens ? requestedAmount : pendingTaxTokens;
        if (tokenAmount > MAX_PROCESS_AMOUNT) tokenAmount = MAX_PROCESS_AMOUNT;
        if (tokenAmount == 0) revert InvalidAmount();
        pendingTaxTokens -= tokenAmount;
        swapping = true;
        allowance[address(this)][address(router)] = tokenAmount;
        emit Approval(address(this), address(router), tokenAmount);
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        address[] memory path = new address[](3);
        path[0] = address(this);
        path[1] = wbnb;
        path[2] = address(rewardToken);
        try router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            tokenAmount, minRewardsOut, path, address(this), deadline
        ) { } catch {
            swapping = false;
            pendingTaxTokens += tokenAmount;
            revert RouterCallFailed();
        }
        swapping = false;
        allowance[address(this)][address(router)] = 0;
        rewardAmount = rewardToken.balanceOf(address(this)) - beforeBalance;
        _distribute(rewardAmount);
        emit RewardsProcessed(tokenAmount, rewardAmount);
    }

    /// @notice Adds externally supplied reward tokens to the same immutable ledger.
    function fundRewards(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        if (!rewardToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        _distribute(rewardToken.balanceOf(address(this)) - beforeBalance);
    }

    function withdrawableRewardOf(address account) public view returns (uint256) {
        uint256 gross = uint256(
            int256(magnifiedRewardPerShare * rewardShare[account])
                + magnifiedCorrections[account]
        ) / MAGNITUDE;
        return gross - withdrawnRewards[account];
    }

    function claimRewards() external returns (uint256 amount) {
        amount = withdrawableRewardOf(msg.sender);
        if (amount == 0) revert InvalidAmount();
        withdrawnRewards[msg.sender] += amount;
        if (!rewardToken.transfer(msg.sender, amount)) revert TransferFailed();
        emit RewardsClaimed(msg.sender, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (to == liquidityPair && !taxesEnabled) revert LiquidityPairLocked();
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();
        uint256 tax;
        bool buy = from == liquidityPair;
        if (!swapping && taxesEnabled && from != launchCurve
            && (buy || to == liquidityPair)) {
            uint256 bps = buy ? buyRewardTaxBps : sellRewardTaxBps;
            tax = amount * bps / BPS;
        }
        unchecked { balanceOf[from] = fromBalance - amount; }
        if (tax != 0) {
            balanceOf[address(this)] += tax;
            pendingTaxTokens += tax;
            emit Transfer(from, address(this), tax);
            emit RewardTaxCollected(from, buy, tax);
        }
        uint256 received = amount - tax;
        balanceOf[to] += received;
        _setRewardShare(from, balanceOf[from]);
        _setRewardShare(to, balanceOf[to]);
        emit Transfer(from, to, received);
    }

    function _setRewardShare(address account, uint256 balance) internal {
        uint256 oldShare = rewardShare[account];
        uint256 newShare = !excludedFromRewards[account]
                && balance >= minimumRewardBalance ? balance : 0;
        if (oldShare == newShare) return;
        rewardShare[account] = newShare;
        if (newShare > oldShare) {
            uint256 increase = newShare - oldShare;
            totalRewardShares += increase;
            magnifiedCorrections[account] -= int256(magnifiedRewardPerShare * increase);
        } else {
            uint256 decrease = oldShare - newShare;
            totalRewardShares -= decrease;
            magnifiedCorrections[account] += int256(magnifiedRewardPerShare * decrease);
        }
    }

    function _distribute(uint256 amount) internal {
        if (amount == 0 || totalRewardShares == 0) revert InvalidAmount();
        magnifiedRewardPerShare += amount * MAGNITUDE / totalRewardShares;
        totalRewardsDistributed += amount;
        emit RewardsDistributed(amount, totalRewardShares);
    }
}
