// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXLPRewardsToken } from "./BNBXLPRewardsToken.sol";

/// @notice Factory-owned CREATE2 deployer dedicated to LP Rewards V2.
contract BNBXLPRewardsTokenDeployer {
    address public immutable factory;

    error InvalidFactory();
    error OnlyFactory();

    constructor() {
        if (msg.sender == address(0)) revert InvalidFactory();
        factory = msg.sender;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    function deploy(bytes32 salt, BNBXLPRewardsToken.Init calldata init)
        external
        onlyFactory
        returns (BNBXLPRewardsToken token)
    {
        if (init.launchManager != factory) revert InvalidFactory();
        token = new BNBXLPRewardsToken{ salt: salt }(init);
    }

    function predict(bytes32 salt, BNBXLPRewardsToken.Init calldata init)
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

    function initCodeHash(BNBXLPRewardsToken.Init calldata init)
        public
        view
        onlyFactory
        returns (bytes32)
    {
        if (init.launchManager != factory) revert InvalidFactory();
        return keccak256(
            abi.encodePacked(
                type(BNBXLPRewardsToken).creationCode, abi.encode(init)
            )
        );
    }
}
