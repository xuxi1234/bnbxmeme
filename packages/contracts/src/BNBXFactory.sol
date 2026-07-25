// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXToken } from "./BNBXToken.sol";
import { BondingCurve } from "./BondingCurve.sol";
import { IPancakeV2Factory, IPancakeV2Router } from "./interfaces/IPancakeV2.sol";

/// @title BNBX launch factory
/// @notice Creates immutable zero-tax tokens and routes all internal trades.
contract BNBXFactory {
    uint256 public constant CREATION_FEE = 0.001 ether;
    address public immutable feeRecipient;
    address public immutable pancakeV2Router;

    mapping(address token => address curve) public curveOf;
    mapping(address token => string metadataURI) public tokenMetadataURI;
    address[] public allTokens;

    uint256 private unlocked = 1;

    error Reentrancy();
    error InvalidAddress();
    error InvalidCreationValue();
    error UnknownToken();
    error TransferFailed();
    error MetadataTooLong();

    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol,
        uint8 graduationTargetBNB,
        string metadataURI
    );
    event CreationFeePaid(address indexed creator, uint256 amount);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address feeRecipient_, address pancakeV2Router_) {
        if (feeRecipient_ == address(0) || pancakeV2Router_ == address(0)) {
            revert InvalidAddress();
        }
        feeRecipient = feeRecipient_;
        pancakeV2Router = pancakeV2Router_;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint8 graduationTargetBNB,
        string calldata metadataURI
    ) external payable nonReentrant returns (address tokenAddress, address curveAddress) {
        if (msg.value != CREATION_FEE) revert InvalidCreationValue();
        (tokenAddress, curveAddress) =
            _create(name, symbol, graduationTargetBNB, metadataURI, msg.sender);
        _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);
    }

    function createTokenAndBuy(
        string calldata name,
        string calldata symbol,
        uint8 graduationTargetBNB,
        string calldata metadataURI,
        uint256 minTokensOut,
        uint256 deadline,
        address refundRecipient
    )
        external
        payable
        nonReentrant
        returns (address tokenAddress, address curveAddress, uint256 tokensOut)
    {
        if (msg.value <= CREATION_FEE) revert InvalidCreationValue();
        if (refundRecipient == address(0)) revert InvalidAddress();

        (tokenAddress, curveAddress) =
            _create(name, symbol, graduationTargetBNB, metadataURI, msg.sender);
        _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);

        (tokensOut,) = BondingCurve(payable(curveAddress)).buy{
            value: msg.value - CREATION_FEE
        }(msg.sender, refundRecipient, minTokensOut, deadline);
        _graduateIfReady(curveAddress, deadline);
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

    function sell(address token, uint256 tokensIn, uint256 minBNBOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 netBNB)
    {
        return BondingCurve(payable(_curve(token))).sell(
            msg.sender, tokensIn, minBNBOut, deadline
        );
    }

    function _create(
        string calldata name,
        string calldata symbol,
        uint8 graduationTargetBNB,
        string calldata metadataURI,
        address creator
    ) internal returns (address tokenAddress, address curveAddress) {
        if (bytes(metadataURI).length > 256) revert MetadataTooLong();
        BNBXToken token = new BNBXToken(name, symbol, address(this));
        tokenAddress = address(token);
        {
            IPancakeV2Router router = IPancakeV2Router(pancakeV2Router);
            address wbnb = router.WETH();
            IPancakeV2Factory pancakeFactory = IPancakeV2Factory(router.factory());
            address pair = pancakeFactory.getPair(tokenAddress, wbnb);
            if (pair == address(0)) {
                pair = pancakeFactory.createPair(tokenAddress, wbnb);
            }
            BondingCurve curve = new BondingCurve(
                tokenAddress,
                address(this),
                feeRecipient,
                creator,
                graduationTargetBNB,
                pair,
                wbnb
            );
            curveAddress = address(curve);
            token.configureLaunch(curveAddress, pair);
        }

        curveOf[tokenAddress] = curveAddress;
        tokenMetadataURI[tokenAddress] = metadataURI;
        allTokens.push(tokenAddress);

        if (!token.transfer(curveAddress, token.TOTAL_SUPPLY())) revert TransferFailed();

        emit TokenCreated(
            tokenAddress,
            curveAddress,
            creator,
            name,
            symbol,
            graduationTargetBNB,
            metadataURI
        );
    }

    function _curve(address token) internal view returns (address curve) {
        curve = curveOf[token];
        if (curve == address(0)) revert UnknownToken();
    }

    function _graduateIfReady(address curve, uint256 deadline) internal {
        if (BondingCurve(payable(curve)).state() == BondingCurve.State.ReadyForGraduation) {
            BondingCurve(payable(curve)).graduate(deadline);
        }
    }

    function _sendBNB(address recipient, uint256 amount) internal {
        (bool success,) = recipient.call{ value: amount }("");
        if (!success) revert TransferFailed();
    }
}
