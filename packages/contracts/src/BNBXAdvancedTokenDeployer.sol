// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXAutoLiquidityToken } from "./BNBXAutoLiquidityToken.sol";
import { TemplateConfig } from "./libraries/TemplateConfig.sol";

/// @notice Keeps advanced token creation bytecode outside each launch factory,
/// allowing the factory to remain below the EIP-170 runtime size limit.
contract BNBXAdvancedTokenDeployer {
    address public immutable bootstrapOwner;
    address public manager;

    error OnlyBootstrapOwner();
    error OnlyManager();
    error ManagerAlreadyConfigured();
    error InvalidManager();

    constructor(address bootstrapOwner_) {
        if (bootstrapOwner_ == address(0)) revert InvalidManager();
        bootstrapOwner = bootstrapOwner_;
    }

    function configureManager(address manager_) external {
        if (msg.sender != bootstrapOwner) revert OnlyBootstrapOwner();
        if (manager != address(0)) revert ManagerAlreadyConfigured();
        if (manager_ == address(0)) revert InvalidManager();
        manager = manager_;
    }

    function deploy(
        string calldata name,
        string calldata symbol,
        bytes32 salt,
        address router,
        address marketingWallet,
        TemplateConfig.Taxes calldata taxes,
        TemplateConfig.Template template,
        uint256 minimumRewardShare
    ) external returns (BNBXAutoLiquidityToken token) {
        if (msg.sender != manager) revert OnlyManager();
        token = new BNBXAutoLiquidityToken{ salt: salt }(
            name,
            symbol,
            manager,
            router,
            marketingWallet,
            taxes,
            template,
            minimumRewardShare
        );
    }

    function predict(
        string calldata name,
        string calldata symbol,
        bytes32 salt,
        address router,
        address marketingWallet,
        TemplateConfig.Taxes calldata taxes,
        TemplateConfig.Template template,
        uint256 minimumRewardShare
    ) external view returns (address) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(BNBXAutoLiquidityToken).creationCode,
                abi.encode(
                    name,
                    symbol,
                    manager,
                    router,
                    marketingWallet,
                    taxes,
                    template,
                    minimumRewardShare
                )
            )
        );
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
}
