# BNBX Bonding Curve Specification

## Model

BNBX uses a virtual-reserve constant-product market:

```text
virtualBNBReserve * virtualTokenReserve = k
```

Virtual reserves are pricing parameters. Only `realBNBPrincipal` and
`realTokenReserve` are transferable assets.

For graduation target `R`:

```text
realTokenReserve          = 800,000,000 tokens
graduationTokenReserve    = 200,000,000 tokens
initialVirtualBNBReserve  = R / 3
initialVirtualTokenReserve ~= 1,066,666,666.666666666 tokens
```

The constants are selected so that selling 800 million curve tokens collects
approximately `R` net BNB and the final curve spot price is continuous with a
PancakeSwap V2 pool seeded using `R BNB / 200,000,000 tokens`.

Solidity must represent the rational parameters in token base units and define
the residual rounding explicitly. It must not use floating-point arithmetic.

## Buy

Given net BNB input `db`, current virtual BNB reserve `x`, virtual token reserve
`y`, and invariant `k = x*y`:

```text
newX = x + db
newY = ceil(k / newX)
tokensOut = y - newY
```

Requirements:

- `tokensOut > 0`
- `tokensOut >= minTokensOut`
- `tokensOut <= realTokenReserve`
- `block.timestamp <= deadline`
- launch state is `Trading`

The division rounds `newY` upward, which rounds `tokensOut` downward and
protects curve solvency.

## Sell

Given token input `dt`:

```text
newY = y + dt
newX = ceil(k / newY)
grossBNBOut = x - newX
sellFee = ceil(grossBNBOut * 50 / 10_000)
netBNBOut = grossBNBOut - sellFee
```

Requirements:

- `dt > 0`
- `netBNBOut >= minBNBOut`
- `grossBNBOut <= realBNBPrincipal`
- `block.timestamp <= deadline`
- launch state is `Trading`

Sold tokens return to `realTokenReserve`. Gross BNB leaves curve principal;
the fee is protocol revenue and the remainder is paid to the seller.

## Final buy and excess refund

The final buy accepts only enough gross BNB for net curve principal to reach
the graduation target. BNB above the required amount is refunded and is not
charged a trading fee.

For remaining required net principal `N`:

```text
requiredGross = ceil(N * 10_000 / 9_950)
```

Because the fee itself rounds upward, the implementation must verify the
resulting net amount and adjust by at most a few wei to avoid crossing the
target. Test vectors must cover all boundary conditions.

## Atomic create and buy

`createVanityTokenAndBuy` deploys a guaranteed `1111` vanity-address token,
initializes its launch, then executes the
creator's first buy in the same transaction. No externally callable trading
state exists between creation and the first buy.

Inputs include:

- token name and symbol;
- integer graduation target from 1 to 18;
- `minTokensOut`;
- `deadline`;
- refund recipient.

If the first buy fills the curve, graduation and PancakeSwap V2 liquidity
creation occur in the same transaction.

## Required invariants

- Total token supply is always exactly one billion.
- At most 800 million tokens can be distributed through the curve.
- Exactly 200 million tokens remain reserved until graduation.
- Protocol fees never become curve principal.
- The curve never pays more BNB than its real principal.
- Graduation can happen at most once.
- No internal trade succeeds after graduation.
- Excess BNB is never charged a fee and is fully refundable.
