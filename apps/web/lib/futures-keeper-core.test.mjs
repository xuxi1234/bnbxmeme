import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import {
  createKeeperState,
  hydrateKeeperState,
  persistKeeperStateAtomic,
  queueFundingCheckpoint,
  queueLiquidationCandidate,
  reconcileKeeperSubmission,
  recordKeeperSubmission,
} from "./futures-keeper-core.ts";

const market = `0x${"11".repeat(20)}`;
const maker = privateKeyToAccount(`0x${"22".repeat(32)}`);
const liquidationTypes = {
  LiquidationOrder: [
    { name: "maker", type: "address" },
    { name: "target", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
};
async function signedReplacement(overrides = {}) {
  const message = {
    maker: maker.address,
    target: `0x${"33".repeat(20)}`,
    side: 0,
    quantity: 10n,
    limitPrice: 2_000n,
    leverage: 3,
    nonce: 9n,
    deadline: 10_000n,
    ...overrides,
  };
  const signature = await maker.signTypedData({
    domain: {
      name: "BNBX Futures",
      version: "1",
      chainId: 97,
      verifyingContract: market,
    },
    types: liquidationTypes,
    primaryType: "LiquidationOrder",
    message,
  });
  return {
    ...message,
    quantity: message.quantity.toString(),
    limitPrice: message.limitPrice.toString(),
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
    signature,
  };
}

test("funding checkpoints are zero-rate, bucketed and duplicate-safe", () => {
  const initial = createKeeperState({ chainId: 97, orderBook: market });
  const queued = queueFundingCheckpoint(initial, {
    expectedRevision: 0,
    observedAt: 3_601,
    intervalSeconds: 3_600,
    rateBps: 0,
  });
  assert.equal(queued.effect.kind, "funding-checkpoint");
  assert.equal(queued.effect.checkpointAt, 3_600);
  assert.equal(queued.effect.rateBps, 0);
  const duplicate = queueFundingCheckpoint(queued.state, {
    expectedRevision: 0,
    observedAt: 3_999,
    intervalSeconds: 3_600,
    rateBps: 0,
  });
  assert.equal(duplicate.duplicate, true);
  assert.throws(
    () =>
      queueFundingCheckpoint(queued.state, {
        expectedRevision: queued.state.revision,
        observedAt: 7_200,
        intervalSeconds: 3_600,
        rateBps: 1,
      }),
    /zero/i,
  );
});

test("liquidation candidates are fresh, idempotent and preserve signed economics", async () => {
  const initial = createKeeperState({ chainId: 97, orderBook: market });
  const replacement = await signedReplacement();
  const candidate = {
    candidateId: "lot-7:oracle-12",
    lotId: "7",
    oracleUpdatedAt: 9_800,
    observedAt: 10_000,
    markPrice: "1900",
    replacement,
    canonicalSnapshotBlockHash: `0x${"55".repeat(32)}`,
    snapshot: {
      blockNumber: 500,
      blockHash: `0x${"55".repeat(32)}`,
      marketState: "Open",
      lot: {
        id: "7",
        longTrader: replacement.target,
        shortTrader: `0x${"66".repeat(20)}`,
        remainingQuantity: "10",
      },
      targetEquity: "2099",
      maintenanceRequirement: "2000",
      closeFee: "100",
      nonceAvailable: true,
      oracleMarkPrice: "1900",
      oracleUpdatedAt: 9_800,
    },
  };
  const queued = await queueLiquidationCandidate(initial, {
    expectedRevision: 0,
    ...candidate,
  });
  assert.deepEqual(queued.effect.replacement, replacement);
  assert.equal(Object.isFrozen(queued.effect.replacement), true);
  const duplicate = await queueLiquidationCandidate(queued.state, {
    expectedRevision: 0,
    ...candidate,
  });
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    () =>
      queueLiquidationCandidate(initial, {
        expectedRevision: 0,
        ...candidate,
        oracleUpdatedAt: 9_699,
      }),
    /stale/i,
  );
  const changedReplacement = await signedReplacement({ limitPrice: 2_001n });
  await assert.rejects(
    () =>
      queueLiquidationCandidate(queued.state, {
        expectedRevision: queued.state.revision,
        ...candidate,
        replacement: changedReplacement,
      }),
    /candidate/i,
  );

  await assert.rejects(
    () =>
      queueLiquidationCandidate(initial, {
        expectedRevision: 0,
        ...candidate,
        replacement: { ...replacement, limitPrice: "2001" },
      }),
    /signature/i,
  );
});

test("keeper submission binds simulation, calldata, canonical event and reorg retry", async () => {
  let state = createKeeperState({ chainId: 97, orderBook: market });
  const queued = queueFundingCheckpoint(state, {
    expectedRevision: 0,
    observedAt: 3_601,
    intervalSeconds: 3_600,
    rateBps: 0,
  });
  const effect = queued.effect;
  const firstHash = `0x${"77".repeat(32)}`;
  const submitted = recordKeeperSubmission(queued.state, {
    expectedRevision: queued.state.revision,
    effectId: effect.id,
    txHash: firstHash,
    submittedAtBlock: 600,
    transactionNonce: 1,
    transactionSender: maker.address,
    canonicalSimulationBlockHash: `0x${"88".repeat(32)}`,
    simulation: {
      success: true,
      chainId: 97,
      to: market,
      input: effect.calldata,
      blockNumber: 600,
      blockHash: `0x${"88".repeat(32)}`,
    },
  });
  assert.equal(submitted.state.effects[effect.id].status, "submitted");
  assert.throws(
    () =>
      recordKeeperSubmission(queued.state, {
        expectedRevision: queued.state.revision,
        effectId: effect.id,
        txHash: firstHash,
        submittedAtBlock: 600,
        transactionNonce: 1,
        transactionSender: maker.address,
        canonicalSimulationBlockHash: `0x${"88".repeat(32)}`,
        simulation: {
          success: true,
          chainId: 56,
          to: market,
          input: effect.calldata,
          blockNumber: 600,
          blockHash: `0x${"88".repeat(32)}`,
        },
      }),
    /simulation/i,
  );
  const reorged = reconcileKeeperSubmission(submitted.state, {
    expectedRevision: submitted.state.revision,
    effectId: effect.id,
    receipt: {
      status: "success",
      transactionHash: firstHash,
      blockNumber: 601,
      blockHash: `0x${"99".repeat(32)}`,
    },
    canonicalBlockHash: `0x${"aa".repeat(32)}`,
    headBlock: 603,
    requiredConfirmations: 3,
  });
  assert.equal(reorged.state.effects[effect.id].status, "prepared");
  assert.equal(reorged.state.effects[effect.id].attempts[0].outcome, "reorged");
  const retryHash = `0x${"bb".repeat(32)}`;
  const retried = recordKeeperSubmission(reorged.state, {
    expectedRevision: reorged.state.revision,
    effectId: effect.id,
    txHash: retryHash,
    submittedAtBlock: 604,
    transactionNonce: 2,
    transactionSender: maker.address,
    canonicalSimulationBlockHash: `0x${"cc".repeat(32)}`,
    simulation: {
      success: true,
      chainId: 97,
      to: market,
      input: effect.calldata,
      blockNumber: 604,
      blockHash: `0x${"cc".repeat(32)}`,
    },
  });
  const confirmed = reconcileKeeperSubmission(retried.state, {
    expectedRevision: retried.state.revision,
    effectId: effect.id,
    receipt: {
      status: "success",
      transactionHash: retryHash,
      blockNumber: 605,
      blockHash: `0x${"dd".repeat(32)}`,
    },
    canonicalBlockHash: `0x${"dd".repeat(32)}`,
    headBlock: 607,
    requiredConfirmations: 3,
    transaction: {
      hash: retryHash,
      chainId: 97,
      to: market,
      input: effect.calldata,
    },
    event: {
      eventName: "FundingCheckpoint",
      address: market,
      cumulativeIndex: "0",
      updatedAt: 3_605n,
    },
  });
  assert.equal(confirmed.state.effects[effect.id].status, "confirmed");
});

test("dropped keeper transactions retry only after the bounded block window", () => {
  const initial = createKeeperState({ chainId: 97, orderBook: market });
  const queued = queueFundingCheckpoint(initial, {
    expectedRevision: 0,
    observedAt: 3_601,
    intervalSeconds: 3_600,
    rateBps: 0,
  });
  const txHash = `0x${"12".repeat(32)}`;
  const submitted = recordKeeperSubmission(queued.state, {
    expectedRevision: queued.state.revision,
    effectId: queued.effect.id,
    txHash,
    submittedAtBlock: 100,
    transactionNonce: 7,
    transactionSender: maker.address,
    canonicalSimulationBlockHash: `0x${"13".repeat(32)}`,
    simulation: {
      success: true,
      chainId: 97,
      to: market,
      input: queued.effect.calldata,
      blockNumber: 100,
      blockHash: `0x${"13".repeat(32)}`,
    },
  });
  const waiting = reconcileKeeperSubmission(submitted.state, {
    expectedRevision: submitted.state.revision,
    effectId: queued.effect.id,
    receipt: null,
    canonicalBlockHash: null,
    headBlock: 119,
    requiredConfirmations: 3,
    transactionPresent: false,
    dropAfterBlocks: 20,
  });
  assert.equal(waiting.duplicate, true);
  const retry = reconcileKeeperSubmission(submitted.state, {
    expectedRevision: submitted.state.revision,
    effectId: queued.effect.id,
    receipt: null,
    canonicalBlockHash: `0x${"14".repeat(32)}`,
    headBlock: 122,
    requiredConfirmations: 3,
    transactionPresent: false,
    dropAfterBlocks: 20,
    nonceConsumption: {
      transactionHash: `0x${"15".repeat(32)}`,
      sender: maker.address,
      nonce: 7,
      blockNumber: 120,
      blockHash: `0x${"14".repeat(32)}`,
    },
  });
  assert.equal(retry.state.effects[queued.effect.id].status, "prepared");
  assert.equal(
    retry.state.effects[queued.effect.id].attempts[0].txHash,
    txHash,
  );
});

test("keeper state hydration and atomic compare-and-swap reject corrupt or stale state", async () => {
  const initial = createKeeperState({ chainId: 97, orderBook: market });
  const queued = queueFundingCheckpoint(initial, {
    expectedRevision: 0,
    observedAt: 3_601,
    intervalSeconds: 3_600,
    rateBps: 0,
  });
  const hydrated = await hydrateKeeperState(JSON.stringify(queued.state), {
    chainId: 97,
    orderBook: market,
  });
  assert.equal(Object.isFrozen(hydrated.effects[queued.effect.id]), true);
  const corrupt = structuredClone(queued.state);
  corrupt.effects[queued.effect.id].chainId = 56;
  await assert.rejects(
    () =>
      hydrateKeeperState(JSON.stringify(corrupt), {
        chainId: 97,
        orderBook: market,
      }),
    /invariant/i,
  );
  let stored;
  const serialized = await persistKeeperStateAtomic(
    {
      async compareAndSwap(revision, value) {
        assert.equal(revision, 0);
        stored = value;
        return true;
      },
    },
    JSON.stringify(initial),
    0,
    queued.state,
  );
  assert.equal(stored, serialized);
  await assert.rejects(
    () =>
      persistKeeperStateAtomic(
        {
          async compareAndSwap() {
            return false;
          },
        },
        JSON.stringify(initial),
        0,
        queued.state,
      ),
    /atomic/i,
  );
});
