# BNBX Token Economics

This document is normative. Contract behavior must not diverge from these
rules without a reviewed specification change.

## Fixed supply

Each launch creates exactly `1,000,000,000 * 10^18` token units.

| Allocation                |      Tokens | Share |
| ------------------------- | ----------: | ----: |
| Internal bonding curve    | 800,000,000 |   80% |
| PancakeSwap V2 graduation | 200,000,000 |   20% |

There is no creator, team, protocol, marketing, or treasury token allocation.
A creator who wants tokens must buy them through the same curve as every other
participant.

## Token properties

Every standard zero-tax token is:

- immutable and non-upgradeable;
- fixed-supply;
- permanently zero-tax;
- free of mint, blacklist, whitelist, pause, max-wallet, max-transaction, and
  balance-manipulation controls;
- free of owner or administrator privileges.

The token implementation should not inherit `Ownable`. Having no privileged
role is safer and easier to verify than temporarily owning the token and later
renouncing ownership.

During the launch creation transaction, the Factory can only configure the
token's unique Pancake pair and immutable per-token curve, then immediately
renounces that setup role. Before graduation, the curve has a single one-way
ability to remove the transfer lock for that Pair. The curve loses that ability
as it unlocks the Pair. This automated role cannot change balances, mint, tax,
pause, relock, or redirect liquidity.

Holder- and LP-reward templates use the same supply and allocation. Their buy
and sell taxes are immutable at creation, disabled until graduation, and each
side is capped at 10%. Burned tokens and both graduation/automatic-liquidity LP
tokens go directly to
`0x000000000000000000000000000000000000dEaD`. Reward tax is converted to the
creator-selected external reward token and distributed through a per-token
pull vault; it is not platform revenue.

## Fees

- Creation fee: `0.001 BNB`
- Internal buy fee: `50 bps` (`0.5%`)
- Internal sell fee: `50 bps` (`0.5%`)
- Basis-point denominator: `10,000`
- Fee recipient: `0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`

Creation fees and trading fees are protocol revenue. They never count as curve
principal, graduation progress, or graduation liquidity.

For a gross buy amount `G`:

```text
buyFee = ceil(G * 50 / 10_000)
netCurveInput = G - buyFee
```

For a gross sell quote `Q`:

```text
sellFee = ceil(Q * 50 / 10_000)
userReceives = Q - sellFee
```

Fees round upward so rounding cannot silently reduce the configured fee.
Quotes and UI estimates must use exactly the same integer implementation as
the contracts.

## Graduation

The creator selects one of 18 graduation targets
from 0.01 through 0.18 BNB in 0.01 BNB steps. The contract stores the selected
step and derives the immutable wei target using `GRADUATION_UNIT`.

Graduation occurs when net curve principal reaches the selected target. Once
graduated:

1. internal buys and sells permanently stop;
2. all 200,000,000 reserved tokens and all net curve BNB principal are added
   to PancakeSwap V2;
3. the LP recipient is the burn address
   `0x000000000000000000000000000000000000dEaD`;
4. the launch can never graduate again or return to internal trading.

Graduation, liquidity creation, and LP burning are one atomic state
transition. A failure in any step reverts the entire transition.
