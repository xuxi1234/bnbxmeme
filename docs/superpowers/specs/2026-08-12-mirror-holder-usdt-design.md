# Four/Flap Mirror Holder-USDT Design

## Scope

Keep the two hidden production routes unchanged:

- `/four-mirror-deploy`
- `/flap-mirror-deploy`

Every new mirror transaction from either route must use the audited independent Holder Rewards Factory. Existing tokens, public creation pages, discovery sources, session controls, metadata disclosures, sequential wallet confirmation, and hidden/noindex behavior remain unchanged.

## Immutable mirror policy

The browser must not accept user-selected tokenomics for mirror launches. Both tools share one policy:

- Graduation target: exactly `1 BNB`.
- Reward asset: BSC USDT `0x55d398326f99059ff775485246999027b3197955`.
- Buy taxes: liquidity `0 bps`, rewards `300 bps`, burn `0 bps`.
- Sell taxes: liquidity `0 bps`, rewards `300 bps`, burn `0 bps`.
- Minimum eligible holder balance: `1,000,000` launch tokens with 18 decimals.
- Factory creation fee: `0.001 BNB` per token.
- Factory: `holderRewardsFactoryAddress` with `holderRewardsFactoryAbi`.
- Transaction gas ceiling: the reviewed Holder create limit (`12,000,000`).

## Data and transaction flow

Four and Flap discovery normalize every displayed candidate to a `1 BNB` BNBX graduation target. The prepare endpoint revalidates the source and returns the same fixed target. After metadata preparation, the client builds the complete Holder Rewards request, searches the Holder Factory for an unused `1111` vanity salt using the same immutable token initialization fields, then submits one `createVanityToken` transaction. Receipt parsing accepts `TokenCreated` only from the Holder Factory.

Each wallet still signs one gasless session challenge before preparing metadata. Selected projects deploy sequentially and every token requires a separate wallet transaction confirmation. A wallet rejection or uncertain post-broadcast receipt stops the remaining queue.

## Interface

Both hidden pages identify the active template as Holder USDT rewards and display the fixed `1 BNB` graduation target and `3% / 3%` reward taxes. Original source tax metrics remain visible only as source-market information and are not presented as the new BNBX tokenomics.

## Safety and verification

Behavioral tests must prove the exact Factory address, ABI request shape, explicit USDT address, tax basis points, minimum holder balance, fixed graduation target, gas/value, Holder vanity search, Holder receipt filtering, and updated page disclosure. Existing any-wallet authentication, rate limiting, noindex/robots, metadata attribution, and queue-stop tests must remain green. Before release, run the web suite, full workspace tests, lint, typecheck, and production build; then verify both Preview and Production routes without connecting a wallet or sending a transaction.
