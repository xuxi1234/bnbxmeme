import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFlapMirrorWarnings,
  normalizeFlapCandidate,
  sortNewestFlapCandidates,
  stableFlapGraduationTarget,
} from "./flap-mirror-core.ts";

const graduated = {
  coin: {
    address: "0x0000000000000000000000000000000000000012",
    name: "  Flap Golden Cat  ",
    symbol: " GOLDEN-CAT-LONG ",
    image: "bafkreicandidatecid",
  },
  listed: true,
  progress: "100.00",
  marketCap: "123456.78",
  volume24h: "9876.54",
  holders: 45,
  liquidity: "4321.09",
  createdAt: 1786378375,
  tax: { hasTax: true, buyTaxBps: 125, sellTaxBps: 300 },
  vault: null,
};

test("accepts only plain graduated Flap BSC records and normalizes live fields", () => {
  assert.deepEqual(normalizeFlapCandidate(graduated), {
    sourceAddress: "0x0000000000000000000000000000000000000012",
    name: "Flap Golden Cat",
    symbol: "GOLDEN-CAT",
    imageUrl: "https://flap.mypinata.cloud/ipfs/bafkreicandidatecid",
    sourceUrl: "https://flap.sh/bnb/0x0000000000000000000000000000000000000012",
    createdAt: "2026-08-10T16:12:55.000Z",
    marketCapUsd: 123456.78,
    volume24hUsd: 9876.54,
    holderCount: 45,
    liquidityUsd: 4321.09,
    buyTaxPercent: 1.25,
    sellTaxPercent: 3,
    graduationTargetBNB: 1,
  });

  for (const record of [
    { ...graduated, listed: false },
    { ...graduated, listed: "true" },
    { ...graduated, progress: " 100.00 " },
    { ...graduated, progress: "0100.00" },
    { ...graduated, progress: "99.999" },
    { ...graduated, progress: "not-a-number" },
    { ...graduated, vault: undefined },
    { ...graduated, vault: { factory: "0x0000000000000000000000000000000000000001" } },
    { ...graduated, coin: { ...graduated.coin, address: "0x1234" } },
  ]) {
    assert.equal(normalizeFlapCandidate(record), null);
  }

  assert.ok(normalizeFlapCandidate({ ...graduated, progress: 100 }));
  assert.ok(normalizeFlapCandidate({ ...graduated, progress: "100.0" }));
});

test("normalizes ipfs URLs without accepting unsafe image schemes", () => {
  assert.equal(
    normalizeFlapCandidate({
      ...graduated,
      coin: { ...graduated.coin, image: "ipfs://bafybeidirect" },
    })?.imageUrl,
    "https://flap.mypinata.cloud/ipfs/bafybeidirect",
  );
  assert.equal(
    normalizeFlapCandidate({
      ...graduated,
      coin: { ...graduated.coin, image: "https://flap.mypinata.cloud/ipfs/bafybeigateway" },
    })?.imageUrl,
    "https://flap.mypinata.cloud/ipfs/bafybeigateway",
  );
  assert.equal(
    normalizeFlapCandidate({
      ...graduated,
      coin: { ...graduated.coin, image: "javascript:alert(1)" },
    })?.imageUrl,
    "",
  );
});

test("preserves unavailable metrics instead of presenting them as zero", () => {
  const candidate = normalizeFlapCandidate({
    ...graduated,
    marketCap: undefined,
    volume24h: -1,
    holders: null,
    liquidity: "",
    tax: { hasTax: true },
  });
  assert.equal(candidate.marketCapUsd, null);
  assert.equal(candidate.volume24hUsd, null);
  assert.equal(candidate.holderCount, null);
  assert.equal(candidate.liquidityUsd, null);
  assert.equal(candidate.buyTaxPercent, null);
  assert.equal(candidate.sellTaxPercent, null);

  const zeroTax = normalizeFlapCandidate({
    ...graduated,
    tax: { hasTax: false },
  });
  assert.equal(zeroTax.buyTaxPercent, 0);
  assert.equal(zeroTax.sellTaxPercent, 0);
});

test("assigns the fixed one-BNB mirror graduation target", () => {
  assert.equal(
    stableFlapGraduationTarget("0x0000000000000000000000000000000000000001"),
    1,
  );
  assert.equal(
    stableFlapGraduationTarget("0x0000000000000000000000000000000000000012"),
    1,
  );
  assert.throws(() => stableFlapGraduationTarget("0x12"), /Invalid Flap token address/);
});

test("sorts newest Flap graduates first and caps the visible set at twenty", () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    ...normalizeFlapCandidate({
      ...graduated,
      coin: {
        ...graduated.coin,
        address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
      },
      createdAt: 1_786_000_000 + index,
    }),
  }));
  const sorted = sortNewestFlapCandidates(candidates);
  assert.equal(sorted.length, 20);
  assert.equal(sorted[0].createdAt, "2026-08-06T07:07:04.000Z");
  assert.equal(sorted.at(-1).createdAt, "2026-08-06T07:06:45.000Z");
});

test("keeps weak metrics and inherited source risks as warnings only", () => {
  const safeSecurity = {
    is_open_source: "1",
    is_honeypot: "0",
    cannot_sell_all: "0",
    is_mintable: "0",
    is_blacklisted: "0",
    hidden_owner: "0",
    is_proxy: "0",
    transfer_pausable: "0",
    external_call: "0",
  };
  assert.deepEqual(
    evaluateFlapMirrorWarnings({
      liquidityUsd: 2_999,
      volume24hUsd: 4_999,
      holderCount: 29,
      security: {
        ...safeSecurity,
        is_honeypot: "1",
        is_mintable: "1",
        hidden_owner: "1",
      },
    }),
    ["liquidity", "volume24h", "holders", "is_honeypot", "is_mintable", "hidden_owner"],
  );
  assert.deepEqual(
    evaluateFlapMirrorWarnings({
      liquidityUsd: 5_000,
      volume24hUsd: 8_000,
      holderCount: 30,
      security: null,
    }),
    ["security-unavailable"],
  );
});
