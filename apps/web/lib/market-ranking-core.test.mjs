import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateHotRanking,
  compareMarketEntries,
} from "./market-ranking-core.ts";

const factory = "0x1111111111111111111111111111111111111111";

function entry(token, creationIndex, overrides = {}) {
  return {
    token,
    factory,
    creationIndex,
    principal: "0",
    target: "100",
    ...overrides,
  };
}

test("keeps scored Hot cards ahead of unavailable scores without comparator cycles", () => {
  const high = entry("high", 1);
  const unavailable = entry("unavailable", 2);
  const low = entry("low", 3);
  const scores = {
    high: { hotScore: 100 },
    low: { hotScore: 1 },
  };

  assert.deepEqual(
    [high, unavailable, low]
      .sort((left, right) => compareMarketEntries("hot", scores, left, right))
      .map(({ token }) => token),
    ["high", "low", "unavailable"],
  );
});

test("keeps known graduation timestamps ahead of unknown history", () => {
  const older = entry("older", 3);
  const unknown = entry("unknown", 4);
  const newer = entry("newer", 1);
  const scores = {
    older: { graduatedAt: 100 },
    newer: { graduatedAt: 200 },
  };

  assert.deepEqual(
    [older, unknown, newer]
      .sort((left, right) =>
        compareMarketEntries("graduated", scores, left, right),
      )
      .map(({ token }) => token),
    ["newer", "older", "unknown"],
  );
});

test("orders graduating cards by progress and then creation index", () => {
  const first = entry("first", 1, { principal: "80" });
  const newerTie = entry("newer-tie", 3, { principal: "80" });
  const lower = entry("lower", 4, { principal: "75" });

  assert.deepEqual(
    [first, lower, newerTie]
      .sort((left, right) =>
        compareMarketEntries("graduating", {}, left, right),
      )
      .map(({ token }) => token),
    ["newer-tie", "first", "lower"],
  );
});

test("graduated Hot ranking excludes curve history and preserves explicit zeros", () => {
  const ranking = calculateHotRanking({
    trades: [
      {
        bnb: "1000000000000000000",
        timestamp: 999_000,
        account: "0xCurveBuyer",
        source: "curve",
      },
    ],
    market: {
      volume24hBnb: 0,
      buys24h: 0,
      sells24h: 0,
    },
    holderCount: 0,
    graduated: true,
    nowSeconds: 1_000_000,
  });

  assert.deepEqual(ranking, {
    activity: 0,
    hotScore: 0,
    uniqueTraders: 0,
    volume24hBnb: 0,
  });
});

test("internal Hot ranking keeps qualifying curve activity", () => {
  const ranking = calculateHotRanking({
    trades: [
      {
        bnb: "1000000000000000000",
        timestamp: 999_000,
        account: "0xBuyer",
        source: "curve",
      },
    ],
    holderCount: 1,
    graduated: false,
    nowSeconds: 1_000_000,
  });

  assert.equal(ranking.activity, 1);
  assert.equal(ranking.uniqueTraders, 1);
  assert.equal(ranking.volume24hBnb, 1);
  assert.ok(ranking.hotScore > 0);
});
