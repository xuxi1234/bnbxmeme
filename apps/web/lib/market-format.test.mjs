import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCompactMetric,
  formatCompactTokenPriceUsdt,
  formatExactCount,
} from "./market-format.ts";

test("keeps tiny token prices readable in compact metric cards", () => {
  assert.equal(formatCompactTokenPriceUsdt(0.0000000016939427), "1.693943e-9");
  assert.equal(formatCompactTokenPriceUsdt(0.000123456), "0.000123456");
  assert.equal(formatCompactTokenPriceUsdt(null), "—");
});

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

test("keeps a known zero metric distinct from an unknown metric", () => {
  assert.equal(formatCompactMetric(0), "0");
  assert.equal(formatCompactMetric(null), "—");
  assert.equal(formatCompactMetric(Number.NaN), "—");
});
