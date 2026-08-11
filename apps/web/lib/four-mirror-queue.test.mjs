import assert from "node:assert/strict";
import test from "node:test";
import {
  isWalletRejection,
  runSequentialMirrorQueue,
  selectedMirrorFeeBNB,
} from "./four-mirror-queue.ts";

test("runs selected deployments strictly one at a time and preserves their order", async () => {
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  const results = await runSequentialMirrorQueue(["A", "B", "C"], async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    calls.push(`start-${item}`);
    await Promise.resolve();
    calls.push(`end-${item}`);
    active -= 1;
    return `${item}-token`;
  });

  assert.equal(maximumActive, 1);
  assert.deepEqual(calls, ["start-A", "end-A", "start-B", "end-B", "start-C", "end-C"]);
  assert.deepEqual(results, [
    { item: "A", status: "success", value: "A-token" },
    { item: "B", status: "success", value: "B-token" },
    { item: "C", status: "success", value: "C-token" },
  ]);
});

test("continues after a preparation failure but stops after wallet rejection", async () => {
  const results = await runSequentialMirrorQueue(
    ["A", "B", "C", "D"],
    async (item) => {
      if (item === "B") throw new Error("metadata failed");
      if (item === "C") throw new Error("User rejected the request");
      return `${item}-token`;
    },
    { shouldStop: isWalletRejection },
  );

  assert.deepEqual(results.map(({ item, status }) => ({ item, status })), [
    { item: "A", status: "success" },
    { item: "B", status: "failed" },
    { item: "C", status: "cancelled" },
  ]);
});

test("recognizes wallet rejection codes even when provider text is absent", () => {
  assert.equal(isWalletRejection({ code: 4001, message: "Request failed" }), true);
  assert.equal(
    isWalletRejection({ cause: { code: 4001, message: "Request failed" } }),
    true,
  );
  assert.equal(isWalletRejection({ code: -32000, message: "RPC failed" }), false);
});

test("shows the exact Factory fee for the selected token count", () => {
  assert.equal(selectedMirrorFeeBNB(0), "0.000");
  assert.equal(selectedMirrorFeeBNB(15), "0.015");
  assert.throws(() => selectedMirrorFeeBNB(-1), /Invalid selected count/);
});
