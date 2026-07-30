import assert from "node:assert/strict";
import test from "node:test";
import { buildFactorySlots, chunkItems } from "./market-data-core.ts";

test("keeps the homepage bounded to the newest Factory slots", () => {
  assert.deepEqual(
    buildFactorySlots([{ factory: "standard", count: 12n }], 8).map(
      ({ creationIndex }) => creationIndex,
    ),
    [11, 10, 9, 8, 7, 6, 5, 4],
  );
});

test("enumerates every Factory slot for complete creator history", () => {
  assert.deepEqual(
    buildFactorySlots([
      { factory: "standard", count: 3n },
      { factory: "rewards", count: 2n },
    ]),
    [
      { factory: "standard", index: 2n, creationIndex: 2 },
      { factory: "standard", index: 1n, creationIndex: 1 },
      { factory: "standard", index: 0n, creationIndex: 0 },
      { factory: "rewards", index: 1n, creationIndex: 1 },
      { factory: "rewards", index: 0n, creationIndex: 0 },
    ],
  );
});

test("chunks complete history reads without dropping records", () => {
  assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
