import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPancakeSwapTradeLinks,
  resolveTradeDestination,
} from "./trade-destination-core.ts";

const token = "0xf7e01DeaF3F9261383185b2e1388a42259141111";

test("routes every Curve lifecycle state to one explicit trade surface", () => {
  assert.equal(resolveTradeDestination(), "loading");
  assert.equal(resolveTradeDestination(0), "curve");
  assert.equal(resolveTradeDestination(1), "migrating");
  assert.equal(resolveTradeDestination(2), "pancake");
  assert.equal(resolveTradeDestination(3), "loading");
});

test("builds direction-specific PancakeSwap links on BNB Chain", () => {
  assert.deepEqual(buildPancakeSwapTradeLinks(token), {
    buy: `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=BNB&outputCurrency=${token}`,
    sell: `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${token}&outputCurrency=BNB`,
  });
});

test("replaces the graduated Curve form and mobile dock with PancakeSwap", async () => {
  const source = await readFile(
    new URL("../app/token/[address]/token-trading-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /tradeDestination === "pancake"/);
  assert.match(source, /pancakeTradeLinks\.buy/);
  assert.match(source, /pancakeTradeLinks\.sell/);
  assert.match(source, /tradeDestination === "migrating"/);
  assert.match(source, /tradeDestination === "curve"/);
});
