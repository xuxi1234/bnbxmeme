import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateHotRanking,
  compareMarketEntries,
  marketEntryMatchesFilter,
  marketFilters,
  parseMarketFilter,
  summarizeCompleteMarketActivity,
} from "./market-ranking-core.ts";

const factory = "0x1111111111111111111111111111111111111111";

test("publishes exactly the five internal and external market categories", () => {
  assert.deepEqual(marketFilters, [
    "hotInternal",
    "newInternal",
    "graduating",
    "newExternal",
    "hotExternal",
  ]);
});

function entry(token, creationIndex, overrides = {}) {
  return {
    token,
    factory,
    factoryOrder: 0,
    creationIndex,
    principal: "0",
    target: "100",
    state: 0,
    ...overrides,
  };
}

test("orders both Hot markets by 24h volume and keeps unavailable scores last", () => {
  const high = entry("high", 1);
  const unavailable = entry("unavailable", 2);
  const low = entry("low", 3);
  const scores = {
    high: { volume24hBnb: 100, hotScore: 1 },
    low: { volume24hBnb: 1, hotScore: 100 },
  };

  for (const filter of ["hotInternal", "hotExternal"]) {
    assert.deepEqual(
      [high, unavailable, low]
        .sort((left, right) =>
          compareMarketEntries(filter, scores, left, right),
        )
        .map(({ token }) => token),
      ["high", "low", "unavailable"],
    );
  }
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
        compareMarketEntries("newExternal", scores, left, right),
      )
      .map(({ token }) => token),
    ["newer", "older", "unknown"],
  );
});

test("orders new internal cards by deployment time with an onchain-order fallback", () => {
  const newestFactory = entry("newest-factory", 0, { factoryOrder: 0 });
  const olderFactory = entry("older-factory", 99, { factoryOrder: 1 });
  const latestSameFactory = entry("latest-same-factory", 2, {
    factoryOrder: 0,
  });

  const scores = {
    "newest-factory": { createdAt: 300 },
    "older-factory": { createdAt: 200 },
    "latest-same-factory": { createdAt: 100 },
  };

  assert.deepEqual(
    [olderFactory, newestFactory, latestSameFactory]
      .sort((left, right) =>
        compareMarketEntries("newInternal", scores, left, right),
      )
      .map(({ token }) => token),
    ["newest-factory", "older-factory", "latest-same-factory"],
  );
  assert.deepEqual(
    [olderFactory, newestFactory, latestSameFactory]
      .sort((left, right) =>
        compareMarketEntries("newInternal", {}, left, right),
      )
      .map(({ token }) => token),
    ["latest-same-factory", "newest-factory", "older-factory"],
  );
});

test("keeps a newly indexed token visible when its metadata timestamp is unavailable", () => {
  const olderKnown = entry("older-known", 10, { factoryOrder: 0 });
  const newestUnknown = entry("newest-unknown", 24, { factoryOrder: 1 });

  assert.deepEqual(
    [olderKnown, newestUnknown]
      .sort((left, right) =>
        compareMarketEntries(
          "newInternal",
          { "older-known": { createdAt: 100 } },
          left,
          right,
        ),
      )
      .map(({ token }) => token),
    ["newest-unknown", "older-known"],
  );
});

test("keeps internal and external lifecycle categories strictly separated", () => {
  const internal = entry("internal", 1, { state: 0, principal: "90" });
  const migrating = entry("migrating", 2, { state: 1, principal: "80" });
  const external = entry("external", 3, { state: 2, principal: "100" });
  const unknown = entry("unknown", 4, { state: null });

  for (const filter of ["hotInternal", "newInternal"]) {
    assert.equal(marketEntryMatchesFilter(filter, internal), true);
    assert.equal(marketEntryMatchesFilter(filter, migrating), true);
    assert.equal(marketEntryMatchesFilter(filter, external), false);
    assert.equal(marketEntryMatchesFilter(filter, unknown), false);
  }
  assert.equal(marketEntryMatchesFilter("graduating", internal), true);
  assert.equal(marketEntryMatchesFilter("graduating", external), false);
  for (const filter of ["newExternal", "hotExternal"]) {
    assert.equal(marketEntryMatchesFilter(filter, internal), false);
    assert.equal(marketEntryMatchesFilter(filter, external), true);
    assert.equal(marketEntryMatchesFilter(filter, unknown), false);
  }
});

test("includes every ungraduated internal project in progress ranking", () => {
  assert.equal(
    marketEntryMatchesFilter(
      "graduating",
      entry("high-progress", 1, { principal: "75", target: "100" }),
    ),
    true,
  );
  assert.equal(
    marketEntryMatchesFilter(
      "graduating",
      entry("low-progress", 1, { principal: "1", target: "100" }),
    ),
    true,
  );
});

test("maps legacy market links to the five current categories", () => {
  assert.equal(parseMarketFilter("hot"), "hotInternal");
  assert.equal(parseMarketFilter("latest"), "newInternal");
  assert.equal(parseMarketFilter("graduated"), "newExternal");
  assert.equal(parseMarketFilter("hotExternal"), "hotExternal");
  assert.equal(parseMarketFilter("unknown"), null);
});

test("orders graduating cards by progress and then creation index", () => {
  const first = entry("first", 1, { principal: "80" });
  const newerTie = entry("newer-tie", 3, { principal: "80" });
  const lower = entry("lower", 4, { principal: "75" });
  const empty = entry("empty", 5, { principal: "0" });

  assert.deepEqual(
    [first, empty, lower, newerTie]
      .sort((left, right) =>
        compareMarketEntries("graduating", {}, left, right),
      )
      .map(({ token }) => token),
    ["newer-tie", "first", "lower", "empty"],
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

test("does not count infrastructure or unknown accounts as unique traders", () => {
  const router = "0x6666666666666666666666666666666666666666";
  const ranking = calculateHotRanking({
    trades: [
      {
        bnb: "1000000000000000000",
        timestamp: 999_000,
        account: "0x0000000000000000000000000000000000000000",
        source: "pancake",
      },
      {
        bnb: "1000000000000000000",
        timestamp: 999_000,
        account: router,
        source: "pancake",
      },
      {
        bnb: "1000000000000000000",
        timestamp: 999_000,
        account: "0xRealTrader",
        source: "pancake",
      },
    ],
    holderCount: 1,
    graduated: true,
    nowSeconds: 1_000_000,
    excludedAccounts: ["0x0000000000000000000000000000000000000000", router],
  });

  assert.equal(ranking.uniqueTraders, 1);
  assert.equal(ranking.activity, 3);
});

test("only summarizes market activity when every listed token is complete", () => {
  assert.deepEqual(
    summarizeCompleteMarketActivity(["alpha", "beta"], {
      alpha: { volume24hBnb: 1.5, activity: 2 },
      beta: { volume24hBnb: 0, activity: 0 },
    }),
    { volume24hBnb: 1.5, trades24h: 2 },
  );

  assert.equal(
    summarizeCompleteMarketActivity(["alpha", "beta"], {
      alpha: { volume24hBnb: 1.5, activity: 2 },
      beta: {},
    }),
    null,
  );
});

test("rejects malformed values instead of publishing misleading totals", () => {
  assert.equal(
    summarizeCompleteMarketActivity(["alpha"], {
      alpha: { volume24hBnb: Number.NaN, activity: 2 },
    }),
    null,
  );
  assert.equal(
    summarizeCompleteMarketActivity(["alpha"], {
      alpha: { volume24hBnb: 1, activity: -1 },
    }),
    null,
  );
});
