import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFeaturedMarket } from "./featured-market-data.ts";

test("selects the most liquid BSC PancakeSwap pair and normalizes its metrics", () => {
  const result = normalizeFeaturedMarket({
    pairs: [
      { chainId: "ethereum", dexId: "uniswap", liquidity: { usd: 999999 } },
      {
        chainId: "bsc",
        dexId: "pancakeswap",
        priceUsd: "0.0000123",
        fdv: 12300,
        volume: { h24: 4500 },
        liquidity: { usd: 2000 },
        priceChange: { h24: 6.5 },
        txns: { h24: { buys: 12, sells: 8 } },
        pairCreatedAt: 1720000000000,
        url: "https://dexscreener.com/bsc/pair",
      },
      { chainId: "bsc", dexId: "pancakeswap", liquidity: { usd: 1000 } },
    ],
  });

  assert.deepEqual(result, {
    priceUsd: 0.0000123,
    marketCapUsd: 12300,
    volume24hUsd: 4500,
    liquidityUsd: 2000,
    priceChange24h: 6.5,
    trades24h: 20,
    createdAt: 1720000000000,
    marketUrl: "https://dexscreener.com/bsc/pair",
  });
});

test("returns null when no BSC PancakeSwap pair exists", () => {
  assert.equal(normalizeFeaturedMarket({ pairs: [] }), null);
  assert.equal(
    normalizeFeaturedMarket({ pairs: [{ chainId: "bsc", dexId: "other" }] }),
    null,
  );
});
