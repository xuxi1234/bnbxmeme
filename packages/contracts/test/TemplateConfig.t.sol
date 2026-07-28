// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { TemplateConfig } from "../src/libraries/TemplateConfig.sol";

contract TemplateConfigHarness {
    function validate(
        TemplateConfig.Template template,
        TemplateConfig.Taxes memory taxes
    ) external pure {
        TemplateConfig.validate(template, taxes);
    }
}

contract TemplateConfigTest {
    TemplateConfigHarness internal harness = new TemplateConfigHarness();

    function side(uint16 burn, uint16 liquidity, uint16 marketing, uint16 rewards)
        internal
        pure
        returns (TemplateConfig.SideTaxes memory)
    {
        return TemplateConfig.SideTaxes(burn, liquidity, marketing, rewards);
    }

    function testStandardTemplateAcceptsZeroTax() public view {
        harness.validate(
            TemplateConfig.Template.Standard,
            TemplateConfig.Taxes(side(0, 0, 0, 0), side(0, 0, 0, 0))
        );
    }

    function testStandardTemplateRejectsAnyTax() public {
        (bool success,) = address(harness).call(
            abi.encodeCall(
                harness.validate,
                (
                    TemplateConfig.Template.Standard,
                    TemplateConfig.Taxes(
                        side(1, 0, 0, 0), side(0, 0, 0, 0)
                    )
                )
            )
        );
        assert(!success);
    }

    function testAdvancedTemplateAllowsExactlyTenPercentPerSide()
        public
        view
    {
        harness.validate(
            TemplateConfig.Template.AutoLiquidity,
            TemplateConfig.Taxes(
                side(200, 300, 250, 250), side(100, 300, 300, 300)
            )
        );
    }

    function testRejectsBuyTaxAboveTenPercent() public {
        (bool success,) = address(harness).call(
            abi.encodeCall(
                harness.validate,
                (
                    TemplateConfig.Template.HolderRewards,
                    TemplateConfig.Taxes(
                        side(250, 250, 250, 251), side(0, 0, 0, 0)
                    )
                )
            )
        );
        assert(!success);
    }

    function testRejectsSellTaxAboveTenPercent() public {
        (bool success,) = address(harness).call(
            abi.encodeCall(
                harness.validate,
                (
                    TemplateConfig.Template.LPRewards,
                    TemplateConfig.Taxes(
                        side(0, 0, 0, 0), side(250, 250, 250, 251)
                    )
                )
            )
        );
        assert(!success);
    }
}
