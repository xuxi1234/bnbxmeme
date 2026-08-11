import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAIN_DATA_CACHE_MAX_AGE_MS,
  CHAIN_DATA_REFRESH_LEASE_MS,
  MAX_CHAIN_DATA_BACKFILL_BLOCKS,
  classifyCacheTimestamp,
  normalizeChainDataMode,
} from "./chain-data-cost-policy.ts";

test("accepts only the canonical refresh and cache-only modes", () => {
  assert.equal(normalizeChainDataMode(null), "refresh");
  assert.equal(normalizeChainDataMode(""), "refresh");
  assert.equal(normalizeChainDataMode("cache"), "cache");
  assert.throws(() => normalizeChainDataMode("refresh"), /Unsupported mode/);
  assert.throws(() => normalizeChainDataMode("full"), /Unsupported mode/);
});

test("caps one historical backfill at twenty thousand blocks", () => {
  assert.equal(MAX_CHAIN_DATA_BACKFILL_BLOCKS, 20_000n);
});

test("keeps the route timeout below the cross-instance lease", () => {
  assert.equal(CHAIN_DATA_REFRESH_LEASE_MS, 360_000);
  assert.equal(CHAIN_DATA_CACHE_MAX_AGE_MS, 60_000);
});

test("distinguishes fresh data, stale data, and an active lease", () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");
  assert.equal(
    classifyCacheTimestamp("2026-08-10T23:59:30.000Z", now),
    "fresh",
  );
  assert.equal(
    classifyCacheTimestamp("2026-08-10T23:55:00.000Z", now),
    "stale",
  );
  assert.equal(
    classifyCacheTimestamp("2026-08-11T00:06:00.000Z", now),
    "leased",
  );
});
