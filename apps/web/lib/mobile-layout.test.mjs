import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [styles, header, tokenPage, discussion, activity] = await Promise.all([
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../components/site-header.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../components/project-discussion.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../components/token-activity.tsx", import.meta.url),
    "utf8",
  ),
]);

test("puts the mobile chart directly after token details and keeps trade inline", () => {
  assert.doesNotMatch(styles, /mobile-trade-dock/);
  assert.doesNotMatch(tokenPage, /mobile-trade-dock/);
  assert.match(styles, /\.market-column > \.curve-chart \{\s*order: 1;/);
  assert.match(styles, /\.trade-sidebar > \.trade-box \{\s*order: 2;/);
  assert.match(styles, /\.market-column > \.activity-terminal \{\s*order: 3;/);
  assert.match(styles, /\.trade-sidebar > \.progress-card \{\s*order: 4;/);
  assert.match(styles, /\.market-column > \.project-discussion \{\s*order: 5;/);
});

test("limits recent trades and gives the mobile list its own vertical scroller", () => {
  assert.match(activity, /const RECENT_TRADE_LIMIT = 20;/);
  assert.match(activity, /allActivity\.slice\(0, RECENT_TRADE_LIMIT\)/);
  assert.match(styles, /\.activity-table \{[\s\S]*max-height: 460px;/);
  assert.match(styles, /\.activity-table \{[\s\S]*overflow-y: auto;/);
  assert.match(styles, /\.activity-table-head \{[\s\S]*position: sticky;/);
});

test("collapses secondary mobile detail and keeps navigation compact", () => {
  assert.match(header, /mobile-menu-heading/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(
    styles,
    /\.tax-template-card \.tax-breakdown \{\s*display: none;\s*\}/,
  );
  assert.match(styles, /\.project-discussion > form,/);
  assert.match(tokenPage, /tokenomicsExpanded/);
  assert.match(tokenPage, /rewardsExpanded/);
  assert.match(discussion, /mobileExpanded/);
  assert.match(styles, /\.token-market-header \{\s*display: none;/);
  assert.match(styles, /grid-template-areas:\s*"identity identity price"/);
  assert.match(styles, /\.market-pagination \{[\s\S]*justify-content: center;/);
  assert.match(styles, /\.market-pagination \{[\s\S]*flex-direction: row;/);
  assert.match(styles, /\.token-market-age,/);
  assert.match(styles, /\.token-market-cap \{\s*display: none;/);
});
