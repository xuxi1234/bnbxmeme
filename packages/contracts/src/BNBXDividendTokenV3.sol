// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";
import {
    IPancakeV2Factory,
    IPancakeV2Pair,
    IPancakeV2Router
} from "./interfaces/IPancakeV2.sol";
import { BNBXRewardVaultV3 } from "./BNBXRewardVaultV3.sol";
import { TemplateConfigV3 } from "./libraries/TemplateConfigV3.sol";

/// @title BNBX V3 immutable holder/LP dividend token
/// @notice Taxes are fixed at deployment, disabled on the internal curve, and
/// activated only after graduation. There is no owner or privileged setter.
contract BNBXDividendTokenV3 {
    struct Init {
        string name;
        string symbol;
        address launchManager;
        address router;
        address marketingWallet;
        address rewardToken;
        TemplateConfigV3.Taxes taxes;
        TemplateConfigV3.Template template;
        uint256 minimumRewardShare;
    }

    struct ProcessAmounts {
        uint256 liquidityTokens;
        uint256 rewardsTokens;
        uint256 marketingTokens;
        uint256 tokensToLiquidity;
        uint256 tokensToSwap;
        uint256 liquidityBNB;
        uint256 rewardsBNB;
        uint256 marketingBNB;
        uint256 tokensAdded;
        uint256 bnbAdded;
    }

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant SWAP_THRESHOLD = 1_000_000 ether;
    uint256 public constant MAX_SWAP_AMOUNT = 5_000_000 ether;
    uint256 public constant SWAP_SLIPPAGE_BPS = 1_000;
    uint256 private constant BPS = 10_000;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    uint256 public totalSupply;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    IPancakeV2Router public immutable router;
    address public immutable wbnb;
    address public immutable marketingWallet;
    IERC20Minimal public immutable rewardToken;
    TemplateConfigV3.Template public immutable template;
    uint256 public immutable minimumRewardShare;
    BNBXRewardVaultV3 public immutable rewardVault;
    TemplateConfigV3.SideTaxes public buyTaxes;
    TemplateConfigV3.SideTaxes public sellTaxes;

    address public launchManager;
    address public graduationAuthority;
    address public liquidityPair;
    bool public liquidityPairUnlocked;
    bool public taxesEnabled;
    bool private swapping;

    uint256 public tokensForLiquidity;
    uint256 public tokensForMarketing;
    uint256 public tokensForRewards;
    uint256 public pendingMarketingBNB;

    mapping(address account => bool exempt) public isTaxExempt;

    error InvalidReceiver();
    error InvalidRewardToken();
    error MissingRewardLiquidity();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();
    error RouterCallFailed();
    error OnlyMarketingWallet();
    error TransferFailed();
    error TaxesNotReady();
    error BelowSwapThreshold();
    error Reentrancy();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LaunchConfigured(address indexed graduationAuthority, address indexed liquidityPair);
    event LiquidityPairUnlocked(address indexed liquidityPair);
    event TaxesActivated(uint16 buyTotalBps, uint16 sellTotalBps);
    event TaxesProcessed(
        uint256 tokensProcessed,
        uint256 tokensAddedToLiquidity,
        uint256 bnbAddedToLiquidity,
        uint256 bnbSentToMarketing,
        uint256 bnbConvertedToRewards
    );
    event TaxProcessingDeferred(bytes reason);
    event RewardShareUpdateDeferred(
        address indexed account, uint256 balance, bytes reason
    );
    event MarketingPaymentDeferred(uint256 amount);
    event MarketingBNBClaimed(uint256 amount);

    constructor(Init memory init) {
        if (
            init.launchManager == address(0) || init.launchManager == DEAD
                || init.router == address(0) || init.router.code.length == 0
                || init.marketingWallet == address(0) || init.marketingWallet == DEAD
                || init.minimumRewardShare == 0
        ) revert InvalidReceiver();
        TemplateConfigV3.validate(init.taxes);
        IPancakeV2Router configuredRouter = IPancakeV2Router(init.router);
        address configuredWbnb = configuredRouter.WETH();
        if (
            init.rewardToken == address(0) || init.rewardToken == DEAD
                || init.rewardToken == configuredWbnb
                || init.rewardToken == address(this)
                || init.rewardToken.code.length == 0
        ) revert InvalidRewardToken();
        address rewardPair = IPancakeV2Factory(configuredRouter.factory()).getPair(
            init.rewardToken, configuredWbnb
        );
        if (rewardPair == address(0) || rewardPair.code.length == 0) {
            revert MissingRewardLiquidity();
        }
        (uint112 reserve0, uint112 reserve1,) = IPancakeV2Pair(rewardPair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) revert MissingRewardLiquidity();

        name = init.name;
        symbol = init.symbol;
        launchManager = init.launchManager;
        router = configuredRouter;
        wbnb = configuredWbnb;
        marketingWallet = init.marketingWallet;
        rewardToken = IERC20Minimal(init.rewardToken);
        template = init.template;
        minimumRewardShare = init.minimumRewardShare;
        buyTaxes = init.taxes.buy;
        sellTaxes = init.taxes.sell;

        BNBXRewardVaultV3.Mode mode =
            init.template == TemplateConfigV3.Template.HolderRewards
                ? BNBXRewardVaultV3.Mode.Holder
                : BNBXRewardVaultV3.Mode.LiquidityProvider;
        BNBXRewardVaultV3 vault = new BNBXRewardVaultV3(
            mode, address(this), init.rewardToken, init.minimumRewardShare
        );
        rewardVault = vault;
        if (mode == BNBXRewardVaultV3.Mode.Holder) {
            vault.configureShareAsset(address(this));
        }

        isTaxExempt[address(this)] = true;
        isTaxExempt[DEAD] = true;
        isTaxExempt[address(vault)] = true;
        vault.setExcluded(address(this), true);
        vault.setExcluded(address(vault), true);

        totalSupply = TOTAL_SUPPLY;
        balanceOf[init.launchManager] = TOTAL_SUPPLY;
        emit Transfer(address(0), init.launchManager, TOTAL_SUPPLY);
    }

    receive() external payable {
        if (msg.sender != address(router)) revert RouterCallFailed();
    }

    function configureLaunch(address graduationAuthority_, address liquidityPair_)
        external
    {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (
            graduationAuthority_ == address(0) || graduationAuthority_ == DEAD
                || liquidityPair_ == address(0) || liquidityPair_ == DEAD
        ) revert InvalidReceiver();
        if (graduationAuthority != address(0) || liquidityPair != address(0)) {
            revert LaunchAlreadyConfigured();
        }
        graduationAuthority = graduationAuthority_;
        liquidityPair = liquidityPair_;
        isTaxExempt[graduationAuthority_] = true;
        rewardVault.setExcluded(graduationAuthority_, true);
        rewardVault.setExcluded(liquidityPair_, true);
        if (template == TemplateConfigV3.Template.LPRewards) {
            rewardVault.configureShareAsset(liquidityPair_);
        }
        launchManager = DEAD;
        emit LaunchConfigured(graduationAuthority_, liquidityPair_);
    }

    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) revert OnlyGraduationAuthority();
        liquidityPairUnlocked = true;
        taxesEnabled = true;
        graduationAuthority = DEAD;
        emit LiquidityPairUnlocked(liquidityPair);
        emit TaxesActivated(
            uint16(TemplateConfigV3.total(buyTaxes)),
            uint16(TemplateConfigV3.total(sellTaxes))
        );
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

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = permitted - amount;
            }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function processTaxes() external {
        if (!taxesEnabled) revert TaxesNotReady();
        if (swapping) revert Reentrancy();
        uint256 tracked = tokensForLiquidity + tokensForMarketing + tokensForRewards;
        uint256 contractBalance = balanceOf[address(this)];
        if (tracked < SWAP_THRESHOLD || contractBalance < SWAP_THRESHOLD) {
            revert BelowSwapThreshold();
        }
        uint256 process = contractBalance < tracked ? contractBalance : tracked;
        if (process > MAX_SWAP_AMOUNT) process = MAX_SWAP_AMOUNT;
        _processTaxes(process, tracked);
    }

    function claimMarketingBNB() external {
        if (msg.sender != marketingWallet) revert OnlyMarketingWallet();
        uint256 amount = pendingMarketingBNB;
        pendingMarketingBNB = 0;
        (bool success,) = marketingWallet.call{ value: amount }("");
        if (!success) {
            pendingMarketingBNB = amount;
            revert TransferFailed();
        }
        emit MarketingBNBClaimed(amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidReceiver();
        if (to == liquidityPair && !liquidityPairUnlocked) {
            revert LiquidityPairLocked();
        }
        if (balanceOf[from] < amount) revert InsufficientBalance();

        if (
            !swapping && taxesEnabled && to == liquidityPair
                && balanceOf[address(this)] >= SWAP_THRESHOLD
        ) {
            try this.processTaxes() { }
            catch (bytes memory reason) {
                emit TaxProcessingDeferred(reason);
            }
        }

        if (
            !taxesEnabled || isTaxExempt[from] || isTaxExempt[to]
                || (from != liquidityPair && to != liquidityPair)
        ) {
            _rawTransfer(from, to, amount);
            return;
        }

        TemplateConfigV3.SideTaxes memory taxes =
            from == liquidityPair ? buyTaxes : sellTaxes;
        uint256 burnAmount = amount * taxes.burn / BPS;
        uint256 liquidityAmount = amount * taxes.liquidity / BPS;
        uint256 marketingAmount = amount * taxes.marketing / BPS;
        uint256 rewardsAmount = amount * taxes.rewards / BPS;
        uint256 totalTax =
            burnAmount + liquidityAmount + marketingAmount + rewardsAmount;

        _rawTransfer(from, to, amount - totalTax);
        if (burnAmount != 0) _rawTransfer(from, DEAD, burnAmount);
        uint256 collected = liquidityAmount + marketingAmount + rewardsAmount;
        if (collected != 0) {
            _rawTransfer(from, address(this), collected);
            tokensForLiquidity += liquidityAmount;
            tokensForMarketing += marketingAmount;
            tokensForRewards += rewardsAmount;
        }
    }

    function _processTaxes(uint256 process, uint256 tracked) internal {
        ProcessAmounts memory amounts;
        amounts.liquidityTokens = process * tokensForLiquidity / tracked;
        amounts.rewardsTokens = process * tokensForRewards / tracked;
        amounts.marketingTokens =
            process - amounts.liquidityTokens - amounts.rewardsTokens;
        amounts.tokensToLiquidity = amounts.liquidityTokens / 2;
        amounts.tokensToSwap = process - amounts.tokensToLiquidity;
        if (amounts.tokensToSwap == 0) revert BelowSwapThreshold();

        tokensForLiquidity -= amounts.liquidityTokens;
        tokensForMarketing -= amounts.marketingTokens;
        tokensForRewards -= amounts.rewardsTokens;
        swapping = true;

        _approveRouter(amounts.tokensToSwap);
        address[] memory bnbPath = new address[](2);
        bnbPath[0] = address(this);
        bnbPath[1] = wbnb;
        uint256 bnbBefore = address(this).balance;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amounts.tokensToSwap,
            _minimumOutput(amounts.tokensToSwap, bnbPath),
            bnbPath,
            address(this),
            block.timestamp
        );
        uint256 receivedBNB = address(this).balance - bnbBefore;

        uint256 liquiditySwapTokens =
            amounts.liquidityTokens - amounts.tokensToLiquidity;
        amounts.liquidityBNB =
            receivedBNB * liquiditySwapTokens / amounts.tokensToSwap;
        amounts.rewardsBNB =
            receivedBNB * amounts.rewardsTokens / amounts.tokensToSwap;
        amounts.marketingBNB =
            receivedBNB - amounts.liquidityBNB - amounts.rewardsBNB;

        (amounts.tokensAdded, amounts.bnbAdded) = _addAutomaticLiquidity(
            amounts.tokensToLiquidity, amounts.liquidityBNB
        );
        tokensForLiquidity += amounts.tokensToLiquidity - amounts.tokensAdded;
        amounts.marketingBNB += amounts.liquidityBNB - amounts.bnbAdded;
        _convertRewards(amounts.rewardsBNB);
        _payMarketing(amounts.marketingBNB);
        swapping = false;
        emit TaxesProcessed(
            process,
            amounts.tokensAdded,
            amounts.bnbAdded,
            amounts.marketingBNB,
            amounts.rewardsBNB
        );
    }

    function _addAutomaticLiquidity(uint256 tokenAmount, uint256 bnbAmount)
        internal
        returns (uint256 tokensAdded, uint256 bnbAdded)
    {
        if (tokenAmount == 0 || bnbAmount == 0) return (0, 0);
        _approveRouter(tokenAmount);
        (tokensAdded, bnbAdded,) = router.addLiquidityETH{ value: bnbAmount }(
            address(this),
            tokenAmount,
            tokenAmount * (BPS - SWAP_SLIPPAGE_BPS) / BPS,
            bnbAmount * (BPS - SWAP_SLIPPAGE_BPS) / BPS,
            DEAD,
            block.timestamp
        );
    }

    function _convertRewards(uint256 bnbAmount) internal {
        if (bnbAmount == 0) return;
        address[] memory rewardPath = new address[](2);
        rewardPath[0] = wbnb;
        rewardPath[1] = address(rewardToken);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: bnbAmount
        }(
            _minimumOutput(bnbAmount, rewardPath),
            rewardPath,
            address(rewardVault),
            block.timestamp
        );
        rewardVault.syncRewards();
    }

    function _payMarketing(uint256 bnbAmount) internal {
        if (bnbAmount == 0) return;
        (bool success,) = marketingWallet.call{ value: bnbAmount }("");
        if (!success) {
            pendingMarketingBNB += bnbAmount;
            emit MarketingPaymentDeferred(bnbAmount);
        }
    }

    function _minimumOutput(uint256 amountIn, address[] memory path)
        internal
        view
        returns (uint256)
    {
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts.length != path.length || amounts[amounts.length - 1] == 0) {
            revert RouterCallFailed();
        }
        return amounts[amounts.length - 1] * (BPS - SWAP_SLIPPAGE_BPS) / BPS;
    }

    function _approveRouter(uint256 amount) internal {
        allowance[address(this)][address(router)] = amount;
        emit Approval(address(this), address(router), amount);
    }

    function _rawTransfer(address from, address to, uint256 amount) internal {
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        _syncHolderShare(from);
        _syncHolderShare(to);
    }

    function _syncHolderShare(address account) internal {
        if (
            template != TemplateConfigV3.Template.HolderRewards
                || isTaxExempt[account]
        ) return;
        uint256 holderBalance = balanceOf[account];
        try rewardVault.setHolderShare(account, holderBalance) { }
        catch (bytes memory reason) {
            // A hostile or pathological creator-selected reward asset must
            // never be able to freeze transfers of the launched token.
            emit RewardShareUpdateDeferred(account, holderBalance, reason);
        }
    }
}
