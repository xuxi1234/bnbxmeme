import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import { createFuturesRuntimeStore } from "./futures-runtime-store-core.ts";

const wallet = getAddress(`0x${"12".repeat(20)}`);
const other = getAddress(`0x${"34".repeat(20)}`);
const orderBook = getAddress(`0x${"56".repeat(20)}`);
const hash = `0x${"ab".repeat(32)}`;
const blockHash = `0x${"cd".repeat(32)}`;
const orderA = `0x${"ef".repeat(32)}`;
const orderB = `0x${"10".repeat(32)}`;

function fakeRpc(responses) {
  const calls = [];
  return {
    calls,
    rpc: async (name, body) => {
      calls.push({ name, body });
      const response = responses[name];
      return typeof response === "function" ? response(body) : response;
    },
  };
}

test("state load initializes as null and validates a durable snapshot", async () => {
  const empty = fakeRpc({ futures_matching_state_load: [] });
  const emptyStore = createFuturesRuntimeStore(empty.rpc);
  assert.equal(await emptyStore.load(`97:${orderBook.toLowerCase()}`), null);

  const state = { revision: 4, orders: {}, effects: {} };
  const loaded = fakeRpc({
    futures_matching_state_load: [{ revision: 4, serialized: state }],
  });
  const store = createFuturesRuntimeStore(loaded.rpc);
  assert.deepEqual(await store.load(`97:${orderBook.toLowerCase()}`), {
    revision: 4,
    serialized: JSON.stringify(state),
  });
});

test("CAS sends exact adjacent revisions and returns stale rejection", async () => {
  const transport = fakeRpc({
    futures_matching_state_cas: (body) => body.p_expected_revision === 3,
  });
  const store = createFuturesRuntimeStore(transport.rpc);
  const key = `97:${orderBook.toLowerCase()}`;
  assert.equal(await store.compareAndSwap(key, 3, 4, '{"revision":4}'), true);
  assert.equal(await store.compareAndSwap(key, 2, 3, '{"revision":3}'), false);
  assert.deepEqual(transport.calls[0], {
    name: "futures_matching_state_cas",
    body: {
      p_deployment_key: key,
      p_expected_revision: 3,
      p_next_revision: 4,
      p_serialized: { revision: 4 },
    },
  });
  await assert.rejects(
    store.compareAndSwap(key, 3, 5, '{"revision":5}'),
    /adjacent/,
  );
});

test("lease RPCs preserve owner identity and bounded expiry", async () => {
  const transport = fakeRpc({
    futures_effect_lease_acquire: true,
    futures_effect_lease_release: true,
  });
  const store = createFuturesRuntimeStore(transport.rpc);
  const key = `97:${orderBook.toLowerCase()}`;
  const owner = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(await store.acquireLease(key, owner, 30), true);
  await store.releaseLease(key, owner);
  assert.equal(transport.calls[0].body.p_lease_seconds, 30);
  assert.equal(transport.calls[1].body.p_lease_owner, owner);
  await assert.rejects(store.acquireLease(key, owner, 61), /lease/);
});

test("fill writes are canonical and reads are wallet scoped", async () => {
  const row = {
    chain_id: 97,
    order_book: orderBook.toLowerCase(),
    tx_hash: hash,
    log_index: 2,
    block_number: 123,
    block_hash: blockHash,
    maker_order_id: orderA,
    taker_order_id: orderB,
    maker_wallet: wallet.toLowerCase(),
    taker_wallet: other.toLowerCase(),
    quantity: "100",
    price: "200",
    confirmed_at: "2026-08-17T12:00:00.000Z",
  };
  const transport = fakeRpc({
    futures_fill_upsert: true,
    futures_fill_list: [row, row],
  });
  const store = createFuturesRuntimeStore(transport.rpc);
  await store.upsertFill({
    chainId: 97,
    orderBook,
    txHash: hash,
    logIndex: 2,
    blockNumber: 123,
    blockHash,
    makerOrderId: orderA,
    takerOrderId: orderB,
    makerWallet: wallet,
    takerWallet: other,
    quantity: "100",
    price: "200",
  });
  const fills = await store.listFills(wallet, 2);
  assert.equal(fills.length, 2);
  assert.equal(transport.calls[1].body.p_wallet, wallet.toLowerCase());
  assert.equal(transport.calls[1].body.p_limit, 2);
  assert.equal(fills[0].makerWallet, wallet);
  assert.equal(fills[0].takerWallet, other);
});

test("store rejects oversized state and malformed RPC output", async () => {
  const malformed = fakeRpc({
    futures_matching_state_load: [{ revision: -1, serialized: [] }],
  });
  const store = createFuturesRuntimeStore(malformed.rpc);
  await assert.rejects(store.load(`97:${orderBook.toLowerCase()}`), /response/);
  await assert.rejects(
    store.compareAndSwap(
      `97:${orderBook.toLowerCase()}`,
      0,
      1,
      JSON.stringify({ value: "x".repeat(2_097_152) }),
    ),
    /large/,
  );
});
