// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FeeMath } from "../src/libraries/FeeMath.sol";

contract FeeMathTest {
    function testFiveBNBFillGrossAmount() public pure {
        uint256 requiredNet = 5 ether;
        uint256 gross = FeeMath.grossForExactNet(requiredNet, 100);
        uint256 fee = FeeMath.feeOn(gross, 100);

        assert(gross - fee == requiredNet);
        assert(gross == 5_050_505_050_505_050_506);
    }

    function testFeeRoundsUp() public pure {
        assert(FeeMath.feeOn(1, 100) == 1);
        assert(FeeMath.feeOn(10_000, 100) == 100);
    }
}
