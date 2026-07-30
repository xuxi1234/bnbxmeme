import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAIN_INDEX_VERSION,
  applyTransferDeltas,
  canServeStaleIndex,
  exactCheckpointFilter,
  indexCoversCheckpoint,
  isCompatibleIndexState,
  materializeHolders,
  mergeIndexedTrades,
  pricePerMillionBnb,
  resolveScanWindow,
  summarizeTrades,
  verifiedReservePrice,
} from "./chain-data-core.ts";
import { resolveFactoryDeploymentBlock } from "./factory-deployment-blocks.ts";

const factory = "0xdb189396ae2a350c484ddd749a6af96baebc124b";
const token = "0x1111111111111111111111111111111111111111";
const curve = "0x2222222222222222222222222222222222222222";
const pair = "0x3333333333333333333333333333333333333333";
const buyer = "0x4444444444444444444444444444444444444444";
const seller = "0x5555555555555555555555555555555555555555";
const zero = "0x0000000000000000000000000000000000000000";
const dead = "0x000000000000000000000000000000000000dead";

function trade({
  id,
  blockNumber,
  source = "curve",
  side = "buy",
  account = buyer,
  bnb = "1000000000000000000",
  priceBNB = bnb,
  tokens = "1000000000000000000000000",
  timestamp = 1_000_000,
}) {
  return {
    id,
    side,
    source,
    account,
    bnb,
    priceBNB,
    tokens,
    timestamp,
    blockNumber: String(blockNumber),
    transactionHash: `0x${id.padStart(64, "0")}`,
  };
}

function indexState(overrides = {}) {
  return {
    version: CHAIN_INDEX_VERSION,
    complete: true,
    factory,
    token,
    curve,
    pair,
    deploymentBlock: "112395295",
    latestBlock: "112500000",
    holderBalances: { [buyer]: "1" },
    graduatedAt: 1_000_000,
    ...overrides,
  };
}

test("uses immutable mainnet Factory origins before any environment fallback", () => {
  assert.equal(resolveFactoryDeploymentBlock(factory, "999"), 112_395_295n);
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0x9f572dc9d582ec8347d2a803f766652982220539",
      "999",
    ),
    112_395_524n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8",
      "999",
    ),
    112_626_381n,
  );
});

test("uses an explicit deployment block only for an unknown/test Factory", () => {
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0x6666666666666666666666666666666666666666",
      "12345",
    ),
    12_345n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0x6666666666666666666666666666666666666666",
      "",
    ),
    null,
  );
});

test("starts a first backfill at the Factory deployment block", () => {
  assert.deepEqual(
    resolveScanWindow({
      deploymentBlock: 100n,
      checkpointBlock: null,
      chainHead: 350n,
      maxBlocks: 100n,
    }),
    {
      shouldScan: true,
      fromBlock: 100n,
      toBlock: 199n,
      complete: false,
    },
  );
});

test("continues at checkpoint plus one and eventually reaches the chain head", () => {
  assert.deepEqual(
    resolveScanWindow({
      deploymentBlock: 100n,
      checkpointBlock: 199n,
      chainHead: 250n,
      maxBlocks: 100n,
    }),
    {
      shouldScan: true,
      fromBlock: 200n,
      toBlock: 250n,
      complete: true,
    },
  );
  assert.deepEqual(
    resolveScanWindow({
      deploymentBlock: 100n,
      checkpointBlock: 250n,
      chainHead: 250n,
    }),
    {
      shouldScan: false,
      fromBlock: 251n,
      toBlock: 250n,
      complete: true,
    },
  );
});

test("rejects legacy, mismatched Pair, and malformed holder cache states", () => {
  const identity = {
    factory,
    token,
    curve,
    pair,
    deploymentBlock: "112395295",
  };
  assert.equal(isCompatibleIndexState(undefined, identity), false);
  assert.equal(
    isCompatibleIndexState(indexState({ version: 1 }), identity),
    false,
  );
  assert.equal(
    isCompatibleIndexState(
      indexState({ pair: "0x7777777777777777777777777777777777777777" }),
      identity,
    ),
    false,
  );
  assert.equal(
    isCompatibleIndexState(
      indexState({ holderBalances: { [buyer]: "-1" } }),
      identity,
    ),
    false,
  );
  assert.equal(isCompatibleIndexState(indexState(), identity), true);
});

test("deduplicates overlapping logs by transaction hash and log index", () => {
  const first = trade({ id: "1-0", blockNumber: 10 });
  const replacement = trade({
    id: "1-0",
    blockNumber: 10,
    bnb: "2000000000000000000",
  });
  const second = trade({ id: "2-0", blockNumber: 11 });
  assert.deepEqual(mergeIndexedTrades([first], [replacement, second]), [
    replacement,
    second,
  ]);
});

test("accumulates holder balances across incremental transfer batches", () => {
  const initial = applyTransferDeltas({}, [
    { from: null, to: buyer, value: "100" },
    { from: null, to: seller, value: "50" },
  ]);
  const updated = applyTransferDeltas(initial, [
    { from: buyer, to: seller, value: "25" },
    { from: seller, to: null, value: "10" },
  ]);
  assert.deepEqual(updated, {
    [buyer]: "75",
    [seller]: "65",
  });
});

test("excludes Curve, Pair, zero and burn addresses from holder counts", () => {
  const snapshot = materializeHolders(
    {
      [buyer]: "30",
      [seller]: "20",
      [curve]: "100",
      [pair]: "200",
      [zero]: "300",
      [dead]: "400",
    },
    [curve, pair, zero, dead],
    1,
  );
  assert.deepEqual(snapshot, {
    holders: [{ address: buyer, balance: "30" }],
    holderCount: 2,
    holdersLimited: true,
  });
});

test("graduated 24h metrics count Pancake swaps without curve trades", () => {
  const trades = [
    trade({
      id: "1",
      blockNumber: 1,
      source: "curve",
      bnb: "9000000000000000000",
      timestamp: 999_900,
    }),
    trade({
      id: "2",
      blockNumber: 2,
      source: "pancake",
      bnb: "1000000000000000000",
      priceBNB: "1000000000000000000",
      timestamp: 999_900,
    }),
    trade({
      id: "3",
      blockNumber: 3,
      source: "pancake",
      side: "sell",
      account: seller,
      bnb: "2000000000000000000",
      priceBNB: "2000000000000000000",
      timestamp: 1_000_000,
    }),
  ];
  const summary = summarizeTrades(trades, "pancake", 900_000);
  assert.equal(summary.volume24hBnb, 3);
  assert.equal(summary.buys24h, 1);
  assert.equal(summary.sells24h, 1);
  assert.equal(summary.priceChange24h, 100);
});

test("computes the live reserve price with bigint precision", () => {
  const actual = pricePerMillionBnb(
    62_936_306_254_611_034n,
    1_016_901_114_931_749_505_053_662_602n,
  );
  assert.ok(actual !== null);
  assert.ok(Math.abs(actual - 0.00006189029132772174) < 1e-18);
  assert.equal(pricePerMillionBnb(0n, 1n), null);
  assert.equal(pricePerMillionBnb(1n, 0n), null);
});

test("only trusts cached current prices explicitly sourced from reserves", () => {
  assert.equal(
    verifiedReservePrice({
      priceSource: "reserve",
      pricePerMillionBnb: 0.00006189029132772174,
    }),
    0.00006189029132772174,
  );
  assert.equal(
    verifiedReservePrice({ pricePerMillionBnb: 0.00006291663865890646 }),
    null,
  );
  assert.equal(
    verifiedReservePrice({
      priceSource: "reserve",
      pricePerMillionBnb: Number.NaN,
    }),
    null,
  );
});

test("partial indexes are never eligible as stale complete market data", () => {
  assert.equal(canServeStaleIndex(indexState({ complete: false })), false);
  assert.equal(canServeStaleIndex(indexState()), true);
  assert.equal(canServeStaleIndex(null), false);
});

test("cache writes use an exact checkpoint compare-and-swap filter", () => {
  assert.equal(exactCheckpointFilter("112500000"), "eq.112500000");
  assert.throws(() => exactCheckpointFilter("112500000,112600000"));
});

test("a compare-and-swap loser only accepts an equal or newer checkpoint", () => {
  assert.equal(indexCoversCheckpoint(null, 112_500_000n), false);
  assert.equal(
    indexCoversCheckpoint(
      indexState({ latestBlock: "112499999" }),
      112_500_000n,
    ),
    false,
  );
  assert.equal(indexCoversCheckpoint(indexState(), 112_500_000n), true);
  assert.equal(
    indexCoversCheckpoint(
      indexState({ latestBlock: "112500001" }),
      112_500_000n,
    ),
    true,
  );
});
