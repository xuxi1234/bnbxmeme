import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [styles, header, tokenPage, discussion] = await Promise.all([
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
]);

test("keeps the mobile trade flow inline and ordered before secondary content", () => {
  assert.doesNotMatch(styles, /mobile-trade-dock/);
  assert.doesNotMatch(tokenPage, /mobile-trade-dock/);
  assert.match(styles, /\.trade-sidebar > \.trade-box \{\s*order: 1;/);
  assert.match(styles, /\.market-column > \.curve-chart \{\s*order: 2;/);
  assert.match(styles, /\.market-column > \.project-discussion \{\s*order: 5;/);
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
