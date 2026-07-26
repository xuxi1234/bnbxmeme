// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title BNBX launch template validation
/// @notice Shared limits for the future V2 factory and its deployment UI.
library TemplateConfig {
    uint16 internal constant MAX_SIDE_TAX_BPS = 2_500;

    enum Template {
        Standard,
        AutoLiquidity,
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

    error StandardTemplateMustBeTaxFree();
    error SideTaxExceedsMaximum(bool isBuy, uint256 totalBps);

    function validate(Template template, Taxes memory taxes) internal pure {
        uint256 buyTotal = total(taxes.buy);
        uint256 sellTotal = total(taxes.sell);

        if (template == Template.Standard && (buyTotal != 0 || sellTotal != 0)) {
            revert StandardTemplateMustBeTaxFree();
        }
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
