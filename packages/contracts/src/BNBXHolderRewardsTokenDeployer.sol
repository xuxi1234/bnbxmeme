// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXHolderRewardsToken } from "./BNBXHolderRewardsToken.sol";

/// @notice Factory-owned CREATE2 deployer for the independent Holder V2 token.
contract BNBXHolderRewardsTokenDeployer {
    address public immutable factory;

    error OnlyFactory();
    error InvalidFactory();

    constructor() {
        if (msg.sender == address(0)) revert InvalidFactory();
        factory = msg.sender;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    function deploy(bytes32 salt, BNBXHolderRewardsToken.Init calldata init)
        external
        onlyFactory
        returns (BNBXHolderRewardsToken token)
    {
        if (init.launchManager != factory) revert InvalidFactory();
        token = new BNBXHolderRewardsToken{ salt: salt }(init);
    }

    function predict(bytes32 salt, BNBXHolderRewardsToken.Init calldata init)
        external
        view
        onlyFactory
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), salt, initCodeHash(init)
                        )
                    )
                )
            )
        );
    }

    function initCodeHash(BNBXHolderRewardsToken.Init calldata init)
        public
        view
        onlyFactory
        returns (bytes32)
    {
        if (init.launchManager != factory) revert InvalidFactory();
        return keccak256(
            abi.encodePacked(
                type(BNBXHolderRewardsToken).creationCode, abi.encode(init)
            )
        );
    }
}
