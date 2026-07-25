// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library FeeMath {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    function ceilDiv(uint256 value, uint256 divisor) internal pure returns (uint256) {
        if (value == 0) return 0;
        return (value - 1) / divisor + 1;
    }

    function feeOn(uint256 grossAmount, uint256 feeBps) internal pure returns (uint256) {
        return ceilDiv(grossAmount * feeBps, BPS_DENOMINATOR);
    }

    function netFromGross(uint256 grossAmount, uint256 feeBps)
        internal
        pure
        returns (uint256)
    {
        return grossAmount - feeOn(grossAmount, feeBps);
    }

    /// @notice Returns the unique smallest gross amount whose post-fee value
    /// is exactly `requiredNet`.
    function grossForExactNet(uint256 requiredNet, uint256 feeBps)
        internal
        pure
        returns (uint256 grossAmount)
    {
        if (requiredNet == 0) return 0;
        grossAmount = ceilDiv(
            requiredNet * BPS_DENOMINATOR, BPS_DENOMINATOR - feeBps
        );

        while (netFromGross(grossAmount, feeBps) > requiredNet) {
            unchecked {
                --grossAmount;
            }
        }
        while (netFromGross(grossAmount, feeBps) < requiredNet) {
            unchecked {
                ++grossAmount;
            }
        }
    }
}
