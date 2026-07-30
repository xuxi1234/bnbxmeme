import assert from "node:assert/strict";
import test from "node:test";
import { formatExactCount } from "./market-format.ts";

test("formats an exact zero count instead of treating it as missing", () => {
  assert.equal(formatExactCount(0), "0");
});

test("formats known exact counts without a truncation suffix", () => {
  assert.equal(formatExactCount(9), "9");
  assert.equal(formatExactCount(12_345), "12345");
});

test("does not invent a count for missing or invalid values", () => {
  assert.equal(formatExactCount(null), "—");
  assert.equal(formatExactCount(undefined), "—");
  assert.equal(formatExactCount(-1), "—");
  assert.equal(formatExactCount(1.5), "—");
});
