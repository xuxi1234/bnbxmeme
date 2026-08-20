import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, getAddress } from "viem";
import { createFuturesReadModel } from "./futures-read-model-core.ts";

const oracle = getAddress(`0x${"a1".repeat(20)}`);
const orderBook = getAddress(`0x${"a2".repeat(20)}`);
const clearingHouse = getAddress(`0x${"a3".repeat(20)}`);
const wallet = getAddress(`0x${"a4".repeat(20)}`);
const counterparty = getAddress(`0x${"a5".repeat(20)}`);

function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    getChainId: async () => 97,
    getBlockNumber: async () => 200n,
    readContract: async (request) => {
      calls.push(request);
      if (request.functionName === "safeRead")
        return [1, 2_000n, 0n, 0n, 1_000n];
      if (request.functionName === "cumulativeFundingIndex") return 0n;
      if (request.functionName === "fundingUpdatedAt") return 1_000n;
      if (request.functionName === "cancelled") return true;
      if (request.functionName === "activeLotCount") return 1;
      throw new Error(`unexpected ${request.functionName}`);
    },
    multicall: async ({ contracts }) => {
      calls.push({ multicall: contracts });
      if (contracts[0]?.functionName === "activeLotId")
        return [{ status: "success", result: 7n }];
      return [
        {
          status: "success",
          result: [7n, wallet, counterparty, 10n, 1_500n, 500n, 500n, 15_000n],
        },
        { status: "success", result: [0n, 1_000n] },
      ];
    },
    ...overrides,
  };
}

test("market status maps Open and CloseOnly without unbounded reads", async () => {
  const openClient = fakeClient();
  const model = createFuturesReadModel({
    client: openClient,
    oracle,
    orderBook,
    clearingHouse,
    now: () => 1_100,
  });
  assert.deepEqual(await model.readMarketStatus(), {
    marketState: "Open",
    markPrice: "2000",
    oracleUpdatedAt: 1000,
    fundingIndex: "0",
    fundingUpdatedAt: 1000,
  });
  assert.ok(openClient.calls.length <= 20);
  const closed = fakeClient({
    readContract: async ({ functionName }) =>
      functionName === "safeRead" ? [0, 0n, 0n, 0n, 999n] : 0n,
  });
  const closedModel = createFuturesReadModel({
    client: closed,
    oracle,
    orderBook,
    clearingHouse,
    now: () => 1_100,
  });
  assert.equal((await closedModel.readMarketStatus()).marketState, "CloseOnly");
});

test("positions are scoped to the requested wallet and bounded active lots", async () => {
  const rpc = fakeClient();
  const model = createFuturesReadModel({
    client: rpc,
    oracle,
    orderBook,
    clearingHouse,
    now: () => 1_100,
  });
  const positions = await model.readPositions(wallet, 8);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].side, 0);
  assert.equal(positions[0].quantity, "10");
  assert.equal(positions[0].entryPrice, "1500");
  assert.ok(rpc.calls.length <= 20);
  await assert.rejects(model.readPositions(wallet, 9), /limit/i);
});

test("collateral and cancellation reads bind exact contracts and calldata", async () => {
  const model = createFuturesReadModel({
    client: fakeClient(),
    oracle,
    orderBook,
    clearingHouse,
    now: () => 1_100,
  });
  const deposit = await model.readCollateralIntent(wallet, "deposit", "123");
  assert.equal(deposit.to, clearingHouse);
  assert.equal(deposit.expiresAt, 1220);
  assert.equal(
    decodeFunctionData({ abi: deposit.abi, data: deposit.calldata }).functionName,
    "deposit",
  );
  assert.equal(await model.readOrderCancelled(`0x${"a6".repeat(32)}`), true);
});

test("wrong chain, malformed contract output, and RPC excess fail closed", async () => {
  const wrong = createFuturesReadModel({
    client: fakeClient({ getChainId: async () => 56 }),
    oracle,
    orderBook,
    clearingHouse,
  });
  await assert.rejects(wrong.readMarketStatus(), /chain/i);
  const malformed = createFuturesReadModel({
    client: fakeClient({ readContract: async () => [1] }),
    oracle,
    orderBook,
    clearingHouse,
  });
  await assert.rejects(malformed.readMarketStatus(), /oracle/i);
});
