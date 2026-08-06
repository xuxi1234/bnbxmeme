// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Minimal, ILaunchToken, IWBNB } from "./interfaces/IERC20Minimal.sol";
import { IPancakeV2Pair } from "./interfaces/IPancakeV2.sol";
import { FeeMath } from "./libraries/FeeMath.sol";

/// @title BNBX virtual-reserve bonding curve
/// @notice Trading is routed through BNBXFactory so creation and first buy can
/// be executed atomically.
contract BondingCurve {
    /// @dev A target step of 1..18 permanently represents 1..18 BNB for
    /// this immutable Factory release.
    uint256 public constant GRADUATION_UNIT = 1 ether;
    using FeeMath for uint256;

    enum State {
        Trading,
        ReadyForGraduation,
        Graduated
    }

    uint256 public constant CURVE_TOKEN_SUPPLY = 800_000_000 ether;
    uint256 public constant GRADUATION_TOKEN_SUPPLY = 200_000_000 ether;
    uint256 public constant TRADE_FEE_BPS = 100;
    address public constant LP_BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;

    IERC20Minimal public immutable token;
    address public immutable factory;
    address public immutable feeRecipient;
    address public immutable creator;
    address public immutable liquidityPair;
    address public immutable wbnb;
    uint256 public immutable graduationTarget;
    uint256 public immutable invariantK;

    uint256 public virtualBNBReserve;
    uint256 public virtualTokenReserve;
    uint256 public realBNBPrincipal;
    uint256 public realTokenReserve = CURVE_TOKEN_SUPPLY;
    State public state;

    uint256 private unlocked = 1;

    error OnlyFactory();
    error Reentrancy();
    error InvalidAddress();
    error InvalidTarget();
    error InvalidAmount();
    error DeadlineExpired();
    error NotTrading();
    error NotReady();
    error SlippageExceeded();
    error InsufficientPrincipal();
    error TransferFailed();
    error IncompleteLiquidity();

    event Bought(
        address indexed buyer,
        uint256 grossBNB,
        uint256 feeBNB,
        uint256 netBNB,
        uint256 tokensOut,
        uint256 refundBNB
    );
    event Sold(
        address indexed seller,
        uint256 tokensIn,
        uint256 grossBNB,
        uint256 feeBNB,
        uint256 netBNB
    );
    event ReadyForGraduation(uint256 principal, uint256 reservedTokens);
    event Graduated(address indexed pair, uint256 bnbLiquidity, uint256 tokenLiquidity);

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address token_,
        address factory_,
        address feeRecipient_,
        address creator_,
        uint8 graduationTargetBNB,
        address liquidityPair_,
        address wbnb_
    ) {
        if (
            token_ == address(0) || factory_ == address(0) || feeRecipient_ == address(0)
                || creator_ == address(0) || liquidityPair_ == address(0)
                || wbnb_ == address(0)
        ) revert InvalidAddress();
        if (graduationTargetBNB < 1 || graduationTargetBNB > 18) revert InvalidTarget();

        token = IERC20Minimal(token_);
        factory = factory_;
        feeRecipient = feeRecipient_;
        creator = creator_;
        liquidityPair = liquidityPair_;
        wbnb = wbnb_;
        graduationTarget = uint256(graduationTargetBNB) * GRADUATION_UNIT;

        virtualBNBReserve = graduationTarget / 3;
        virtualTokenReserve = uint256(3_200_000_000 ether) / 3;
        invariantK = virtualBNBReserve * virtualTokenReserve;
    }

    receive() external payable {
        revert InvalidAmount();
    }

    function quoteBuy(uint256 grossBNB)
        external
        view
        returns (uint256 acceptedGross, uint256 feeBNB, uint256 netBNB, uint256 tokensOut)
    {
        return _quoteBuy(grossBNB);
    }

    function quoteSell(uint256 tokensIn)
        external
        view
        returns (uint256 grossBNB, uint256 feeBNB, uint256 netBNB)
    {
        return _quoteSell(tokensIn);
    }

    function buy(address buyer, address refundRecipient, uint256 minTokensOut, uint256 deadline)
        external
        payable
        onlyFactory
        nonReentrant
        returns (uint256 tokensOut, uint256 refundBNB)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (state != State.Trading) revert NotTrading();
        if (buyer == address(0) || refundRecipient == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();

        (uint256 acceptedGross, uint256 feeBNB, uint256 netBNB, uint256 quotedTokens) =
            _quoteBuy(msg.value);
        tokensOut = quotedTokens;
        refundBNB = msg.value - acceptedGross;
        if (tokensOut < minTokensOut || tokensOut == 0) revert SlippageExceeded();

        virtualBNBReserve += netBNB;
        virtualTokenReserve -= tokensOut;
        realBNBPrincipal += netBNB;
        realTokenReserve -= tokensOut;

        if (!token.transfer(buyer, tokensOut)) revert TransferFailed();
        _sendBNB(feeRecipient, feeBNB);
        if (refundBNB != 0) _sendBNB(refundRecipient, refundBNB);

        if (realBNBPrincipal == graduationTarget) {
            state = State.ReadyForGraduation;
            emit ReadyForGraduation(realBNBPrincipal, GRADUATION_TOKEN_SUPPLY);
        }

        emit Bought(buyer, acceptedGross, feeBNB, netBNB, tokensOut, refundBNB);
    }

    function sell(
        address seller,
        uint256 tokensIn,
        uint256 minBNBOut,
        uint256 deadline
    ) external onlyFactory nonReentrant returns (uint256 netBNB) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (state != State.Trading) revert NotTrading();
        if (seller == address(0) || tokensIn == 0) revert InvalidAmount();

        (uint256 grossBNB, uint256 feeBNB, uint256 quotedNet) = _quoteSell(tokensIn);
        netBNB = quotedNet;
        if (netBNB < minBNBOut || netBNB == 0) revert SlippageExceeded();
        if (grossBNB > realBNBPrincipal) revert InsufficientPrincipal();

        if (!token.transferFrom(seller, address(this), tokensIn)) revert TransferFailed();

        virtualTokenReserve += tokensIn;
        virtualBNBReserve -= grossBNB;
        realTokenReserve += tokensIn;
        realBNBPrincipal -= grossBNB;

        _sendBNB(feeRecipient, feeBNB);
        _sendBNB(seller, netBNB);

        emit Sold(seller, tokensIn, grossBNB, feeBNB, netBNB);
    }

    /// @notice Adds all reserved tokens and curve principal to a new,
    /// unseeded PancakeSwap V2 pair. LP tokens are minted directly to the burn
    /// address and are never held by the creator or protocol.
    function graduate(uint256 deadline)
        external
        onlyFactory
        nonReentrant
        returns (address pair, uint256 liquidity)
    {
        if (state != State.ReadyForGraduation) revert NotReady();
        if (block.timestamp > deadline) revert DeadlineExpired();
        pair = liquidityPair;
        if (IPancakeV2Pair(pair).totalSupply() != 0) revert IncompleteLiquidity();
        if (token.balanceOf(pair) != 0) revert IncompleteLiquidity();

        uint256 bnbLiquidity = realBNBPrincipal;
        ILaunchToken(address(token)).unlockLiquidityPair();
        if (!token.transfer(pair, GRADUATION_TOKEN_SUPPLY)) revert TransferFailed();
        IWBNB(wbnb).deposit{ value: bnbLiquidity }();
        if (!IWBNB(wbnb).transfer(pair, bnbLiquidity)) revert TransferFailed();
        liquidity = IPancakeV2Pair(pair).mint(LP_BURN_ADDRESS);
        if (
            liquidity == 0
                || token.balanceOf(pair) != GRADUATION_TOKEN_SUPPLY
                || IERC20Minimal(wbnb).balanceOf(pair) < bnbLiquidity
        ) revert IncompleteLiquidity();
        state = State.Graduated;
        emit Graduated(pair, bnbLiquidity, GRADUATION_TOKEN_SUPPLY);
    }

    function _quoteBuy(uint256 offeredGross)
        internal
        view
        returns (uint256 acceptedGross, uint256 feeBNB, uint256 netBNB, uint256 tokensOut)
    {
        if (offeredGross == 0 || state != State.Trading) return (0, 0, 0, 0);

        uint256 remainingNet = graduationTarget - realBNBPrincipal;
        uint256 requiredGross = FeeMath.grossForExactNet(remainingNet, TRADE_FEE_BPS);
        acceptedGross = offeredGross < requiredGross ? offeredGross : requiredGross;
        feeBNB = FeeMath.feeOn(acceptedGross, TRADE_FEE_BPS);
        netBNB = acceptedGross - feeBNB;

        uint256 newVirtualBNB = virtualBNBReserve + netBNB;
        uint256 newVirtualToken = FeeMath.ceilDiv(invariantK, newVirtualBNB);
        tokensOut = virtualTokenReserve - newVirtualToken;
        // The exact final fill receives the entire remaining 800m allocation.
        // Including the rounding residue in the quote keeps quote and execution
        // identical for every graduation target.
        if (netBNB == remainingNet) tokensOut = realTokenReserve;
        if (tokensOut > realTokenReserve) tokensOut = realTokenReserve;
    }

    function _quoteSell(uint256 tokensIn)
        internal
        view
        returns (uint256 grossBNB, uint256 feeBNB, uint256 netBNB)
    {
        if (
            tokensIn == 0 || tokensIn > CURVE_TOKEN_SUPPLY - realTokenReserve
                || state != State.Trading
        ) return (0, 0, 0);

        uint256 newVirtualToken = virtualTokenReserve + tokensIn;
        uint256 newVirtualBNB = FeeMath.ceilDiv(invariantK, newVirtualToken);
        grossBNB = virtualBNBReserve - newVirtualBNB;
        if (grossBNB > realBNBPrincipal) grossBNB = realBNBPrincipal;
        feeBNB = FeeMath.feeOn(grossBNB, TRADE_FEE_BPS);
        netBNB = grossBNB - feeBNB;
    }

    function _sendBNB(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }
}
