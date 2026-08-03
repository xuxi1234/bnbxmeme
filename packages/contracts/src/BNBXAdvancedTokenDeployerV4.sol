// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXDividendTokenV4 } from "./BNBXDividendTokenV4.sol";

/// @notice Keeps advanced token creation bytecode outside each launch factory,
/// allowing the factory to remain below the EIP-170 runtime size limit.
contract BNBXAdvancedTokenDeployerV4 {
    address private constant DEAD =
        0x000000000000000000000000000000000000dEaD;
    address public immutable bootstrapOwner;
    address public manager;

    error OnlyBootstrapOwner();
    error OnlyManager();
    error ManagerAlreadyConfigured();
    error InvalidManager();

    constructor(address bootstrapOwner_) {
        if (bootstrapOwner_ == address(0) || bootstrapOwner_ == DEAD) {
            revert InvalidManager();
        }
        bootstrapOwner = bootstrapOwner_;
    }

    function configureManager(address manager_) external {
        if (msg.sender != bootstrapOwner) revert OnlyBootstrapOwner();
        if (manager != address(0)) revert ManagerAlreadyConfigured();
        if (
            manager_ == address(0) || manager_ == DEAD
                || manager_.code.length == 0
        ) revert InvalidManager();
        manager = manager_;
    }

    function deploy(bytes32 salt, BNBXDividendTokenV4.Init calldata init)
        external
        returns (BNBXDividendTokenV4 token)
    {
        if (msg.sender != manager) revert OnlyManager();
        if (init.launchManager != manager) revert InvalidManager();
        token = new BNBXDividendTokenV4{ salt: salt }(init);
    }

    function predict(bytes32 salt, BNBXDividendTokenV4.Init calldata init)
        external
        view
        returns (address)
    {
        if (init.launchManager != manager) revert InvalidManager();
        bytes32 codeHash = initCodeHash(init);
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), salt, codeHash
                        )
                    )
                )
            )
        );
    }

    function initCodeHash(BNBXDividendTokenV4.Init calldata init)
        public
        view
        returns (bytes32)
    {
        if (init.launchManager != manager) revert InvalidManager();
        return keccak256(
            abi.encodePacked(
                type(BNBXDividendTokenV4).creationCode,
                abi.encode(init)
            )
        );
    }
}
