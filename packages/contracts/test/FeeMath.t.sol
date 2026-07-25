// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { FeeMath } from "../src/libraries/FeeMath.sol";

contract FeeMathTest {
    function testFiveBNBFillGrossAmount() public pure {
        uint256 requiredNet = 5 ether;
        uint256 gross = FeeMath.grossForExactNet(requiredNet, 50);
        uint256 fee = FeeMath.feeOn(gross, 50);

        assert(gross - fee == requiredNet);
        assert(gross == 5_025_125_628_140_703_518);
    }

    function testFeeRoundsUp() public pure {
        assert(FeeMath.feeOn(1, 50) == 1);
        assert(FeeMath.feeOn(10_000, 50) == 50);
    }
}
