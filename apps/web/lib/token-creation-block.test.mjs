import assert from "node:assert/strict";
import test from "node:test";
import { findContractCreationBlock } from "./token-creation-block.ts";

const address = "0x1111111111111111111111111111111111111111";

function clientWithCreationBlock(creationBlock) {
  const calls = [];
  return {
    calls,
    async getCode({ blockNumber }) {
      calls.push(blockNumber);
      return blockNumber >= creationBlock ? "0x6000" : "0x";
    },
  };
}

test("finds the first block containing contract code", async () => {
  const client = clientWithCreationBlock(723n);
  assert.equal(
    await findContractCreationBlock({ client, address, lowerBound: 100n, upperBound: 1_000n }),
    723n,
  );
  assert.ok(client.calls.length <= 12);
});

test("returns the lower bound when code already exists there", async () => {
  const client = clientWithCreationBlock(100n);
  assert.equal(
    await findContractCreationBlock({ client, address, lowerBound: 100n, upperBound: 1_000n }),
    100n,
  );
});

test("returns null when no code exists at the upper bound", async () => {
  const client = clientWithCreationBlock(1_001n);
  assert.equal(
    await findContractCreationBlock({ client, address, lowerBound: 100n, upperBound: 1_000n }),
    null,
  );
});

test("rejects an inverted search range", async () => {
  const client = clientWithCreationBlock(100n);
  await assert.rejects(
    findContractCreationBlock({ client, address, lowerBound: 101n, upperBound: 100n }),
    /lower bound/i,
  );
});
