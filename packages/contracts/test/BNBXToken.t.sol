// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { BNBXToken } from "../src/BNBXToken.sol";

contract BNBXTokenTest {
    BNBXToken internal token;

    function setUp() public {
        token = new BNBXToken("Clean Meme", "CLEAN", address(this));
    }

    function testFixedSupplyIsOneBillion() public view {
        assert(token.totalSupply() == 1_000_000_000 ether);
        assert(token.balanceOf(address(this)) == 1_000_000_000 ether);
    }

    function testMetadata() public view {
        assert(keccak256(bytes(token.name())) == keccak256(bytes("Clean Meme")));
        assert(keccak256(bytes(token.symbol())) == keccak256(bytes("CLEAN")));
        assert(token.decimals() == 18);
    }

    function testTransferHasNoTax() public {
        address recipient = address(0xBEEF);
        token.transfer(recipient, 100 ether);

        assert(token.balanceOf(recipient) == 100 ether);
        assert(token.balanceOf(address(this)) == 999_999_900 ether);
    }
}
