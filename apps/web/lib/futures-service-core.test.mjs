import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import {
  cancelOrder,
  commitMatchingState,
  createMatchingState,
  hydrateMatchingState,
  intakeOrder,
  persistMatchingStateAtomic,
  reconcileSubmission,
  recordSubmission,
  serializeMatchingState,
  validateOrderEnvelope,
} from "./futures-service-core.ts";

const makerA = privateKeyToAccount(`0x${"11".repeat(32)}`);
const makerB = privateKeyToAccount(`0x${"22".repeat(32)}`);
const taker = privateKeyToAccount(`0x${"33".repeat(32)}`);
const verifyingContract = `0x${"44".repeat(20)}`;
const config = {
  chainId: 97,
  verifyingContract,
  domainName: "BNBX Futures",
  domainVersion: "1",
};
const types = {
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
    { name: "reduceOnly", type: "bool" },
    { name: "role", type: "uint8" },
  ],
};

async function envelope(account, overrides = {}) {
  const order = {
    trader: account.address,
    side: 1,
    quantity: 10n,
    limitPrice: 2_000n,
    leverage: 3,
    nonce: 1n,
    deadline: 10_000n,
    reduceOnly: false,
    role: 0,
    ...overrides,
  };
  const domain = {
    name: config.domainName,
    version: config.domainVersion,
    chainId: config.chainId,
    verifyingContract: config.verifyingContract,
  };
  return {
    domain,
    order,
    signature: await account.signTypedData({
      domain,
      types,
      primaryType: "Order",
      message: order,
    }),
  };
}

test("validates exact signed economics, domain, deadline and leverage", async () => {
  const signed = await envelope(makerA);
  const validated = await validateOrderEnvelope(signed, config, 9_999n);
  assert.equal(validated.orderId.startsWith("0x"), true);
  assert.equal(validated.order.limitPrice, "2000");

  await assert.rejects(
    () =>
      validateOrderEnvelope(
        { ...signed, order: { ...signed.order, limitPrice: 2_001n } },
        config,
        9_999n,
      ),
    /signature/i,
  );
  await assert.rejects(
    () =>
      validateOrderEnvelope(
        { ...signed, domain: { ...signed.domain, chainId: 56 } },
        config,
        9_999n,
      ),
    /domain/i,
  );
  await assert.rejects(
    () => validateOrderEnvelope(signed, config, 10_001n),
    /expired/i,
  );
  const overLeveraged = await envelope(makerA, { leverage: 4 });
  await assert.rejects(
    () => validateOrderEnvelope(overLeveraged, config, 9_999n),
    /leverage/i,
  );
});

test("intake is idempotent and rejects stale concurrent revisions", async () => {
  const signed = await envelope(makerA);
  const initial = createMatchingState(config);
  const accepted = await intakeOrder(initial, {
    expectedRevision: 0,
    idempotencyKey: "request-a",
    receivedAt: 100,
    now: 9_000n,
    envelope: signed,
  });
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.state.revision, 1);

  const duplicate = await intakeOrder(accepted.state, {
    expectedRevision: 0,
    idempotencyKey: "request-a",
    receivedAt: 999,
    now: 9_001n,
    envelope: signed,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state, accepted.state);

  const conflicting = await envelope(makerA, { nonce: 2n });
  const sameOrderNewKey = await intakeOrder(accepted.state, {
    expectedRevision: accepted.state.revision,
    idempotencyKey: "request-same-order",
    receivedAt: 1,
    now: 9_001n,
    envelope: signed,
  });
  assert.equal(sameOrderNewKey.duplicate, true);
  assert.equal(sameOrderNewKey.state.revision, 2);
  await assert.rejects(
    () =>
      intakeOrder(sameOrderNewKey.state, {
        expectedRevision: sameOrderNewKey.state.revision,
        idempotencyKey: "request-same-order",
        receivedAt: 2,
        now: 9_001n,
        envelope: conflicting,
      }),
    /idempotency/i,
  );
  await assert.rejects(
    () =>
      intakeOrder(accepted.state, {
        expectedRevision: 1,
        idempotencyKey: "request-a",
        receivedAt: 101,
        now: 9_001n,
        envelope: conflicting,
      }),
    /idempotency/i,
  );
  const concurrent = await envelope(makerB, { nonce: 2n });
  await assert.rejects(
    () =>
      intakeOrder(accepted.state, {
        expectedRevision: 0,
        idempotencyKey: "request-b",
        receivedAt: 101,
        now: 9_001n,
        envelope: concurrent,
      }),
    /revision/i,
  );
});

test("matches by price then time and persists partial reservations", async () => {
  let state = createMatchingState(config);
  const orders = [
    [
      makerA,
      { nonce: 1n, side: 1, role: 0, quantity: 7n, limitPrice: 1_990n },
      100,
      "m-old",
    ],
    [
      makerB,
      { nonce: 2n, side: 1, role: 0, quantity: 5n, limitPrice: 1_980n },
      200,
      "m-best",
    ],
    [
      makerB,
      { nonce: 3n, side: 1, role: 0, quantity: 8n, limitPrice: 1_990n },
      1,
      "m-late",
    ],
  ];
  for (const [account, overrides, receivedAt, key] of orders) {
    const result = await intakeOrder(state, {
      expectedRevision: state.revision,
      idempotencyKey: key,
      receivedAt,
      now: 9_000n,
      envelope: await envelope(account, overrides),
    });
    state = result.state;
  }
  const result = await intakeOrder(state, {
    expectedRevision: state.revision,
    idempotencyKey: "taker",
    receivedAt: 400,
    now: 9_000n,
    envelope: await envelope(taker, {
      nonce: 9n,
      side: 0,
      role: 1,
      quantity: 12n,
      limitPrice: 2_000n,
    }),
  });
  assert.deepEqual(
    result.effects.map(({ price, quantity, makerOrderId }) => ({
      price,
      quantity,
      makerOrderId,
    })),
    [
      {
        price: "1980",
        quantity: "5",
        makerOrderId: result.effects[0].makerOrderId,
      },
      {
        price: "1990",
        quantity: "7",
        makerOrderId: result.effects[1].makerOrderId,
      },
    ],
  );
  assert.equal(
    result.state.orders[result.effects[0].makerOrderId].reserved,
    "5",
  );
  assert.equal(
    result.state.orders[result.effects[1].makerOrderId].reserved,
    "7",
  );
  assert.equal(result.state.orders[result.acceptedOrderId].reserved, "12");
});

test("never matches a maker that became stale after intake", async () => {
  const maker = await intakeOrder(createMatchingState(config), {
    expectedRevision: 0,
    idempotencyKey: "maker",
    receivedAt: 1,
    now: 9_000n,
    envelope: await envelope(makerA, {
      side: 1,
      role: 0,
      deadline: 9_001n,
    }),
  });
  const result = await intakeOrder(maker.state, {
    expectedRevision: maker.state.revision,
    idempotencyKey: "later-taker",
    receivedAt: 2,
    now: 9_002n,
    envelope: await envelope(taker, {
      side: 0,
      role: 1,
      nonce: 2n,
    }),
  });
  assert.deepEqual(result.effects, []);
  assert.equal(result.state.orders[maker.acceptedOrderId].reserved, "0");
});

test("a later maker serves takers by price then durable sequence", async () => {
  let state = createMatchingState(config);
  const older = await intakeOrder(state, {
    expectedRevision: 0,
    idempotencyKey: "older-taker",
    receivedAt: 999,
    now: 9_000n,
    envelope: await envelope(taker, {
      side: 0,
      role: 1,
      quantity: 5n,
      nonce: 31n,
    }),
  });
  state = older.state;
  const newer = await intakeOrder(state, {
    expectedRevision: state.revision,
    idempotencyKey: "newer-taker",
    receivedAt: 0,
    now: 9_000n,
    envelope: await envelope(makerA, {
      side: 0,
      role: 1,
      quantity: 5n,
      limitPrice: 2_100n,
      nonce: 32n,
    }),
  });
  state = newer.state;
  const maker = await intakeOrder(state, {
    expectedRevision: state.revision,
    idempotencyKey: "later-maker",
    receivedAt: 0,
    now: 9_000n,
    envelope: await envelope(makerB, {
      side: 1,
      role: 0,
      quantity: 5n,
      nonce: 33n,
    }),
  });
  assert.equal(maker.effects.length, 1);
  assert.equal(maker.effects[0].takerOrderId, newer.acceptedOrderId);
  assert.equal(maker.state.orders[older.acceptedOrderId].reserved, "0");
});

test("state snapshots are immutable, JSON durable and guarded by revision CAS", async () => {
  const initial = createMatchingState(config);
  assert.equal(Object.isFrozen(initial), true);
  const accepted = await intakeOrder(initial, {
    expectedRevision: 0,
    idempotencyKey: "durable",
    receivedAt: 1,
    now: 9_000n,
    envelope: await envelope(makerA),
  });
  const persisted = await commitMatchingState(
    serializeMatchingState(initial),
    0,
    accepted.state,
  );
  assert.equal(JSON.parse(persisted).revision, 1);
  await assert.rejects(
    () =>
      commitMatchingState(serializeMatchingState(initial), 1, accepted.state),
    /compare-and-swap/i,
  );
  assert.throws(() => {
    accepted.state.revision = 99;
  }, /read only|object is not extensible|Cannot assign/i);
  const malformed = JSON.parse(persisted);
  malformed.orders[accepted.acceptedOrderId].filled = "999";
  await assert.rejects(
    () => hydrateMatchingState(JSON.stringify(malformed), config),
    /invariant/i,
  );
  let storedRevision = 0;
  await persistMatchingStateAtomic(
    {
      async compareAndSwap(expectedRevision) {
        if (storedRevision !== expectedRevision) return false;
        storedRevision += 1;
        return true;
      },
    },
    serializeMatchingState(initial),
    0,
    accepted.state,
  );
  assert.equal(storedRevision, 1);
});

test("cancellation requires an exact trader transaction and canonical event", async () => {
  const signed = await envelope(makerA);
  const accepted = await intakeOrder(createMatchingState(config), {
    expectedRevision: 0,
    idempotencyKey: "intake",
    receivedAt: 100,
    now: 9_000n,
    envelope: signed,
  });
  assert.throws(
    () =>
      cancelOrder(accepted.state, {
        expectedRevision: 1,
        idempotencyKey: "cancel-wrong",
        orderId: accepted.acceptedOrderId,
        trader: makerB.address,
      }),
    /trader/i,
  );
  const cancelled = cancelOrder(accepted.state, {
    expectedRevision: 1,
    idempotencyKey: "cancel",
    orderId: accepted.acceptedOrderId,
    trader: makerA.address,
  });
  assert.equal(
    cancelled.state.orders[accepted.acceptedOrderId].status,
    "cancellation-pending",
  );
  const duplicate = cancelOrder(cancelled.state, {
    expectedRevision: 1,
    idempotencyKey: "cancel",
    orderId: accepted.acceptedOrderId,
    trader: makerA.address,
  });
  assert.equal(duplicate.duplicate, true);
  const duplicateWithNewKey = cancelOrder(cancelled.state, {
    expectedRevision: cancelled.state.revision,
    idempotencyKey: "cancel-again",
    orderId: accepted.acceptedOrderId,
    trader: makerA.address,
  });
  assert.equal(duplicateWithNewKey.duplicate, true);
  assert.equal(duplicateWithNewKey.effect.id, cancelled.effect.id);
  assert.equal(Object.keys(duplicateWithNewKey.state.effects).length, 1);

  const txHash = `0x${"aa".repeat(32)}`;
  const submitted = recordSubmission(cancelled.state, {
    expectedRevision: cancelled.state.revision,
    effectId: cancelled.effect.id,
    txHash,
    submittedAtBlock: 90,
    transactionNonce: 1,
    transactionSender: makerA.address,
  });
  const confirmed = reconcileSubmission(submitted.state, {
    expectedRevision: submitted.state.revision,
    effectId: cancelled.effect.id,
    now: 9_000n,
    receipt: {
      status: "success",
      transactionHash: txHash,
      blockNumber: 100,
      blockHash: `0x${"77".repeat(32)}`,
    },
    canonicalBlockHash: `0x${"77".repeat(32)}`,
    headBlock: 101,
    requiredConfirmations: 2,
    transaction: {
      hash: txHash,
      chainId: 97,
      from: makerA.address,
      to: verifyingContract,
      input: cancelled.effect.calldata,
    },
    event: {
      eventName: "OrderCancelled",
      address: verifyingContract,
      orderHash: accepted.acceptedOrderId,
      trader: makerA.address,
    },
  });
  assert.equal(
    confirmed.state.orders[accepted.acceptedOrderId].status,
    "cancelled",
  );
  const duplicateAfterConfirmation = cancelOrder(confirmed.state, {
    expectedRevision: confirmed.state.revision,
    idempotencyKey: "cancel-after-confirmation",
    orderId: accepted.acceptedOrderId,
    trader: makerA.address,
  });
  assert.equal(duplicateAfterConfirmation.duplicate, true);
  assert.equal(duplicateAfterConfirmation.effect.id, cancelled.effect.id);
  assert.equal(Object.keys(duplicateAfterConfirmation.state.effects).length, 1);
});

function matchProof(effect, txHash, overrides = {}) {
  return {
    now: 9_000n,
    receipt: {
      status: "success",
      transactionHash: txHash,
      blockNumber: 100,
      blockHash: `0x${"77".repeat(32)}`,
    },
    canonicalBlockHash: `0x${"77".repeat(32)}`,
    headBlock: 102,
    requiredConfirmations: 3,
    transaction: {
      hash: txHash,
      chainId: 97,
      from: makerA.address,
      to: verifyingContract,
      input: effect.calldata,
    },
    event: {
      eventName: "OrdersMatched",
      address: verifyingContract,
      makerOrderHash: effect.makerOrderId,
      takerOrderHash: effect.takerOrderId,
      fillQuantity: effect.quantity,
      executionPrice: effect.price,
    },
    ...overrides,
  };
}

test("submission retries are idempotent and canonical confirmation finalizes fills", async () => {
  let state = createMatchingState(config);
  for (const [account, overrides, key] of [
    [makerA, { side: 1, role: 0, nonce: 1n }, "maker"],
    [taker, { side: 0, role: 1, nonce: 2n }, "taker"],
  ]) {
    const result = await intakeOrder(state, {
      expectedRevision: state.revision,
      idempotencyKey: key,
      receivedAt: state.revision + 1,
      now: 9_000n,
      envelope: await envelope(account, overrides),
    });
    state = result.state;
  }
  const [effect] = Object.values(state.effects);
  const submitted = recordSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    txHash: `0x${"55".repeat(32)}`,
    submittedAtBlock: 90,
    transactionNonce: 2,
    transactionSender: makerA.address,
  });
  const retry = recordSubmission(submitted.state, {
    expectedRevision: 0,
    effectId: effect.id,
    txHash: `0x${"55".repeat(32)}`,
    submittedAtBlock: 90,
    transactionNonce: 2,
    transactionSender: makerA.address,
  });
  assert.equal(retry.duplicate, true);
  assert.throws(
    () =>
      recordSubmission(submitted.state, {
        expectedRevision: submitted.state.revision,
        effectId: effect.id,
        txHash: `0x${"66".repeat(32)}`,
        submittedAtBlock: 90,
        transactionNonce: 2,
        transactionSender: makerA.address,
      }),
    /transaction/i,
  );

  const txHash = `0x${"55".repeat(32)}`;
  const exactProof = matchProof(effect, txHash);
  assert.throws(
    () =>
      reconcileSubmission(submitted.state, {
        expectedRevision: submitted.state.revision,
        effectId: effect.id,
        ...exactProof,
        transaction: { ...exactProof.transaction, input: "0x1234" },
      }),
    /prepared effect/i,
  );
  const confirmed = reconcileSubmission(submitted.state, {
    expectedRevision: submitted.state.revision,
    effectId: effect.id,
    ...exactProof,
  });
  assert.equal(confirmed.state.effects[effect.id].status, "confirmed");
  assert.equal(confirmed.state.orders[effect.makerOrderId].filled, "10");
  assert.equal(confirmed.state.orders[effect.makerOrderId].reserved, "0");
});

test("a transaction absent from receipt and mempool releases after a bounded block window", async () => {
  let state = createMatchingState(config);
  for (const [account, overrides, key] of [
    [makerA, { side: 1, role: 0, nonce: 41n }, "drop-maker"],
    [taker, { side: 0, role: 1, nonce: 42n }, "drop-taker"],
  ]) {
    state = (
      await intakeOrder(state, {
        expectedRevision: state.revision,
        idempotencyKey: key,
        receivedAt: state.revision,
        now: 9_000n,
        envelope: await envelope(account, overrides),
      })
    ).state;
  }
  const [effect] = Object.values(state.effects);
  state = recordSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    txHash: `0x${"ab".repeat(32)}`,
    submittedAtBlock: 100,
    transactionNonce: 7,
    transactionSender: makerA.address,
  }).state;
  const pending = reconcileSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    now: 9_000n,
    receipt: null,
    canonicalBlockHash: null,
    headBlock: 119,
    requiredConfirmations: 3,
    transactionPresent: false,
    dropAfterBlocks: 20,
  });
  assert.equal(pending.duplicate, true);
  const dropped = reconcileSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    now: 9_000n,
    receipt: null,
    canonicalBlockHash: `0x${"cd".repeat(32)}`,
    headBlock: 122,
    requiredConfirmations: 3,
    transactionPresent: false,
    dropAfterBlocks: 20,
    nonceConsumption: {
      transactionHash: `0x${"ac".repeat(32)}`,
      sender: makerA.address,
      nonce: 7,
      blockNumber: 120,
      blockHash: `0x${"cd".repeat(32)}`,
    },
  });
  assert.equal(dropped.state.effects[effect.id].status, "reorged");
  assert.equal(dropped.effects.length, 1);
});

test("reorg reconciliation reverses confirmed fills and releases reservations once", async () => {
  let state = createMatchingState(config);
  for (const [account, overrides, key] of [
    [makerA, { side: 1, role: 0, nonce: 1n }, "maker"],
    [taker, { side: 0, role: 1, nonce: 2n }, "taker"],
  ]) {
    const result = await intakeOrder(state, {
      expectedRevision: state.revision,
      idempotencyKey: key,
      receivedAt: state.revision + 1,
      now: 9_000n,
      envelope: await envelope(account, overrides),
    });
    state = result.state;
  }
  const [effect] = Object.values(state.effects);
  state = recordSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    txHash: `0x${"55".repeat(32)}`,
    submittedAtBlock: 90,
    transactionNonce: 2,
    transactionSender: makerA.address,
  }).state;
  state = reconcileSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    ...matchProof(effect, `0x${"55".repeat(32)}`),
  }).state;
  const reorged = reconcileSubmission(state, {
    expectedRevision: state.revision,
    effectId: effect.id,
    ...matchProof(effect, `0x${"55".repeat(32)}`),
    canonicalBlockHash: `0x${"88".repeat(32)}`,
  });
  assert.equal(reorged.state.effects[effect.id].status, "reorged");
  assert.equal(reorged.state.orders[effect.makerOrderId].filled, "0");
  assert.equal(reorged.effects.length, 1);
  assert.equal(reorged.state.orders[effect.makerOrderId].reserved, "10");
  const duplicate = reconcileSubmission(reorged.state, {
    expectedRevision: 0,
    effectId: effect.id,
    ...matchProof(effect, `0x${"55".repeat(32)}`),
    canonicalBlockHash: `0x${"88".repeat(32)}`,
  });
  assert.equal(duplicate.duplicate, true);

  assert.throws(
    () =>
      recordSubmission(reorged.state, {
        expectedRevision: reorged.state.revision,
        effectId: effect.id,
        txHash: `0x${"99".repeat(32)}`,
        submittedAtBlock: 104,
        transactionNonce: 2,
        transactionSender: makerA.address,
      }),
    /another transaction/i,
  );
  const rematched = reorged.effects[0];
  const resubmitted = recordSubmission(reorged.state, {
    expectedRevision: reorged.state.revision,
    effectId: rematched.id,
    txHash: `0x${"99".repeat(32)}`,
    submittedAtBlock: 104,
    transactionNonce: 3,
    transactionSender: makerA.address,
  });
  assert.equal(resubmitted.state.effects[rematched.id].status, "submitted");
});
