import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeFeaturedMarketScore,
  normalizeFeaturedMarket,
  parseBscScanHolderCount,
  parseGoPlusHolderCount,
} from "./featured-market-data.ts";

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

test("parses comma-formatted and plain BscScan holder metadata", () => {
  assert.equal(
    parseBscScanHolderCount(
      '<meta name="Description" content="Token Rep: Unknown | Holders: 12,019 | As at Aug-10-2026" />',
    ),
    12019,
  );
  assert.equal(
    parseBscScanHolderCount(
      '<meta property="og:description" content="Holders: 57 | Transfers: 9,999" />',
    ),
    57,
  );
});

test("does not invent holder counts from malformed or unrelated explorer data", () => {
  assert.equal(parseBscScanHolderCount("<html>Transfers: 12,019</html>"), undefined);
  assert.equal(parseBscScanHolderCount("<html>Holders: unknown</html>"), undefined);
  assert.equal(parseBscScanHolderCount("<html>Holders: 0</html>"), undefined);
});

test("parses the official GoPlus holder count without accepting invalid values", () => {
  const token = "0xfd87628840890c9ea4eb3a0053a691b29d3e1111";
  assert.equal(
    parseGoPlusHolderCount(
      { code: 1, result: { [token]: { holder_count: "11118" } } },
      token,
    ),
    11118,
  );
  assert.equal(
    parseGoPlusHolderCount(
      { code: 1, result: { [token]: { holder_count: "unknown" } } },
      token,
    ),
    undefined,
  );
  assert.equal(parseGoPlusHolderCount({ code: 2 }, token), undefined);
});

test("normalizes a valid holder count with featured market data", () => {
  const result = normalizeFeaturedMarket(
    {
      pairs: [
        {
          chainId: "bsc",
          dexId: "pancakeswap",
          liquidity: { usd: 2000 },
        },
      ],
    },
    12019,
  );

  assert.equal(result?.holderCount, 12019);
});

test("keeps the last successful holder count across a partial refresh", () => {
  const current = { holderCount: 12019, volume24hUsd: 88 };

  assert.deepEqual(
    mergeFeaturedMarketScore(current, { volume24hUsd: 99 }),
    {
      pricePerMillion: undefined,
      bnbUsd: 1,
      marketCapUsd: undefined,
      volume24hUsd: 99,
      liquidityUsd: undefined,
      priceChange24h: undefined,
      activity: undefined,
      createdAt: undefined,
      holderCount: 12019,
    },
  );
  assert.equal(
    mergeFeaturedMarketScore(current, { holderCount: 12025 }).holderCount,
    12025,
  );
});
