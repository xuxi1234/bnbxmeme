import assert from "node:assert/strict";
import test from "node:test";
import {
  initialTradeLimit,
  isTradeScrollEnd,
  nextTradeLimit,
  tradeLimitAfterRefresh,
} from "./trade-pagination-core.ts";

test("reveals indexed trades in pages of 20 without exceeding the total", () => {
  assert.equal(initialTradeLimit, 20);
  assert.equal(nextTradeLimit(20, 67), 40);
  assert.equal(nextTradeLimit(60, 67), 67);
  assert.equal(nextTradeLimit(67, 67), 67);
});

test("keeps historical rows mounted when new trades arrive during reading", () => {
  assert.equal(tradeLimitAfterRefresh(40, 55, 58, true), 43);
  assert.equal(tradeLimitAfterRefresh(40, 55, 58, false), 40);
  assert.equal(tradeLimitAfterRefresh(40, 55, 35, true), 35);
});

test("loads the next page only when the activity scroller reaches its end", () => {
  assert.equal(
    isTradeScrollEnd({ scrollTop: 499, clientHeight: 400, scrollHeight: 1000 }),
    false,
  );
  assert.equal(
    isTradeScrollEnd({ scrollTop: 584, clientHeight: 400, scrollHeight: 1000 }),
    true,
  );
});
