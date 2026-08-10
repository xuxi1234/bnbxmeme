# Featured BNBX Holder Count Design

## Goal

Show the real BscScan holder count for the official BNBX row pinned to both the new-external and hot-external markets, replacing the current unavailable dash.

## Data flow

The existing `/api/featured-market` route will continue to fetch price and liquidity data from DexScreener. In the same server-side request it will fetch the public BscScan token page for `0xfd87628840890c9ea4eb3a0053a691b29d3e1111`, parse the holder count from the page metadata, and add `holderCount` to the normalized response.

The BscScan request will use Next.js revalidation and CDN cache headers so the homepage does not scan Transfer logs or call BscScan for every visitor. The BscScan count is the displayed explorer count; it must not be replaced with trade count, transfer count, or LP count.

## Failure behavior

Malformed or unavailable BscScan responses produce no new holder value. The browser preserves its most recent successful `holderCount` instead of replacing it with a dash during a transient refresh failure. If no successful value has ever loaded, the existing dash remains truthful.

## Scope

- Add only the official BNBX holder metric.
- Do not modify normal platform-token holder indexing or ranking.
- Do not modify market ordering, card layout, contracts, factories, databases, or chain state.
- Keep the official BNBX row pinned first in both external-market tabs.

## Verification

- Unit-test comma-formatted and plain holder counts from realistic BscScan metadata.
- Unit-test malformed and unrelated pages returning no count.
- Unit-test market normalization carrying a valid holder count.
- Run the complete web test suite, lint, TypeScript, and production build.
- Publish only a Vercel Preview for user review; do not merge to `main` in this change.
