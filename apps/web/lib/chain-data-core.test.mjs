import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAIN_INDEX_VERSION,
  applyTransferDeltas,
  canServeStaleIndex,
  exactCheckpointFilter,
  indexCoversCheckpoint,
  isCompatibleIndexState,
  isExpectedWrappedPair,
  materializeHolders,
  mergeIndexedTrades,
  pricePerMillionBnb,
  resolveOfficialMarketPair,
  resolveSwapAccount,
  resolveScanWindow,
  summarizeTrades,
  verifiedReservePrice,
} from "./chain-data-core.ts";
import { resolveFactoryDeploymentBlock } from "./factory-deployment-blocks.ts";

const factory = "0xdb189396ae2a350c484ddd749a6af96baebc124b";
const token = "0x1111111111111111111111111111111111111111";
const curve = "0x2222222222222222222222222222222222222222";
const pair = "0x3333333333333333333333333333333333333333";
const wrappedNative = "0x6666666666666666666666666666666666666666";
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
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0xef95ead95292408090e61112580f62e4d556c550",
      "999",
    ),
    113_231_587n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d",
      "999",
    ),
    113_235_314n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0xe4aaf8066bf1063cfd73dc9a784598dffa412014",
      "999",
    ),
    113_775_105n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0x6012aa2eb5164c8ed31f2a01950c3b5037211181",
      "999",
    ),
    113_777_341n,
  );
  assert.equal(
    resolveFactoryDeploymentBlock(
      "0x6c72ece4f7aa05f3b2099ef9dd2d668e7e3f688e",
      "999",
    ),
    113_788_782n,
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
    isCompatibleIndexState(indexState({ version: 2 }), identity),
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

test("derives graduated market mode from the official Curve Pair", () => {
  assert.deepEqual(
    resolveOfficialMarketPair({
      state: 2,
      officialPair: pair,
      requestedPair: null,
    }),
    { status: "ok", pair },
  );
  assert.deepEqual(
    resolveOfficialMarketPair({
      state: 2,
      officialPair: pair,
      requestedPair: "0x7777777777777777777777777777777777777777",
    }),
    { status: "mismatch", reason: "PAIR_MISMATCH" },
  );
});

test("rejects Pair parameters before graduation instead of changing cache mode", () => {
  assert.deepEqual(
    resolveOfficialMarketPair({
      state: 0,
      officialPair: pair,
      requestedPair: null,
    }),
    { status: "ok", pair: null },
  );
  assert.deepEqual(
    resolveOfficialMarketPair({
      state: 1,
      officialPair: pair,
      requestedPair: pair,
    }),
    { status: "mismatch", reason: "PAIR_NOT_ACTIVE" },
  );
});

test("requires a graduated Pair to contain only the token and Curve WBNB", () => {
  assert.equal(
    isExpectedWrappedPair({
      token0: token,
      token1: wrappedNative,
      token,
      wrappedNative,
    }),
    true,
  );
  assert.equal(
    isExpectedWrappedPair({
      token0: wrappedNative,
      token1: token,
      token,
      wrappedNative,
    }),
    true,
  );
  assert.equal(
    isExpectedWrappedPair({
      token0: token,
      token1: "0x7777777777777777777777777777777777777777",
      token,
      wrappedNative,
    }),
    false,
  );
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

test("orders same-block trades by numeric log index for correct OHLC", () => {
  const laterLog = trade({ id: `${"0".repeat(64)}-10`, blockNumber: 10 });
  const earlierLog = trade({ id: `${"f".repeat(64)}-2`, blockNumber: 10 });
  assert.deepEqual(
    mergeIndexedTrades([], [laterLog, earlierLog]).map(({ id }) => id),
    [earlierLog.id, laterLog.id],
  );
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

test("attributes a Pancake sell to the token sender instead of Swap.to", () => {
  const router = "0x6666666666666666666666666666666666666666";
  const transactionHash = `0x${"a".repeat(64)}`;
  assert.equal(
    resolveSwapAccount({
      transactionHash,
      swapLogIndex: 15,
      side: "sell",
      pair,
      tokenAmount: "90",
      fallbackRecipient: router,
      transfers: [
        {
          transactionHash,
          logIndex: 10,
          from: seller,
          to: pair,
          value: "90",
        },
        {
          transactionHash,
          logIndex: 11,
          from: seller,
          to: dead,
          value: "10",
        },
      ],
    }),
    seller,
  );
});

test("attributes taxed Pancake buys to the Swap recipient", () => {
  const transactionHash = `0x${"b".repeat(64)}`;
  assert.equal(
    resolveSwapAccount({
      transactionHash,
      swapLogIndex: 15,
      side: "buy",
      pair,
      tokenAmount: "100",
      fallbackRecipient: buyer,
      transfers: [
        {
          transactionHash,
          logIndex: 12,
          from: pair,
          to: buyer,
          value: "90",
        },
        {
          transactionHash,
          logIndex: 13,
          from: pair,
          to: dead,
          value: "10",
        },
      ],
    }),
    buyer,
  );
});

test("prefers an exact buy transfer over a misleading Swap recipient", () => {
  const router = "0x6666666666666666666666666666666666666666";
  const transactionHash = `0x${"d".repeat(64)}`;
  assert.equal(
    resolveSwapAccount({
      transactionHash,
      swapLogIndex: 15,
      side: "buy",
      pair,
      tokenAmount: "100",
      fallbackRecipient: router,
      transfers: [
        {
          transactionHash,
          logIndex: 12,
          from: pair,
          to: buyer,
          value: "100",
        },
        {
          transactionHash,
          logIndex: 13,
          from: pair,
          to: router,
          value: "1",
        },
      ],
    }),
    buyer,
  );
});

test("does not invent a seller when no matching transfer exists", () => {
  const transactionHash = `0x${"c".repeat(64)}`;
  assert.equal(
    resolveSwapAccount({
      transactionHash,
      swapLogIndex: 15,
      side: "sell",
      pair,
      tokenAmount: "90",
      fallbackRecipient: buyer,
      transfers: [],
    }),
    null,
  );
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
    holderSupply: "50",
    top10ConcentrationPct: 100,
  });
});

test("uses all eligible holder supply as the Top 10 denominator", () => {
  const holderBalances = Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => [
      `0x${String(index + 1).padStart(40, "0")}`,
      String(11 - index),
    ]),
  );
  const snapshot = materializeHolders(
    {
      ...holderBalances,
      [curve]: "1000",
      [pair]: "2000",
      [dead]: "3000",
    },
    [curve, pair, dead],
  );
  assert.equal(snapshot.holderSupply, "66");
  assert.equal(snapshot.holderCount, 11);
  assert.equal(snapshot.top10ConcentrationPct, 98.4848);
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
