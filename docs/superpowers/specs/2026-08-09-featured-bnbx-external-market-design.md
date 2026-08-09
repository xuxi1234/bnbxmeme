# Featured BNBX External Market Design

## Scope

Show the official BNBX token `0xfd87628840890c9ea4eb3a0053a691b29d3e1111` as the first row of both `newExternal` and `hotExternal` on the homepage market table. Do not alter the ordering or membership of any Factory-created project.

## Presentation

The row reuses the existing market-table layout, uses `/bnbx-logo.png`, and adds a compact localized official badge. Available price, market-cap, volume, liquidity, 24-hour trades, price change, and pair creation time come from the highest-liquidity PancakeSwap BSC pair returned by DexScreener. Unavailable fields render as the existing `—` state.

## Interaction

The official row opens PancakeSwap for the BNBX contract in a new tab. It does not route to the protected BNBX Factory-project detail page. The row appears only in the two external-market filters and only when the active search matches BNBX by name, symbol, or contract address.

## Safety and release

The change is frontend/server-read-only: no contract, Factory, database, wallet, or transaction logic changes. It is deployed to a non-production branch and Vercel Preview only until the owner explicitly approves production release.
