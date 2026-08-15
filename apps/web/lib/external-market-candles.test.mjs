import assert from "node:assert/strict";
import test from "node:test";
import {
  geckoOhlcvRequest,
  parseGeckoOhlcv,
} from "./external-market-candles.ts";

const pair = "0x3333333333333333333333333333333333333333";
const token = "0x2222222222222222222222222222222222222222";

test("maps supported chart periods to GeckoTerminal aggregates", () => {
  assert.deepEqual(geckoOhlcvRequest({ pair, token, period: 300 }), {
    timeframe: "minute",
    aggregate: "5",
  });
  assert.deepEqual(geckoOhlcvRequest({ pair, token, period: 14_400 }), {
    timeframe: "hour",
    aggregate: "4",
  });
  assert.deepEqual(geckoOhlcvRequest({ pair, token, period: 86_400 }), {
    timeframe: "day",
    aggregate: "1",
  });
});

test("rejects unsupported periods", () => {
  assert.throws(() => geckoOhlcvRequest({ pair, token, period: 120 }), /period/i);
});

test("normalizes newest-first GeckoTerminal candles chronologically", () => {
  assert.deepEqual(
    parseGeckoOhlcv({
      data: {
        attributes: {
          ohlcv_list: [
            [200, 2, 4, 1, 3, 20],
            [100, 1, 3, 0.5, 2, 10],
          ],
        },
      },
    }),
    [
      { timestamp: 100, open: 1, high: 3, low: 0.5, close: 2, volume: 10 },
      { timestamp: 200, open: 2, high: 4, low: 1, close: 3, volume: 20 },
    ],
  );
});

test("drops malformed candles instead of poisoning the chart", () => {
  assert.deepEqual(
    parseGeckoOhlcv({ data: { attributes: { ohlcv_list: [[100, 1, null]] } } }),
    [],
  );
});
