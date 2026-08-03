import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [market, styles, language] = await Promise.all([
  readFile(new URL("../components/token-market.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(
    new URL("../components/language-provider.tsx", import.meta.url),
    "utf8",
  ),
]);

test("renders a dense market table from real score fields", () => {
  assert.match(market, /className="token-market-table"[\s\S]*role="table"/);
  assert.match(market, /formatUsdMetric\(marketCap, locale\)/);
  assert.match(market, /formatUsdMetric\(volumeUsd, locale\)/);
  assert.match(market, /score\?\.holderCount/);
  assert.match(market, /score\?\.priceChange24h/);
  assert.doesNotMatch(market, /className="token-card"/);
});

test("paginates without changing market ranking or filters", () => {
  assert.match(market, /const MARKET_PAGE_SIZE = 8/);
  assert.match(market, /ranked\.slice\(/);
  assert.match(market, /setCurrentPage\(1\)/);
  assert.match(
    market,
    /aria-current=\{page === currentPage \? "page" : undefined\}/,
  );
  assert.match(language, /pagination: "项目分页"/);
  assert.match(language, /pagination: "Project pages"/);
});

test("uses desktop rows and purpose-built compact mobile rows", () => {
  assert.match(styles, /\.token-market-header,\s*\.token-market-row \{/);
  assert.match(styles, /grid-template-columns: minmax\(180px, 1\.55fr\)/);
  assert.match(styles, /grid-template-areas:\s*"identity identity price"/);
  assert.match(styles, /\.token-market-change\.positive strong/);
  assert.match(styles, /\.token-market-change\.negative strong/);
});
