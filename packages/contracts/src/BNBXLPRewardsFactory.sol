// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXLPRewardsTokenDeployer } from "./BNBXLPRewardsTokenDeployer.sol";
import { BNBXLPRewardsToken } from "./BNBXLPRewardsToken.sol";
import { BondingCurve } from "./BondingCurve.sol";
import {
    IPancakeV2Factory,
    IPancakeV2Pair,
    IPancakeV2Router
} from "./interfaces/IPancakeV2.sol";

/// @title BNBX independent LP-staker Rewards V2 launch Factory
contract BNBXLPRewardsFactory {
    address private constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    struct CreateRequest {
        string name;
        string symbol;
        uint8 graduationTargetBNB;
        string metadataURI;
        bytes32 vanitySalt;
        address rewardToken;
        BNBXLPRewardsToken.Taxes taxes;
    }

    struct BuyRequest {
        uint256 minTokensOut;
        uint256 deadline;
        address refundRecipient;
    }

    uint256 public constant CREATION_FEE = 0.001 ether;
    address public immutable feeRecipient;
    address public immutable pancakeV2Router;
    address public immutable defaultRewardToken;
    BNBXLPRewardsTokenDeployer public immutable tokenDeployer;
    mapping(address => address) public curveOf;
    mapping(address => string) public tokenMetadataURI;
    address[] public allTokens;
    uint256 private unlocked = 1;

    error Reentrancy();
    error InvalidAddress();
    error InvalidCreationValue();
    error UnknownToken();
    error TransferFailed();
    error MetadataTooLong();
    error InvalidVanitySalt();
    error MissingRewardLiquidity();

    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol,
        uint8 graduationTargetBNB,
        string metadataURI
    );
    event LPRewardsConfigured(
        address indexed token,
        address indexed rewardToken,
        BNBXLPRewardsToken.SideTaxes buyTaxes,
        BNBXLPRewardsToken.SideTaxes sellTaxes,
        uint256 minimumWbnbValue
    );
    event CreationFeePaid(address indexed creator, uint256 amount);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address feeRecipient_, address router_, address defaultRewardToken_) {
        if (
            feeRecipient_ == address(0) || router_ == address(0)
                || router_.code.length == 0 || defaultRewardToken_ == address(0)
                || defaultRewardToken_.code.length == 0
        ) revert InvalidAddress();
        feeRecipient = feeRecipient_;
        pancakeV2Router = router_;
        _validateRewardToken(defaultRewardToken_);
        defaultRewardToken = defaultRewardToken_;
        tokenDeployer = new BNBXLPRewardsTokenDeployer();
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function createVanityToken(CreateRequest calldata request)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        if (msg.value != CREATION_FEE) revert InvalidCreationValue();
        (token, curve) = _create(request, msg.sender);
        _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);
    }

    function createVanityTokenAndBuy(
        CreateRequest calldata request,
        BuyRequest calldata buyRequest
    )
        external
        payable
        nonReentrant
        returns (address token, address curve, uint256 tokensOut)
    {
        if (
            msg.value <= CREATION_FEE || buyRequest.refundRecipient == address(0)
        ) revert InvalidCreationValue();
        (token, curve) = _create(request, msg.sender);
        _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);
        (tokensOut,) = BondingCurve(payable(curve)).buy{
            value: msg.value - CREATION_FEE
        }(
            msg.sender,
            buyRequest.refundRecipient,
            buyRequest.minTokensOut,
            buyRequest.deadline
        );
        _graduateIfReady(curve, buyRequest.deadline);
    }

    function buy(
        address token,
        uint256 minTokensOut,
        uint256 deadline,
        address refundRecipient
    ) external payable nonReentrant returns (uint256 tokensOut) {
        address curve = _curve(token);
        (tokensOut,) = BondingCurve(payable(curve)).buy{ value: msg.value }(
            msg.sender, refundRecipient, minTokensOut, deadline
        );
        _graduateIfReady(curve, deadline);
    }

    function sell(
        address token,
        uint256 tokensIn,
        uint256 minBNBOut,
        uint256 deadline
    ) external nonReentrant returns (uint256) {
        return BondingCurve(payable(_curve(token))).sell(
            msg.sender, tokensIn, minBNBOut, deadline
        );
    }

    function predictTokenAddress(CreateRequest memory request)
        public
        view
        returns (address)
    {
        return tokenDeployer.predict(request.vanitySalt, _tokenInit(request));
    }

    function findVanitySalt(
        CreateRequest calldata request,
        uint256 start,
        uint256 maxIterations
    ) external view returns (bool found, bytes32 salt, address predicted) {
        BNBXLPRewardsToken.Init memory init = _tokenInit(request);
        bytes32 initHash = tokenDeployer.initCodeHash(init);
        for (uint256 i; i < maxIterations; ++i) {
            salt = bytes32(start + i);
            predicted = address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff), address(tokenDeployer), salt, initHash
                            )
                        )
                    )
                )
            );
            if (
                uint16(uint160(predicted)) == 0x1111
                    && predicted.code.length == 0
            ) return (true, salt, predicted);
        }
    }

    function _create(CreateRequest memory request, address creator)
        internal
        returns (address tokenAddress, address curveAddress)
    {
        if (bytes(request.metadataURI).length > 256) revert MetadataTooLong();
        BNBXLPRewardsToken.Init memory init = _tokenInit(request);
        address predicted = tokenDeployer.predict(request.vanitySalt, init);
        if (
            uint16(uint160(predicted)) != 0x1111 || predicted.code.length != 0
        ) revert InvalidVanitySalt();
        BNBXLPRewardsToken token =
            tokenDeployer.deploy(request.vanitySalt, init);
        tokenAddress = address(token);

        IPancakeV2Router router = IPancakeV2Router(pancakeV2Router);
        address wbnb = router.WETH();
        IPancakeV2Factory pancakeFactory = IPancakeV2Factory(router.factory());
        address pair = pancakeFactory.getPair(tokenAddress, wbnb);
        if (pair == address(0)) pair = pancakeFactory.createPair(tokenAddress, wbnb);
        curveAddress = address(
            new BondingCurve(
                tokenAddress,
                address(this),
                feeRecipient,
                creator,
                request.graduationTargetBNB,
                pair,
                wbnb
            )
        );
        token.configureLaunch(curveAddress, pair, address(tokenDeployer));
        if (!token.transfer(curveAddress, token.TOTAL_SUPPLY())) {
            revert TransferFailed();
        }
        _recordCreation(request, creator, tokenAddress, curveAddress, init.rewardToken);
    }

    function _recordCreation(
        CreateRequest memory request,
        address creator,
        address tokenAddress,
        address curveAddress,
        address resolvedRewardToken
    ) internal {
        curveOf[tokenAddress] = curveAddress;
        tokenMetadataURI[tokenAddress] = request.metadataURI;
        allTokens.push(tokenAddress);
        emit TokenCreated(
            tokenAddress,
            curveAddress,
            creator,
            request.name,
            request.symbol,
            request.graduationTargetBNB,
            request.metadataURI
        );
        emit LPRewardsConfigured(
            tokenAddress,
            resolvedRewardToken,
            request.taxes.buy,
            request.taxes.sell,
            0.01 ether
        );
    }

    function _tokenInit(CreateRequest memory request)
        internal
        view
        returns (BNBXLPRewardsToken.Init memory)
    {
        address resolvedRewardToken = request.rewardToken == address(0)
            ? defaultRewardToken
            : request.rewardToken;
        _validateRewardToken(resolvedRewardToken);
        return BNBXLPRewardsToken.Init({
            name: request.name,
            symbol: request.symbol,
            launchManager: address(this),
            router: pancakeV2Router,
            rewardToken: resolvedRewardToken,
            taxes: request.taxes,
            minimumWbnbValue: 0.01 ether
        });
    }

    function _validateRewardToken(address rewardToken_) internal view {
        IPancakeV2Router router = IPancakeV2Router(pancakeV2Router);
        address wbnb = router.WETH();
        if (
            rewardToken_ == address(0) || rewardToken_ == DEAD
                || rewardToken_ == wbnb || rewardToken_.code.length == 0
        ) revert InvalidAddress();
        address rewardPair = IPancakeV2Factory(router.factory()).getPair(
            rewardToken_, wbnb
        );
        if (rewardPair == address(0) || rewardPair.code.length == 0) {
            revert MissingRewardLiquidity();
        }
        (uint112 reserve0, uint112 reserve1,) =
            IPancakeV2Pair(rewardPair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) revert MissingRewardLiquidity();
    }

    function _curve(address token) internal view returns (address curve) {
        curve = curveOf[token];
        if (curve == address(0)) revert UnknownToken();
    }

    function _graduateIfReady(address curve, uint256 deadline) internal {
        if (
            BondingCurve(payable(curve)).state()
                == BondingCurve.State.ReadyForGraduation
        ) BondingCurve(payable(curve)).graduate(deadline);
    }

    function _sendBNB(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }
}
