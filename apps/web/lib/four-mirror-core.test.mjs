import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMirrorEligibility,
  normalizeFourCandidate,
  selectPancakePair,
  stableGraduationTarget,
} from "./four-mirror-core.ts";

const rawCandidate = {
  tokenAddress: "0x0000000000000000000000000000000000000012",
  name: "  Panda AI Companion  ",
  shortName: " PANDA-LONG-SYMBOL ",
  img: "/market/panda.png",
  status: "TRADE",
  createDate: "1786258358000",
};

const safeSecurity = {
  holder_count: "120",
  is_open_source: "1",
  is_honeypot: "0",
  is_mintable: "0",
  is_blacklisted: "0",
  cannot_buy: "0",
  cannot_sell_all: "0",
  hidden_owner: "0",
  is_proxy: "0",
  selfdestruct: "0",
  transfer_pausable: "0",
  external_call: "0",
};

test("normalizes Four identity without treating the quote symbol as token symbol", () => {
  assert.deepEqual(normalizeFourCandidate(rawCandidate), {
    sourceAddress: "0x0000000000000000000000000000000000000012",
    name: "Panda AI Companion",
    symbol: "PANDA-LONG",
    imageUrl: "https://static.four.meme/market/panda.png",
    sourceUrl:
      "https://four.meme/token/0x0000000000000000000000000000000000000012",
    createdAt: "2026-08-09T06:52:38.000Z",
  });
});

test("assigns a stable integer target from 1 through 18", () => {
  assert.equal(
    stableGraduationTarget("0x0000000000000000000000000000000000000001"),
    2,
  );
  assert.equal(
    stableGraduationTarget("0x0000000000000000000000000000000000000012"),
    1,
  );
  assert.equal(
    stableGraduationTarget("0x0000000000000000000000000000000000000012"),
    1,
  );
});

test("selects the highest-liquidity BSC Pancake pair", () => {
  const pair = selectPancakePair([
    { chainId: "bsc", dexId: "fourmeme", liquidity: { usd: 90_000 } },
    {
      chainId: "bsc",
      dexId: "pancakeswap",
      baseToken: { address: "0x0000000000000000000000000000000000000013" },
      liquidity: { usd: 99_000 },
    },
    {
      chainId: "bsc",
      dexId: "pancakeswap",
      baseToken: { address: "0x0000000000000000000000000000000000000012" },
      liquidity: { usd: 12_000 },
    },
    {
      chainId: "bsc",
      dexId: "pancakeswap",
      baseToken: { address: "0x0000000000000000000000000000000000000012" },
      liquidity: { usd: 25_000 },
    },
    { chainId: "ethereum", dexId: "pancakeswap", liquidity: { usd: 80_000 } },
  ], "0x0000000000000000000000000000000000000012");
  assert.equal(pair?.liquidity?.usd, 25_000);
});

test("accepts only candidates meeting all balanced thresholds", () => {
  assert.deepEqual(
    evaluateMirrorEligibility({
      liquidityUsd: 10_000,
      volume24hUsd: 20_000,
      security: safeSecurity,
    }),
    { eligible: true, reasons: [] },
  );
  assert.deepEqual(
    evaluateMirrorEligibility({
      liquidityUsd: 9_999,
      volume24hUsd: 19_999,
      security: { ...safeSecurity, holder_count: "99" },
    }),
    {
      eligible: false,
      reasons: ["liquidity", "volume24h", "holders"],
    },
  );
});

test("fails closed when security data is missing or reports a blocking risk", () => {
  assert.deepEqual(
    evaluateMirrorEligibility({
      liquidityUsd: 50_000,
      volume24hUsd: 70_000,
      security: null,
    }).reasons,
    ["security-unavailable"],
  );

  const riskFields = [
    "is_honeypot",
    "is_mintable",
    "is_blacklisted",
    "cannot_buy",
    "cannot_sell_all",
    "hidden_owner",
    "is_proxy",
    "selfdestruct",
    "transfer_pausable",
    "external_call",
  ];
  for (const field of riskFields) {
    const result = evaluateMirrorEligibility({
      liquidityUsd: 50_000,
      volume24hUsd: 70_000,
      security: { ...safeSecurity, [field]: "1" },
    });
    assert.equal(result.eligible, false, field);
    assert.ok(result.reasons.includes(field), field);
  }

  assert.deepEqual(
    evaluateMirrorEligibility({
      liquidityUsd: 50_000,
      volume24hUsd: 70_000,
      security: { ...safeSecurity, is_open_source: "0" },
    }).reasons,
    ["not-open-source"],
  );
});
