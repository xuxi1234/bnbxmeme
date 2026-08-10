import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaimedRefreshTimestamp,
  buildRefreshLeaseFilters,
  canAttemptRefreshLease,
} from "./chain-data-refresh-lease.ts";

test("claims an existing row with both checkpoint fields", () => {
  assert.deepEqual(
    buildRefreshLeaseFilters({
      latestBlock: "123456",
      refreshedAt: "2026-08-10T23:55:00.000Z",
    }),
    {
      latest_block: "eq.123456",
      refreshed_at: "eq.2026-08-10T23:55:00.000Z",
    },
  );
});

test("does not steal a lease whose timestamp is still in the future", () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");
  assert.equal(
    canAttemptRefreshLease("2026-08-11T00:05:59.000Z", now),
    false,
  );
  assert.equal(
    canAttemptRefreshLease("2026-08-10T23:59:59.000Z", now),
    true,
  );
});

test("uses a six minute lease timestamp", () => {
  const now = Date.parse("2026-08-11T00:00:00.000Z");
  assert.equal(
    buildClaimedRefreshTimestamp(now),
    "2026-08-11T00:06:00.000Z",
  );
});
