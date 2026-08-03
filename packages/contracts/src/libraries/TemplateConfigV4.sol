// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title BNBX V4 immutable tax configuration
/// @notice Every component may be zero. Buy and sell totals are capped
/// independently at 10%, including when a factory is called directly.
library TemplateConfigV4 {
    uint16 internal constant MAX_SIDE_TAX_BPS = 1_000;

    enum Template {
        HolderRewards,
        LPRewards
    }

    struct SideTaxes {
        uint16 burn;
        uint16 liquidity;
        uint16 marketing;
        uint16 rewards;
    }

    struct Taxes {
        SideTaxes buy;
        SideTaxes sell;
    }

    error SideTaxExceedsMaximum(bool isBuy, uint256 totalBps);

    function validate(Taxes memory taxes) internal pure {
        uint256 buyTotal = total(taxes.buy);
        uint256 sellTotal = total(taxes.sell);
        if (buyTotal > MAX_SIDE_TAX_BPS) {
            revert SideTaxExceedsMaximum(true, buyTotal);
        }
        if (sellTotal > MAX_SIDE_TAX_BPS) {
            revert SideTaxExceedsMaximum(false, sellTotal);
        }
    }

    function total(SideTaxes memory side) internal pure returns (uint256) {
        return uint256(side.burn) + side.liquidity + side.marketing + side.rewards;
    }
}
