// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library FuturesTypes {
    enum Side {
        Long,
        Short
    }

    enum MarketState {
        CloseOnly,
        Open
    }

    enum OrderRole {
        Maker,
        Taker
    }

    struct Order {
        address trader;
        Side side;
        uint128 quantity;
        uint128 limitPrice;
        uint8 leverage;
        uint64 nonce;
        uint64 deadline;
        bool reduceOnly;
        OrderRole role;
    }

    struct LiquidationOrder {
        address maker;
        address target;
        Side side;
        uint128 quantity;
        uint128 limitPrice;
        uint8 leverage;
        uint64 nonce;
        uint64 deadline;
    }

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 internal constant ORDER_TYPEHASH = keccak256(
        "Order(address trader,uint8 side,uint128 quantity,uint128 limitPrice,uint8 leverage,uint64 nonce,uint64 deadline,bool reduceOnly,uint8 role)"
    );

    bytes32 internal constant LIQUIDATION_ORDER_TYPEHASH = keccak256(
        "LiquidationOrder(address maker,address target,uint8 side,uint128 quantity,uint128 limitPrice,uint8 leverage,uint64 nonce,uint64 deadline)"
    );

    function hashOrder(Order memory order) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.trader,
                order.side,
                order.quantity,
                order.limitPrice,
                order.leverage,
                order.nonce,
                order.deadline,
                order.reduceOnly,
                order.role
            )
        );
    }

    function hashLiquidationOrder(LiquidationOrder memory order)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                LIQUIDATION_ORDER_TYPEHASH,
                order.maker,
                order.target,
                order.side,
                order.quantity,
                order.limitPrice,
                order.leverage,
                order.nonce,
                order.deadline
            )
        );
    }
}
