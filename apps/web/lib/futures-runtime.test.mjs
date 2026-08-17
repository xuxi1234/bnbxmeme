import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createFuturesRuntime } from "./futures-runtime-core.ts";

const maker = privateKeyToAccount(`0x${"b1".repeat(32)}`);
const taker = privateKeyToAccount(`0x${"b2".repeat(32)}`);
const relayerAccount = privateKeyToAccount(`0x${"b3".repeat(32)}`);
const orderBook = getAddress(`0x${"b4".repeat(20)}`);
const config = {
  chainId: 97,
  verifyingContract: orderBook,
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

async function orderInput(account, overrides, idempotencyKey) {
  const order = {
    trader: account.address,
    side: 1,
    quantity: "10",
    limitPrice: "2000",
    leverage: 2,
    nonce: "1",
    deadline: "10000",
    reduceOnly: false,
    role: 0,
    ...overrides,
  };
  const domain = {
    name: config.domainName,
    version: config.domainVersion,
    chainId: 97,
    verifyingContract: orderBook,
  };
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "Order",
    message: {
      ...order,
      quantity: BigInt(order.quantity),
      limitPrice: BigInt(order.limitPrice),
      nonce: BigInt(order.nonce),
      deadline: BigInt(order.deadline),
    },
  });
  return { chainId: 97, idempotencyKey, envelope: { domain, order, signature } };
}

function memoryStore({ lease = true } = {}) {
  let row = null;
  const fills = [];
  return {
    get row() {
      return row;
    },
    async load() {
      return row;
    },
    async compareAndSwap(_key, expected, next, serialized) {
      if (row === null) {
        if (expected !== -1 || next !== 0) return false;
      } else if (row.revision !== expected || next !== expected + 1) return false;
      row = { revision: next, serialized };
      return true;
    },
    async acquireLease() {
      return lease;
    },
    async releaseLease() {},
    async upsertFill(fill) {
      if (!fills.some((item) => item.txHash === fill.txHash)) fills.push(fill);
    },
    async listFills(wallet) {
      return fills.filter(
        (fill) =>
          fill.makerWallet.toLowerCase() === wallet.toLowerCase() ||
          fill.takerWallet.toLowerCase() === wallet.toLowerCase(),
      );
    },
  };
}

function dependencies(store, overrides = {}) {
  const raw = `0x${"b5".repeat(20)}`;
  let broadcasts = 0;
  const relayer = {
    async prepare() {
      return {
        raw,
        hash: keccak256(raw),
        nonce: 4,
        sender: relayerAccount.address,
        submittedAtBlock: 90,
      };
    },
    async broadcast(value) {
      broadcasts += 1;
      assert.equal(value, raw);
      return keccak256(raw);
    },
    async inspect() {
      return { status: "pending", transactionPresent: true, headBlock: 91 };
    },
    ...overrides.relayer,
  };
  return {
    config,
    store,
    relayer,
    reads: {
      readMarketStatus: async () => ({
        marketState: "Open",
        markPrice: "2000",
        oracleUpdatedAt: 9000,
        fundingIndex: "0",
        fundingUpdatedAt: 9000,
      }),
      readPositions: async () => [],
      readCollateralIntent: async (_wallet, action, amount) => ({
        action,
        amount,
        to: getAddress(`0x${"b6".repeat(20)}`),
        calldata: "0x1234",
        expiresAt: 9120,
      }),
      readOrderCancelled: async () => false,
      readKeeperHealth: async () => ({
        status: "healthy",
        lastFundingCheckpoint: 90,
        lastLiquidationScan: 90,
        headBlock: 91,
        lagBlocks: 1,
      }),
      ...overrides.reads,
    },
    nowSeconds: () => 9000,
    nowMillis: () => 9_000_000,
    leaseOwner: () => "123e4567-e89b-42d3-a456-426614174000",
    requiredConfirmations: 2,
    reportDrainFailure: () => {},
    get broadcasts() {
      return broadcasts;
    },
  };
}

test("maker then crossing taker persists one prepared identity and broadcasts once", async () => {
  const store = memoryStore();
  const deps = dependencies(store);
  const runtime = createFuturesRuntime(deps);
  const makerRequest = await orderInput(maker, { side: 1, role: 0 }, "maker");
  const takerRequest = await orderInput(
    taker,
    { side: 0, role: 1, nonce: "2" },
    "taker",
  );
  const first = await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: makerRequest,
  });
  assert.equal(first.status, 201);
  assert.equal(deps.broadcasts, 0);
  const second = await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: takerRequest,
  });
  assert.equal(second.status, 202);
  assert.equal(deps.broadcasts, 1);
  const durable = JSON.parse(store.row.serialized);
  assert.equal(Object.values(durable.effects)[0].status, "submitted");
  assert.equal(Object.values(durable.effects)[0].txHash, keccak256(`0x${"b5".repeat(20)}`));

  await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: takerRequest,
  });
  assert.equal(deps.broadcasts, 1);
});

test("an expired prepared match releases reservations without calling the relayer", async () => {
  const store = memoryStore();
  let nowCall = 0;
  let preparations = 0;
  const deps = dependencies(store, {
    relayer: {
      async prepare() {
        preparations += 1;
        throw new Error("expired match must not reach the relayer");
      },
    },
  });
  deps.nowSeconds = () => [9_000, 9_000, 10_001][nowCall++] ?? 10_001;
  const runtime = createFuturesRuntime(deps);
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(maker, { side: 1, role: 0 }, "expiring-maker"),
  });
  await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(
      taker,
      { side: 0, role: 1, nonce: "2" },
      "expiring-taker",
    ),
  });

  const durable = JSON.parse(store.row.serialized);
  assert.equal(preparations, 0);
  assert.equal(Object.values(durable.effects)[0].status, "failed");
  assert.equal(durable.orders[Object.keys(durable.orders)[0]].reserved, "0");
  assert.equal(durable.orders[Object.keys(durable.orders)[1]].reserved, "0");
});

test("wallet identity is enforced and a lease loser never broadcasts", async () => {
  const store = memoryStore({ lease: false });
  const deps = dependencies(store);
  const runtime = createFuturesRuntime(deps);
  const makerRequest = await orderInput(maker, { side: 1, role: 0 }, "maker-2");
  await assert.rejects(
    runtime.dispatch({
      wallet: taker.address,
      resource: "orders",
      method: "POST",
      input: makerRequest,
    }),
    /wallet/i,
  );
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: makerRequest,
  });
  await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(taker, { side: 0, role: 1, nonce: "3" }, "taker-2"),
  });
  assert.equal(deps.broadcasts, 0);
});

test("orders are wallet scoped and cancellation returns wallet calldata only", async () => {
  const store = memoryStore();
  const deps = dependencies(store);
  const runtime = createFuturesRuntime(deps);
  const accepted = await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(maker, { nonce: "11" }, "maker-cancel"),
  });
  assert.equal(accepted.payload.data.length, 1);
  const stranger = await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "GET",
    input: { chainId: 97 },
  });
  assert.equal(stranger.payload.data.length, 0);
  const intent = await runtime.dispatch({
    wallet: maker.address,
    resource: "cancellations",
    method: "DELETE",
    input: {
      chainId: 97,
      idempotencyKey: "cancel-1",
      orderId: accepted.payload.data[0].orderId,
    },
  });
  assert.equal(intent.payload.data.status, "cancellation-pending");
  assert.equal(intent.payload.data.to, orderBook);
  assert.match(intent.payload.data.calldata, /^0x/);
  assert.equal(deps.broadcasts, 0);
});

test("Supabase failure prevents every chain submission", async () => {
  const store = memoryStore();
  store.compareAndSwap = async () => {
    throw new Error("database unavailable");
  };
  const deps = dependencies(store);
  const runtime = createFuturesRuntime(deps);
  await assert.rejects(
    runtime.dispatch({
      wallet: maker.address,
      resource: "orders",
      method: "POST",
      input: await orderInput(maker, {}, "db-fail"),
    }),
    /database/i,
  );
  assert.equal(deps.broadcasts, 0);
});

test("canonical included match becomes one wallet-scoped confirmed fill", async () => {
  const store = memoryStore();
  const txHash = keccak256(`0x${"b5".repeat(20)}`);
  const deps = dependencies(store, {
    relayer: {
      async inspect(_hash, effect) {
        return {
          status: "included",
          transactionPresent: true,
          headBlock: 101,
          transaction: {
            hash: txHash,
            chainId: 97,
            from: relayerAccount.address,
            to: orderBook,
            input: effect.calldata,
          },
          receipt: {
            status: "success",
            transactionHash: txHash,
            blockNumber: 100,
            blockHash: `0x${"b7".repeat(32)}`,
          },
          canonicalBlockHash: `0x${"b7".repeat(32)}`,
          logIndex: 1,
          event: {
            eventName: "OrdersMatched",
            address: orderBook,
            makerOrderHash: effect.makerOrderId,
            takerOrderHash: effect.takerOrderId,
            fillQuantity: effect.quantity,
            executionPrice: effect.price,
          },
        };
      },
    },
  });
  const runtime = createFuturesRuntime(deps);
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(maker, { side: 1, role: 0, nonce: "21" }, "fill-maker"),
  });
  await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(taker, { side: 0, role: 1, nonce: "22" }, "fill-taker"),
  });
  const fills = await runtime.dispatch({
    wallet: maker.address,
    resource: "fills",
    method: "GET",
    input: { chainId: 97, limit: 10 },
  });
  assert.equal(fills.payload.data.length, 1);
  assert.equal(fills.payload.data[0].txHash, txHash);
  const duplicate = await runtime.dispatch({
    wallet: maker.address,
    resource: "fills",
    method: "GET",
    input: { chainId: 97, limit: 10 },
  });
  assert.equal(duplicate.payload.data.length, 1);
});

test("ambiguous broadcast retries only identical durable signed bytes", async () => {
  const store = memoryStore();
  const sent = [];
  let inspection = 0;
  const deps = dependencies(store, {
    relayer: {
      async broadcast(raw) {
        sent.push(raw);
        if (sent.length === 1) throw new Error("timeout");
        return keccak256(raw);
      },
      async inspect() {
        inspection += 1;
        return { status: "pending", transactionPresent: false, headBlock: 91 };
      },
    },
  });
  const runtime = createFuturesRuntime(deps);
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(maker, { side: 1, role: 0, nonce: "31" }, "retry-maker"),
  });
  await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(taker, { side: 0, role: 1, nonce: "32" }, "retry-taker"),
  });
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "GET",
    input: { chainId: 97 },
  });
  assert.equal(inspection, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
});

test("a transient drain failure does not reject a durably accepted order and retries later", async () => {
  const store = memoryStore();
  const raw = `0x${"b5".repeat(20)}`;
  let preparations = 0;
  const deps = dependencies(store, {
    relayer: {
      async prepare() {
        preparations += 1;
        if (preparations === 1) throw new Error("transient rpc disagreement");
        return {
          raw,
          hash: keccak256(raw),
          nonce: 4,
          sender: relayerAccount.address,
          submittedAtBlock: 90,
        };
      },
    },
  });
  const runtime = createFuturesRuntime(deps);
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(maker, { side: 1, role: 0 }, "transient-maker"),
  });

  const accepted = await runtime.dispatch({
    wallet: taker.address,
    resource: "orders",
    method: "POST",
    input: await orderInput(
      taker,
      { side: 0, role: 1, nonce: "2" },
      "transient-taker",
    ),
  });

  assert.equal(accepted.status, 202);
  assert.equal(deps.broadcasts, 0);
  await runtime.dispatch({
    wallet: maker.address,
    resource: "orders",
    method: "GET",
    input: { chainId: 97 },
  });
  assert.equal(preparations, 2);
  assert.equal(deps.broadcasts, 1);
});
