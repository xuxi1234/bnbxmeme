import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFactorySlots,
  buildMarketScoreRefreshKey,
  chunkItems,
} from "./market-data-core.ts";

test("keeps the homepage bounded to the newest Factory slots", () => {
  assert.deepEqual(
    buildFactorySlots([{ factory: "standard", count: 12n }], 8).map(
      ({ creationIndex }) => creationIndex,
    ),
    [11, 10, 9, 8, 7, 6, 5, 4],
  );
});

test("enumerates every Factory slot for complete creator history", () => {
  assert.deepEqual(
    buildFactorySlots([
      { factory: "standard", count: 3n },
      { factory: "rewards", count: 2n },
    ]),
    [
      { factory: "standard", factoryOrder: 0, index: 2n, creationIndex: 2 },
      { factory: "standard", factoryOrder: 0, index: 1n, creationIndex: 1 },
      { factory: "standard", factoryOrder: 0, index: 0n, creationIndex: 0 },
      { factory: "rewards", factoryOrder: 1, index: 1n, creationIndex: 1 },
      { factory: "rewards", factoryOrder: 1, index: 0n, creationIndex: 0 },
    ],
  );
});

test("chunks complete history reads without dropping records", () => {
  assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("keeps the market score refresh key stable for non-score updates", () => {
  const target = {
    token: "0xAa",
    curve: "0xBb",
    state: 1,
    liquidityPair: "0xCc",
  };
  assert.equal(
    buildMarketScoreRefreshKey([target]),
    buildMarketScoreRefreshKey([{ ...target, liquidityPair: "0xDd" }]),
  );
});

test("refreshes market scores when their request identity changes", () => {
  const target = {
    token: "0xAa",
    curve: "0xBb",
    state: 1,
    liquidityPair: "0xCc",
  };
  const initial = buildMarketScoreRefreshKey([target]);
  assert.notEqual(
    initial,
    buildMarketScoreRefreshKey([{ ...target, curve: "0xBc" }]),
  );
  assert.notEqual(
    initial,
    buildMarketScoreRefreshKey([
      { ...target, state: 2, liquidityPair: "0xDd" },
    ]),
  );
});
