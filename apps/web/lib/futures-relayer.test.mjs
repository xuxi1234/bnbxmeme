import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createFuturesRelayer } from "./futures-relayer-core.ts";

const account = privateKeyToAccount(`0x${"91".repeat(32)}`);
const orderBook = getAddress(`0x${"92".repeat(20)}`);
const makerOrderId = `0x${"93".repeat(32)}`;
const takerOrderId = `0x${"94".repeat(32)}`;
const calldata = `0x${"95".repeat(40)}`;
const blockHash = `0x${"96".repeat(32)}`;
const eventAbi = [
  {
    type: "event",
    name: "OrdersMatched",
    inputs: [
      { name: "makerOrderHash", type: "bytes32", indexed: true },
      { name: "takerOrderHash", type: "bytes32", indexed: true },
      { name: "fillQuantity", type: "uint128", indexed: false },
      { name: "executionPrice", type: "uint128", indexed: false },
    ],
  },
];

const effect = {
  id: `0x${"97".repeat(32)}`,
  kind: "submit-match",
  status: "prepared",
  calldata,
  makerOrderId,
  takerOrderId,
  quantity: "10",
  price: "2000",
};

function client(overrides = {}) {
  return {
    getChainId: async () => 97,
    getBytecode: async () => "0x6000",
    getBalance: async () => 1n,
    getTransactionCount: async () => 7,
    getBlockNumber: async () => 100n,
    prepareTransactionRequest: async (request) => ({
      ...request,
      gas: 200_000n,
      gasPrice: 1n,
      type: "legacy",
    }),
    sendRawTransaction: async ({ serializedTransaction }) =>
      keccak256(serializedTransaction),
    getTransaction: async () => null,
    getTransactionReceipt: async () => null,
    getBlock: async () => ({ hash: blockHash }),
    ...overrides,
  };
}

test("preflight fails closed on wrong chain, missing code, and empty balance", async () => {
  await assert.rejects(
    createFuturesRelayer({
      account,
      orderBook,
      client: client({ getChainId: async () => 56 }),
    }).preflight(),
    /chain/i,
  );
  await assert.rejects(
    createFuturesRelayer({
      account,
      orderBook,
      client: client({ getBytecode: async () => undefined }),
    }).preflight(),
    /bytecode/i,
  );
  await assert.rejects(
    createFuturesRelayer({
      account,
      orderBook,
      client: client({ getBalance: async () => 0n }),
    }).preflight(),
    /balance/i,
  );
});

test("prepare accepts only exact core match calldata and creates a deterministic hash", async () => {
  const relayer = createFuturesRelayer({ account, orderBook, client: client() });
  await assert.rejects(
    relayer.prepare({ ...effect, kind: "submit-cancellation" }),
    /match effect/i,
  );
  await assert.rejects(
    relayer.prepare({ ...effect, status: "submitted" }),
    /prepared/i,
  );
  const first = await relayer.prepare(effect);
  const second = await relayer.prepare(effect);
  assert.equal(first.raw, second.raw);
  assert.equal(first.hash, keccak256(first.raw));
  assert.equal(first.nonce, 7);
  assert.equal(first.sender, account.address);
  assert.equal(first.submittedAtBlock, 100);
});

test("broadcast accepts only the hash of the identical signed bytes", async () => {
  const good = createFuturesRelayer({ account, orderBook, client: client() });
  const prepared = await good.prepare(effect);
  assert.equal(await good.broadcast(prepared.raw), prepared.hash);
  const bad = createFuturesRelayer({
    account,
    orderBook,
    client: client({ sendRawTransaction: async () => `0x${"ff".repeat(32)}` }),
  });
  await assert.rejects(bad.broadcast(prepared.raw), /hash/i);
});

test("inspect validates transaction, canonical block, and exact OrdersMatched event", async () => {
  const prepared = await createFuturesRelayer({
    account,
    orderBook,
    client: client(),
  }).prepare(effect);
  const topics = encodeEventTopics({
    abi: eventAbi,
    eventName: "OrdersMatched",
    args: { makerOrderHash: makerOrderId, takerOrderHash: takerOrderId },
  });
  const log = {
    address: orderBook,
    topics,
    data: encodeAbiParameters(
      [{ type: "uint128" }, { type: "uint128" }],
      [10n, 2_000n],
    ),
    logIndex: 3,
  };
  const ready = client({
    getTransaction: async () => ({
      hash: prepared.hash,
      chainId: 97,
      from: account.address,
      to: orderBook,
      input: calldata,
      nonce: 7,
    }),
    getTransactionReceipt: async () => ({
      status: "success",
      transactionHash: prepared.hash,
      blockNumber: 101n,
      blockHash,
      logs: [log],
    }),
  });
  const relayer = createFuturesRelayer({ account, orderBook, client: ready });
  const observation = await relayer.inspect(prepared.hash, effect);
  assert.equal(observation.status, "included");
  assert.equal(observation.event.makerOrderHash, makerOrderId);
  assert.equal(observation.event.fillQuantity, "10");
  assert.equal(observation.logIndex, 3);

  const mutated = createFuturesRelayer({
    account,
    orderBook,
    client: client({
      getTransaction: async () => ({
        hash: prepared.hash,
        chainId: 97,
        from: account.address,
        to: orderBook,
        input: "0x1234",
        nonce: 7,
      }),
      getTransactionReceipt: ready.getTransactionReceipt,
    }),
  });
  await assert.rejects(mutated.inspect(prepared.hash, effect), /calldata/i);

  const reorged = createFuturesRelayer({
    account,
    orderBook,
    client: client({
      getTransaction: ready.getTransaction,
      getTransactionReceipt: ready.getTransactionReceipt,
      getBlock: async () => ({ hash: `0x${"98".repeat(32)}` }),
    }),
  });
  const reorgObservation = await reorged.inspect(prepared.hash, effect);
  assert.equal(reorgObservation.status, "reorged");
});
