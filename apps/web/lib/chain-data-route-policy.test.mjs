import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(
  new URL("../app/api/chain-data/route.ts", import.meta.url),
  "utf8",
);

test("cold backfills resolve and persist the exact token creation boundary", () => {
  assert.match(routeSource, /findContractCreationBlock/);
  assert.match(routeSource, /scanStartBlock:\s*scanStartBlock\.toString\(\)/);
  assert.match(routeSource, /resolveEffectiveScanCheckpoint/);
});

test("backfill responses never invite aggressive RPC polling", () => {
  const retryValues = [...routeSource.matchAll(/"Retry-After":\s*"(\d+)"/g)].map(
    (match) => Number(match[1]),
  );
  assert.ok(retryValues.length > 0);
  assert.ok(retryValues.every((value) => value >= 60));
});

test("partial backfills return their indexed trades instead of looking broken", () => {
  assert.match(
    routeSource,
    /function backfillResponse\([\s\S]*publicPayload\(payload, chainHead\)/,
  );
});
