// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXTokenV3 } from "./BNBXTokenV3.sol";
import { BondingCurve } from "./BondingCurve.sol";
import { IPancakeV2Factory, IPancakeV2Router } from "./interfaces/IPancakeV2.sol";

/// @title BNBX launch factory
/// @notice Creates immutable zero-tax tokens and routes all internal trades.
contract BNBXFactory {
    address private constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    struct CreateRequest {
        string name;
        string symbol;
        uint8 graduationTargetBNB;
        string metadataURI;
        bytes32 vanitySalt;
    }

    struct BuyRequest {
        uint256 minTokensOut;
        uint256 deadline;
        address refundRecipient;
    }

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
    error InvalidVanitySalt();

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
        if (
            feeRecipient_ == address(0) || feeRecipient_ == DEAD
                || pancakeV2Router_ == address(0) || pancakeV2Router_ == DEAD
                || pancakeV2Router_.code.length == 0
        ) {
            revert InvalidAddress();
        }
        feeRecipient = feeRecipient_;
        pancakeV2Router = pancakeV2Router_;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function createVanityToken(CreateRequest calldata request)
        external
        payable
        nonReentrant
        returns (address tokenAddress, address curveAddress)
    {
        if (msg.value != CREATION_FEE) revert InvalidCreationValue();
        (tokenAddress, curveAddress) = _create(request, msg.sender);
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
        returns (address tokenAddress, address curveAddress, uint256 tokensOut)
    {
        if (msg.value <= CREATION_FEE) revert InvalidCreationValue();
        if (buyRequest.refundRecipient == address(0)) revert InvalidAddress();

        (tokenAddress, curveAddress) = _create(request, msg.sender);
        _sendBNB(feeRecipient, CREATION_FEE);
        emit CreationFeePaid(msg.sender, CREATION_FEE);

        (tokensOut,) = BondingCurve(payable(curveAddress)).buy{
            value: msg.value - CREATION_FEE
        }(
            msg.sender,
            buyRequest.refundRecipient,
            buyRequest.minTokensOut,
            buyRequest.deadline
        );
        _graduateIfReady(curveAddress, buyRequest.deadline);
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

    function _create(CreateRequest memory request, address creator)
        internal
        returns (address tokenAddress, address curveAddress)
    {
        if (bytes(request.metadataURI).length > 256) revert MetadataTooLong();
        BNBXTokenV3 token =
            _deployVanityToken(request.name, request.symbol, request.vanitySalt);
        tokenAddress = address(token);
        address pair;
        (curveAddress, pair) = _deployCurve(
            tokenAddress, creator, request.graduationTargetBNB
        );
        token.configureLaunch(curveAddress, pair);

        curveOf[tokenAddress] = curveAddress;
        tokenMetadataURI[tokenAddress] = request.metadataURI;
        allTokens.push(tokenAddress);

        if (!token.transfer(curveAddress, token.TOTAL_SUPPLY())) revert TransferFailed();

        emit TokenCreated(
            tokenAddress,
            curveAddress,
            creator,
            request.name,
            request.symbol,
            request.graduationTargetBNB,
            request.metadataURI
        );
    }

    function _deployVanityToken(
        string memory name,
        string memory symbol,
        bytes32 vanitySalt
    ) internal returns (BNBXTokenV3 token) {
        address predicted = predictTokenAddress(name, symbol, vanitySalt);
        if (uint16(uint160(predicted)) != 0x1111 || predicted.code.length != 0) {
            revert InvalidVanitySalt();
        }
        token = new BNBXTokenV3{ salt: vanitySalt }(name, symbol, address(this));
    }

    function _deployCurve(
        address tokenAddress,
        address creator,
        uint8 graduationTargetBNB
    ) internal returns (address curveAddress, address pair) {
        IPancakeV2Router router = IPancakeV2Router(pancakeV2Router);
        address wbnb = router.WETH();
        IPancakeV2Factory pancakeFactory = IPancakeV2Factory(router.factory());
        pair = pancakeFactory.getPair(tokenAddress, wbnb);
        if (pair == address(0)) {
            pair = pancakeFactory.createPair(tokenAddress, wbnb);
        }
        curveAddress = address(
            new BondingCurve(
                tokenAddress,
                address(this),
                feeRecipient,
                creator,
                graduationTargetBNB,
                pair,
                wbnb
            )
        );
    }

    /// @notice Searches a bounded salt range without spending gas. Frontends
    /// call this through eth_call before submitting the creation transaction.
    function findVanitySalt(
        string calldata name,
        string calldata symbol,
        uint256 start,
        uint256 maxIterations
    ) external view returns (bool found, bytes32 salt, address predicted) {
        bytes32 initCodeHash = _tokenInitCodeHash(name, symbol);
        for (uint256 i; i < maxIterations; ++i) {
            salt = bytes32(start + i);
            predicted = _create2Address(salt, initCodeHash);
            if (uint16(uint160(predicted)) == 0x1111 && predicted.code.length == 0) {
                return (true, salt, predicted);
            }
        }
    }

    function predictTokenAddress(
        string memory name,
        string memory symbol,
        bytes32 salt
    ) public view returns (address) {
        return _create2Address(salt, _tokenInitCodeHash(name, symbol));
    }

    function _tokenInitCodeHash(string memory name, string memory symbol)
        internal
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                type(BNBXTokenV3).creationCode,
                abi.encode(name, symbol, address(this))
            )
        );
    }

    function _create2Address(bytes32 salt, bytes32 initCodeHash)
        internal
        view
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), salt, initCodeHash
                        )
                    )
                )
            )
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
