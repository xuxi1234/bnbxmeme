import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateChartPoints,
  coalesceChartPointsByTimestamp,
  initialChartLogicalRange,
} from "./market-chart-core.ts";

test("aggregates chronological OHLC candles without changing trade order", () => {
  const candles = aggregateChartPoints(
    [
      { timestamp: 310, price: 12, volume: 2 },
      { timestamp: 301, price: 10, volume: 1 },
      { timestamp: 320, price: 9, volume: 3 },
      { timestamp: 601, price: 11, volume: 4 },
    ],
    300,
  );
  assert.deepEqual(candles, [
    {
      timestamp: 300,
      open: 10,
      high: 12,
      low: 9,
      close: 9,
      volume: 6,
    },
    {
      timestamp: 600,
      open: 11,
      high: 11,
      low: 11,
      close: 11,
      volume: 4,
    },
  ]);
});

test("coalesces same-second sparse trades into one valid line point", () => {
  assert.deepEqual(
    coalesceChartPointsByTimestamp([
      { timestamp: 100, price: 10, volume: 1 },
      { timestamp: 100, price: 12, volume: 2 },
      { timestamp: 101, price: 11, volume: 3 },
    ]),
    [
      { timestamp: 100, price: 12, volume: 3 },
      { timestamp: 101, price: 11, volume: 3 },
    ],
  );
});

test("keeps sparse candles narrow and limits dense initial history", () => {
  assert.deepEqual(initialChartLogicalRange(5), { from: -15, to: 8 });
  assert.deepEqual(initialChartLogicalRange(240), { from: 160, to: 243 });
  assert.equal(initialChartLogicalRange(0), null);
});
