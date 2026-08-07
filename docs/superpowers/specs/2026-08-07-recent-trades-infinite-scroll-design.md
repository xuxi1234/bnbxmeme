# Recent Trades Infinite Scroll Design

## Goal

Keep the recent-trades panel at a fixed height while allowing users to browse every indexed trade in batches of 20 inside the panel.

## Design

- Keep the chain-data API unchanged; it already returns the indexed trade history.
- Store the full sorted trade list in `TokenActivity` and render the first 20 rows initially.
- When the trade scroller reaches its bottom, increase the visible count by 20 until all loaded rows are visible.
- Keep the existing sticky table header and independent desktop/mobile vertical scrolling.
- When polling prepends new trades, preserve the reader's viewport if they are away from the top. Users at the top continue to see newest trades first.
- Reset pagination when the token/curve/pair identity changes.

## Scope

No contract, Factory, RPC scan, database, trading, or chain-data API changes.

## Verification

- Unit-test 20-row paging, bottom detection, and pagination reset/clamping.
- Run the focused activity tests, TypeScript checks, lint, and the production web build.
