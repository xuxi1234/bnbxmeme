// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";
import {
    IPancakeV2Factory,
    IPancakeV2Pair,
    IPancakeV2Router
} from "./interfaces/IPancakeV2.sol";
import { BNBXLPRewardsVault } from "./BNBXLPRewardsVault.sol";

/// @title BNBX immutable LP-staker Rewards V2 token
/// @notice Fixed liquidity, LP-rewards, and burn taxes with no owner or setters.
contract BNBXLPRewardsToken {
    struct SideTaxes {
        uint16 liquidity;
        uint16 rewards;
        uint16 burn;
    }

    struct Taxes {
        SideTaxes buy;
        SideTaxes sell;
    }

    struct Init {
        string name;
        string symbol;
        address launchManager;
        address router;
        address rewardToken;
        Taxes taxes;
        uint256 minimumWbnbValue;
    }

    struct ProcessAmounts {
        uint256 liquidityTokens;
        uint256 rewardsTokens;
        uint256 tokensToLiquidity;
        uint256 tokensToSwap;
        uint256 liquidityBNB;
        uint256 rewardsBNB;
        uint256 tokensAdded;
        uint256 bnbAdded;
    }

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant totalSupply = TOTAL_SUPPLY;
    uint256 public constant MAX_SIDE_TAX_BPS = 1_000;
    uint256 public constant SWAP_THRESHOLD = 1_000_000 ether;
    uint256 public constant MAX_SWAP_AMOUNT = 5_000_000 ether;
    uint256 public constant SWAP_SLIPPAGE_BPS = 1_000;
    uint256 public constant AUTO_REWARD_PROCESS_GAS = 250_000;
    uint256 private constant BPS = 10_000;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isTaxExempt;

    IPancakeV2Router public immutable router;
    address public immutable wbnb;
    IERC20Minimal public immutable rewardToken;
    uint256 public immutable minimumWbnbValue;
    SideTaxes public buyTaxes;
    SideTaxes public sellTaxes;

    address public launchManager;
    address public launchCurve;
    address public graduationAuthority;
    address public liquidityPair;
    BNBXLPRewardsVault public rewardVault;
    bool public taxesEnabled;
    bool private swapping;
    bool private processingRewards;
    uint256 public tokensForLiquidity;
    uint256 public tokensForRewards;

    error InvalidIdentity();
    error InvalidAddress();
    error InvalidTax();
    error InvalidMinimum();
    error MissingRewardLiquidity();
    error InsufficientBalance();
    error InsufficientAllowance();
    error OnlyLaunchManager();
    error OnlyGraduationAuthority();
    error LaunchAlreadyConfigured();
    error LiquidityPairLocked();
    error TaxesNotReady();
    error BelowSwapThreshold();
    error Reentrancy();
    error RouterCallFailed();
    error TransferFailed();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event LaunchConfigured(
        address indexed curve, address indexed pair, address indexed vault
    );
    event TaxesActivated(uint16 buyTotalBps, uint16 sellTotalBps);
    event TaxesProcessed(
        uint256 tokensProcessed,
        uint256 tokensAddedToLiquidity,
        uint256 bnbAddedToLiquidity,
        uint256 bnbConvertedToRewards
    );
    event TaxProcessingDeferred(bytes reason);
    event AutomaticRewardProcessingDeferred(bytes reason);

    constructor(Init memory init) {
        if (
            bytes(init.name).length == 0 || bytes(init.name).length > 128
                || bytes(init.symbol).length == 0
                || bytes(init.symbol).length > 64
        ) revert InvalidIdentity();
        if (
            init.launchManager == address(0) || init.launchManager == DEAD
                || init.router == address(0) || init.router.code.length == 0
                || init.rewardToken == address(0) || init.rewardToken == DEAD
                || init.rewardToken.code.length == 0
        ) revert InvalidAddress();
        if (init.minimumWbnbValue != 0.01 ether) revert InvalidMinimum();
        _validateTaxes(init.taxes);

        IPancakeV2Router configuredRouter = IPancakeV2Router(init.router);
        address configuredWbnb = configuredRouter.WETH();
        if (
            init.rewardToken == configuredWbnb
                || !_hasRewardLiquidity(
                    configuredRouter, init.rewardToken, configuredWbnb
                )
        ) revert MissingRewardLiquidity();

        name = init.name;
        symbol = init.symbol;
        launchManager = init.launchManager;
        router = configuredRouter;
        wbnb = configuredWbnb;
        rewardToken = IERC20Minimal(init.rewardToken);
        minimumWbnbValue = init.minimumWbnbValue;
        buyTaxes = init.taxes.buy;
        sellTaxes = init.taxes.sell;
        isTaxExempt[address(this)] = true;
        isTaxExempt[DEAD] = true;
        isTaxExempt[address(configuredRouter)] = true;
        balanceOf[init.launchManager] = TOTAL_SUPPLY;
        emit Transfer(address(0), init.launchManager, TOTAL_SUPPLY);
    }

    receive() external payable {
        if (msg.sender != address(router)) revert RouterCallFailed();
    }

    function configureLaunch(address curve, address pair, address deployer)
        external
    {
        if (msg.sender != launchManager) revert OnlyLaunchManager();
        if (
            curve == address(0) || curve == DEAD || pair == address(0)
                || pair == DEAD || deployer == address(0) || deployer == DEAD
                || curve == pair || curve.code.length == 0
                || pair.code.length == 0
        ) revert InvalidAddress();
        if (
            graduationAuthority != address(0) || liquidityPair != address(0)
                || address(rewardVault) != address(0)
        ) revert LaunchAlreadyConfigured();

        BNBXLPRewardsVault vault = new BNBXLPRewardsVault(
            address(this),
            pair,
            wbnb,
            address(rewardToken),
            address(router),
            msg.sender,
            deployer,
            curve,
            minimumWbnbValue
        );
        launchCurve = curve;
        graduationAuthority = curve;
        liquidityPair = pair;
        rewardVault = vault;
        isTaxExempt[curve] = true;
        isTaxExempt[address(vault)] = true;
        launchManager = DEAD;
        emit LaunchConfigured(curve, pair, address(vault));
    }

    function unlockLiquidityPair() external {
        if (msg.sender != graduationAuthority) revert OnlyGraduationAuthority();
        taxesEnabled = true;
        graduationAuthority = DEAD;
        emit TaxesActivated(uint16(_total(buyTaxes)), uint16(_total(sellTaxes)));
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
        uint256 tracked = tokensForLiquidity + tokensForRewards;
        uint256 contractBalance = balanceOf[address(this)];
        if (tracked < SWAP_THRESHOLD || contractBalance < SWAP_THRESHOLD) {
            revert BelowSwapThreshold();
        }
        uint256 process = contractBalance < tracked ? contractBalance : tracked;
        if (process > MAX_SWAP_AMOUNT) process = MAX_SWAP_AMOUNT;
        _processTaxes(process, tracked);
    }

    function processRewards(uint256 requestedGas)
        external
        returns (uint256 iterations, uint256 claims, uint256 cursor)
    {
        return rewardVault.processRewards(requestedGas);
    }

    function claimRewards() external returns (uint256 amount) {
        return rewardVault.claimFor(msg.sender);
    }

    function withdrawableRewardOf(address account) external view returns (uint256) {
        return rewardVault.claimable(account);
    }

    function fundRewards(uint256 amount) external {
        if (amount == 0) revert TransferFailed();
        if (!rewardToken.transferFrom(msg.sender, address(rewardVault), amount)) {
            revert TransferFailed();
        }
        rewardVault.syncRewards();
        _processAutomaticRewards();
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (to == liquidityPair && !taxesEnabled) revert LiquidityPairLocked();
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
            _attemptAutomaticRewards(from, to);
            return;
        }

        SideTaxes memory taxes = from == liquidityPair ? buyTaxes : sellTaxes;
        uint256 liquidityAmount = amount * taxes.liquidity / BPS;
        uint256 rewardsAmount = amount * taxes.rewards / BPS;
        uint256 burnAmount = amount * taxes.burn / BPS;
        uint256 totalTax = liquidityAmount + rewardsAmount + burnAmount;

        _rawTransfer(from, to, amount - totalTax);
        if (burnAmount != 0) _rawTransfer(from, DEAD, burnAmount);
        uint256 collected = liquidityAmount + rewardsAmount;
        if (collected != 0) {
            _rawTransfer(from, address(this), collected);
            tokensForLiquidity += liquidityAmount;
            tokensForRewards += rewardsAmount;
        }
        _attemptAutomaticRewards(from, to);
    }

    function _processTaxes(uint256 process, uint256 tracked) internal {
        ProcessAmounts memory amounts;
        amounts.liquidityTokens = process * tokensForLiquidity / tracked;
        amounts.rewardsTokens = process - amounts.liquidityTokens;
        amounts.tokensToLiquidity = amounts.liquidityTokens / 2;
        amounts.tokensToSwap = process - amounts.tokensToLiquidity;
        if (amounts.tokensToSwap == 0) revert BelowSwapThreshold();

        tokensForLiquidity -= amounts.liquidityTokens;
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
        amounts.rewardsBNB = receivedBNB - amounts.liquidityBNB;
        (amounts.tokensAdded, amounts.bnbAdded) = _addAutomaticLiquidity(
            amounts.tokensToLiquidity, amounts.liquidityBNB
        );
        tokensForLiquidity += amounts.tokensToLiquidity - amounts.tokensAdded;
        amounts.rewardsBNB += amounts.liquidityBNB - amounts.bnbAdded;
        _convertRewards(amounts.rewardsBNB);
        swapping = false;
        emit TaxesProcessed(
            process,
            amounts.tokensAdded,
            amounts.bnbAdded,
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
        _processAutomaticRewards();
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
    }

    function _attemptAutomaticRewards(address from, address to) internal {
        if (
            swapping || processingRewards || !taxesEnabled
                || (from != liquidityPair && to != liquidityPair)
                || address(rewardVault) == address(0)
        ) return;
        _processAutomaticRewards();
    }

    function _processAutomaticRewards() internal {
        if (!rewardVault.automaticProcessingPending()) return;
        processingRewards = true;
        try rewardVault.processRewards(AUTO_REWARD_PROCESS_GAS) returns (
            uint256,
            uint256,
            uint256
        ) { }
        catch (bytes memory reason) {
            emit AutomaticRewardProcessingDeferred(reason);
        }
        processingRewards = false;
    }

    function _validateTaxes(Taxes memory taxes) internal pure {
        if (
            _total(taxes.buy) > MAX_SIDE_TAX_BPS
                || _total(taxes.sell) > MAX_SIDE_TAX_BPS
        ) revert InvalidTax();
    }

    function _total(SideTaxes memory taxes) internal pure returns (uint256) {
        return uint256(taxes.liquidity) + taxes.rewards + taxes.burn;
    }

    function _hasRewardLiquidity(
        IPancakeV2Router configuredRouter,
        address configuredRewardToken,
        address configuredWbnb
    ) internal view returns (bool) {
        address rewardPair = IPancakeV2Factory(configuredRouter.factory()).getPair(
            configuredRewardToken, configuredWbnb
        );
        if (rewardPair == address(0) || rewardPair.code.length == 0) return false;
        (uint112 reserve0, uint112 reserve1,) =
            IPancakeV2Pair(rewardPair).getReserves();
        return reserve0 != 0 && reserve1 != 0;
    }
}
