// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXHolderRewardsToken } from "./BNBXHolderRewardsToken.sol";
import { BondingCurve } from "./BondingCurve.sol";
import { IPancakeV2Factory, IPancakeV2Router } from "./interfaces/IPancakeV2.sol";

/// @title BNBX independent holder-rewards launch Factory
contract BNBXHolderRewardsFactory {
    struct CreateRequest {
        string name;
        string symbol;
        uint8 graduationTargetBNB;
        string metadataURI;
        bytes32 vanitySalt;
        address rewardToken;
        uint16 buyRewardTaxBps;
        uint16 sellRewardTaxBps;
        uint256 minimumRewardBalance;
    }
    struct BuyRequest { uint256 minTokensOut; uint256 deadline; address refundRecipient; }

    uint256 public constant CREATION_FEE = 0.001 ether;
    address public immutable feeRecipient;
    address public immutable pancakeV2Router;
    mapping(address => address) public curveOf;
    mapping(address => string) public tokenMetadataURI;
    address[] public allTokens;
    uint256 private unlocked = 1;

    error Reentrancy(); error InvalidAddress(); error InvalidCreationValue();
    error UnknownToken(); error TransferFailed(); error MetadataTooLong();
    error InvalidVanitySalt();
    event TokenCreated(address indexed token, address indexed curve, address indexed creator,
        string name, string symbol, uint8 graduationTargetBNB, string metadataURI);
    event HolderRewardsConfigured(address indexed token, address indexed rewardToken,
        uint16 buyRewardTaxBps, uint16 sellRewardTaxBps, uint256 minimumRewardBalance);
    event CreationFeePaid(address indexed creator, uint256 amount);

    modifier nonReentrant() { if (unlocked != 1) revert Reentrancy(); unlocked = 2; _; unlocked = 1; }

    constructor(address feeRecipient_, address router_) {
        if (feeRecipient_ == address(0) || router_ == address(0) || router_.code.length == 0)
            revert InvalidAddress();
        feeRecipient = feeRecipient_; pancakeV2Router = router_;
    }
    function tokenCount() external view returns (uint256) { return allTokens.length; }
    function createVanityToken(CreateRequest calldata request) external payable nonReentrant
        returns (address token, address curve) {
        if (msg.value != CREATION_FEE) revert InvalidCreationValue();
        (token, curve) = _create(request, msg.sender); _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);
    }
    function createVanityTokenAndBuy(CreateRequest calldata request, BuyRequest calldata buyRequest)
        external payable nonReentrant returns (address token, address curve, uint256 tokensOut) {
        if (msg.value <= CREATION_FEE || buyRequest.refundRecipient == address(0))
            revert InvalidCreationValue();
        (token, curve) = _create(request, msg.sender); _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);
        (tokensOut,) = BondingCurve(payable(curve)).buy{value: msg.value - CREATION_FEE}(
            msg.sender, buyRequest.refundRecipient, buyRequest.minTokensOut, buyRequest.deadline);
        _graduateIfReady(curve, buyRequest.deadline);
    }
    function buy(address token, uint256 minTokensOut, uint256 deadline, address refundRecipient)
        external payable nonReentrant returns (uint256 tokensOut) {
        address curve = _curve(token); (tokensOut,) = BondingCurve(payable(curve)).buy{value: msg.value}(
            msg.sender, refundRecipient, minTokensOut, deadline); _graduateIfReady(curve, deadline);
    }
    function sell(address token, uint256 tokensIn, uint256 minBNBOut, uint256 deadline)
        external nonReentrant returns (uint256) {
        return BondingCurve(payable(_curve(token))).sell(msg.sender, tokensIn, minBNBOut, deadline);
    }
    function predictTokenAddress(CreateRequest memory request) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this),
            request.vanitySalt, _initCodeHash(request))))));
    }
    function findVanitySalt(CreateRequest calldata request, uint256 start, uint256 maxIterations)
        external view returns (bool found, bytes32 salt, address predicted) {
        bytes32 initHash = _initCodeHash(request);
        for (uint256 i; i < maxIterations; ++i) {
            salt = bytes32(start + i);
            predicted = address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xff), address(this), salt, initHash)))));
            if (uint16(uint160(predicted)) == 0x1111 && predicted.code.length == 0)
                return (true, salt, predicted);
        }
    }
    function _create(CreateRequest memory request, address creator)
        internal returns (address tokenAddress, address curveAddress) {
        if (bytes(request.metadataURI).length > 256) revert MetadataTooLong();
        address predicted = predictTokenAddress(request);
        if (uint16(uint160(predicted)) != 0x1111 || predicted.code.length != 0)
            revert InvalidVanitySalt();
        BNBXHolderRewardsToken token = new BNBXHolderRewardsToken{salt: request.vanitySalt}(
            _tokenInit(request)); tokenAddress = address(token);
        IPancakeV2Router router = IPancakeV2Router(pancakeV2Router);
        address wbnb = router.WETH();
        IPancakeV2Factory pancakeFactory = IPancakeV2Factory(router.factory());
        address pair = pancakeFactory.getPair(tokenAddress, wbnb);
        if (pair == address(0)) pair = pancakeFactory.createPair(tokenAddress, wbnb);
        curveAddress = address(new BondingCurve(tokenAddress, address(this), feeRecipient,
            creator, request.graduationTargetBNB, pair, wbnb));
        token.configureLaunch(curveAddress, pair);
        if (!token.transfer(curveAddress, token.TOTAL_SUPPLY())) revert TransferFailed();
        _recordCreation(request, creator, tokenAddress, curveAddress);
    }
    function _recordCreation(CreateRequest memory request, address creator,
        address tokenAddress, address curveAddress) internal {
        curveOf[tokenAddress] = curveAddress;
        tokenMetadataURI[tokenAddress] = request.metadataURI;
        allTokens.push(tokenAddress);
        emit TokenCreated(tokenAddress, curveAddress, creator, request.name, request.symbol,
            request.graduationTargetBNB, request.metadataURI);
        emit HolderRewardsConfigured(tokenAddress, request.rewardToken,
            request.buyRewardTaxBps, request.sellRewardTaxBps,
            request.minimumRewardBalance);
    }
    function _tokenInit(CreateRequest memory r) internal view returns (BNBXHolderRewardsToken.Init memory) {
        return BNBXHolderRewardsToken.Init(r.name, r.symbol, address(this), pancakeV2Router,
            r.rewardToken, r.buyRewardTaxBps, r.sellRewardTaxBps, r.minimumRewardBalance);
    }
    function _initCodeHash(CreateRequest memory r) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(type(BNBXHolderRewardsToken).creationCode,
            abi.encode(_tokenInit(r))));
    }
    function _curve(address token) internal view returns (address curve) {
        curve = curveOf[token]; if (curve == address(0)) revert UnknownToken();
    }
    function _graduateIfReady(address curve, uint256 deadline) internal {
        if (BondingCurve(payable(curve)).state() == BondingCurve.State.ReadyForGraduation)
            BondingCurve(payable(curve)).graduate(deadline);
    }
    function _sendBNB(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}(""); if (!success) revert TransferFailed();
    }
}
