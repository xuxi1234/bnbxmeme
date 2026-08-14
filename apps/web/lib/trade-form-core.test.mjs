import assert from "node:assert/strict";
import test from "node:test";
import { initialTradeForm } from "./trade-form-core.ts";

test("starts every trade surface with a 0.1 BNB buy and no sell amount", () => {
  assert.deepEqual(initialTradeForm, {
    buyAmount: "0.1",
    sellAmount: "0",
  });
});
