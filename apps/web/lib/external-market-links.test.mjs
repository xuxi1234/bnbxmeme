import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalMarketLinks } from "./external-market-links.ts";

const token = "0xf7e01DeaF3F9261383185b2e1388a42259141111";
const pair = "0x196F2e8b9026255fd9ee6fF48C4fA4e86b479029";

test("uses the canonical Pair for graduated DEX market links", () => {
  assert.deepEqual(buildExternalMarketLinks(token, pair), {
    ave: `https://ave.ai/token/${token}-bsc`,
    dexScreener: `https://dexscreener.com/bsc/${pair}`,
    dexTools: `https://www.dextools.io/app/en/bnb/pair-explorer/${pair}`,
  });
});

test("does not publish a DEXTools Pair Explorer link before a Pair exists", () => {
  assert.deepEqual(buildExternalMarketLinks(token), {
    ave: `https://ave.ai/token/${token}-bsc`,
    dexScreener: `https://dexscreener.com/bsc/${token}`,
    dexTools: null,
  });
});
