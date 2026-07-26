// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IPancakeV2Router } from "./interfaces/IPancakeV2.sol";
import { TemplateConfig } from "./libraries/TemplateConfig.sol";

/// @title BNBX fixed-supply automatic-liquidity token
/// @notice Taxes are immutable, disabled during the bonding curve, and enabled
/// only when the per-token curve unlocks the Pancake pair at graduation.
contract BNBXAutoLiquidityToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant SWAP_THRESHOLD = 1_000_000 ether;
    uint256 public constant MAX_SWAP_AMOUNT = 5_000_000 ether;
    uint256 private constant BPS = 10_000;
    address public constant LP_BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;

    uint256 public totalSupply;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    IPancakeV2Router public immutable router;
    address public immutable marketingWallet;
    TemplateConfig.SideTaxes public buyTaxes;
    TemplateConfig.SideTaxes public sellTaxes;

    address public launchManager;
    address public graduationAuthority;
    address public liquidityPair;
    bool public liquidityPairUnlocked;
    bool public taxesEnabled;
    bool private swapping;

    uint256 public tokensForLiquidity;
    uint256 public tokensForMarketing;
    uint256 public pendingMarketingBNB;

    mapping(address account => bool exempt) public isTaxExempt;

    error InvalidReceiver();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();
    error UnsupportedRewardsTax();
    error RouterCallFailed();
    error OnlyMarketingWallet();
    error TransferFailed();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LaunchConfigured(
        address indexed graduationAuthority,
        address indexed liquidityPair
    );
    event LiquidityPairUnlocked(address indexed liquidityPair);
    event TaxesActivated(uint16 buyTotalBps, uint16 sellTotalBps);
    event SwapBack(
        uint256 tokensSwapped,
        uint256 tokensAddedToLiquidity,
        uint256 bnbAddedToLiquidity,
        uint256 bnbSentToMarketing
    );
    event MarketingPaymentDeferred(uint256 amount);
    event MarketingBNBClaimed(uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address launchManager_,
        address router_,
        address marketingWallet_,
        TemplateConfig.Taxes memory taxes_
    ) {
        if (
            launchManager_ == address(0) || router_ == address(0)
                || marketingWallet_ == address(0)
        ) revert InvalidReceiver();
        TemplateConfig.validate(TemplateConfig.Template.AutoLiquidity, taxes_);
        if (taxes_.buy.rewards != 0 || taxes_.sell.rewards != 0) {
            revert UnsupportedRewardsTax();
        }

        name = name_;
        symbol = symbol_;
        launchManager = launchManager_;
        router = IPancakeV2Router(router_);
        marketingWallet = marketingWallet_;
        buyTaxes = taxes_.buy;
        sellTaxes = taxes_.sell;

        isTaxExempt[launchManager_] = true;
        isTaxExempt[address(this)] = true;
        isTaxExempt[marketingWallet_] = true;
        isTaxExempt[LP_BURN_ADDRESS] = true;

        totalSupply = TOTAL_SUPPLY;
        balanceOf[launchManager_] = TOTAL_SUPPLY;
        emit Transfer(address(0), launchManager_, TOTAL_SUPPLY);
    }

    receive() external payable {
        if (msg.sender != address(router)) revert RouterCallFailed();
    }

    function configureLaunch(address graduationAuthority_, address liquidityPair_)
        external
    {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (
            graduationAuthority_ == address(0) || liquidityPair_ == address(0)
        ) revert InvalidReceiver();
        if (graduationAuthority != address(0) || liquidityPair != address(0)) {
            revert LaunchAlreadyConfigured();
        }

        graduationAuthority = graduationAuthority_;
        liquidityPair = liquidityPair_;
        isTaxExempt[graduationAuthority_] = true;
        launchManager = address(0);
        emit LaunchConfigured(graduationAuthority_, liquidityPair_);
    }

    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) revert OnlyGraduationAuthority();
        liquidityPairUnlocked = true;
        taxesEnabled = true;
        graduationAuthority = address(0);
        emit LiquidityPairUnlocked(liquidityPair);
        emit TaxesActivated(
            uint16(TemplateConfig.total(buyTaxes)),
            uint16(TemplateConfig.total(sellTaxes))
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
            _swapBack();
        }

        if (
            swapping || !taxesEnabled || isTaxExempt[from] || isTaxExempt[to]
                || (from != liquidityPair && to != liquidityPair)
        ) {
            _rawTransfer(from, to, amount);
            return;
        }

        TemplateConfig.SideTaxes memory taxes =
            from == liquidityPair ? buyTaxes : sellTaxes;
        uint256 burnAmount = amount * taxes.burn / BPS;
        uint256 liquidityAmount = amount * taxes.liquidity / BPS;
        uint256 marketingAmount = amount * taxes.marketing / BPS;
        uint256 totalTax = burnAmount + liquidityAmount + marketingAmount;

        _rawTransfer(from, to, amount - totalTax);
        if (burnAmount != 0) _rawTransfer(from, LP_BURN_ADDRESS, burnAmount);
        if (liquidityAmount + marketingAmount != 0) {
            _rawTransfer(from, address(this), liquidityAmount + marketingAmount);
            tokensForLiquidity += liquidityAmount;
            tokensForMarketing += marketingAmount;
        }
    }

    function _swapBack() internal {
        uint256 tracked = tokensForLiquidity + tokensForMarketing;
        uint256 contractBalance = balanceOf[address(this)];
        if (tracked == 0 || contractBalance == 0) return;

        uint256 process = contractBalance < tracked ? contractBalance : tracked;
        if (process > MAX_SWAP_AMOUNT) process = MAX_SWAP_AMOUNT;
        uint256 liquidityTokens = process * tokensForLiquidity / tracked;
        uint256 marketingTokens = process - liquidityTokens;
        uint256 tokensToLiquidity = liquidityTokens / 2;
        uint256 tokensToSwap = process - tokensToLiquidity;
        if (tokensToSwap == 0) return;

        tokensForLiquidity -= liquidityTokens;
        tokensForMarketing -= marketingTokens;
        swapping = true;

        allowance[address(this)][address(router)] = tokensToSwap;
        emit Approval(address(this), address(router), tokensToSwap);
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = router.WETH();
        uint256 bnbBefore = address(this).balance;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokensToSwap, 0, path, address(this), block.timestamp
        );
        uint256 receivedBNB = address(this).balance - bnbBefore;

        uint256 liquiditySwapTokens = liquidityTokens - tokensToLiquidity;
        uint256 liquidityBNB =
            tokensToSwap == 0 ? 0 : receivedBNB * liquiditySwapTokens / tokensToSwap;
        uint256 marketingBNB = receivedBNB - liquidityBNB;

        if (tokensToLiquidity != 0 && liquidityBNB != 0) {
            allowance[address(this)][address(router)] = tokensToLiquidity;
            emit Approval(address(this), address(router), tokensToLiquidity);
            router.addLiquidityETH{ value: liquidityBNB }(
                address(this),
                tokensToLiquidity,
                0,
                0,
                LP_BURN_ADDRESS,
                block.timestamp
            );
        } else {
            marketingBNB += liquidityBNB;
            liquidityBNB = 0;
        }

        if (marketingBNB != 0) {
            (bool success,) = marketingWallet.call{ value: marketingBNB }("");
            if (!success) {
                pendingMarketingBNB += marketingBNB;
                emit MarketingPaymentDeferred(marketingBNB);
            }
        }
        swapping = false;
        emit SwapBack(tokensToSwap, tokensToLiquidity, liquidityBNB, marketingBNB);
    }

    function _rawTransfer(address from, address to, uint256 amount) internal {
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
