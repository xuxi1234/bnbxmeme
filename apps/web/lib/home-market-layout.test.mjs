import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, tokenMarket, styles] = await Promise.all([
  readFile(new URL("../components/home-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/token-market.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("starts the home market with search and filters on every viewport", () => {
  assert.doesNotMatch(homePage, /PROJECT LIST/);
  assert.doesNotMatch(homePage, /section-heading/);
  assert.doesNotMatch(tokenMarket, /market-overview/);
  assert.doesNotMatch(styles, /\.market-overview/);
  assert.match(tokenMarket, /<div className="market-toolbar">/);
});

test("keeps platform assurance cards off the home page on every viewport", () => {
  assert.doesNotMatch(homePage, /assurance-grid/);
  assert.doesNotMatch(homePage, /一币一合约|交易公开可验|超额自动退款/);
  assert.doesNotMatch(styles, /\.assurance-grid/);
});

test("places the shared home banner above the market on every viewport", () => {
  const bannerPosition = homePage.indexOf("<HomeBanner />");
  const marketPosition = homePage.indexOf('<section className="market-section"');

  assert.notEqual(bannerPosition, -1);
  assert.notEqual(marketPosition, -1);
  assert.ok(bannerPosition < marketPosition);
  assert.equal(homePage.match(/<HomeBanner \/>/g)?.length, 1);
});
