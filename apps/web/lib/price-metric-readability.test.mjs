import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses compact prices and a wider current-price metric without changing the chart", async () => {
  const [tokenPage, tokenMarket, chart, styles] = await Promise.all([
    readFile(
      new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/token-market.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/bonding-curve-chart.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokenPage, /formatCompactTokenPriceUsdt\(/);
  assert.match(tokenMarket, /formatCompactTokenPriceUsdt\(/);
  assert.match(chart, /formatTokenPriceUsdt\(latest\?\.close, locale\)/);
  assert.match(
    styles,
    /grid-template-columns: minmax\(150px, 1\.75fr\) repeat\(6, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /\.token-market-metrics > div:first-child strong \{[^}]*text-overflow: clip/,
  );
});
