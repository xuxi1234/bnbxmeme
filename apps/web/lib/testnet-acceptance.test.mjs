import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { encodeFunctionData, isAddress, parseEther } from "viem";
import {
  BSC_TESTNET_CHAIN_ID,
  TESTNET_ADVANCED_DEPLOYER,
  TESTNET_BUSD,
  TESTNET_BUSD_WBNB_PAIR,
  TESTNET_LP_MINIMUM,
  TESTNET_PANCAKE_FACTORY,
  TESTNET_PANCAKE_ROUTER,
  TESTNET_REWARD_PROCESS_GAS,
  TESTNET_REWARD_PROCESS_TX_GAS,
  TESTNET_REWARDS_FACTORY,
  TESTNET_STANDARD_FACTORY,
  TESTNET_WBNB,
  acceptanceTokenCandidate,
  acceptanceFactory,
  acceptanceStandardFactoryAbi,
  buildAcceptanceCreateRequest,
} from "./testnet-acceptance.ts";
import { advancedFactoryAbi } from "./advanced-factory-abi.ts";

const creator = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const salt = `0x${"11".repeat(32)}`;

test("pins the isolated acceptance console to BSC Testnet V4 deployments", () => {
  assert.equal(BSC_TESTNET_CHAIN_ID, 97);
  assert.equal(acceptanceFactory("standard"), TESTNET_STANDARD_FACTORY);
  assert.equal(acceptanceFactory("holders"), TESTNET_REWARDS_FACTORY);
  assert.equal(acceptanceFactory("lp"), TESTNET_REWARDS_FACTORY);
  assert.notEqual(TESTNET_STANDARD_FACTORY, TESTNET_REWARDS_FACTORY);
  for (const address of [
    TESTNET_STANDARD_FACTORY,
    TESTNET_ADVANCED_DEPLOYER,
    TESTNET_REWARDS_FACTORY,
    TESTNET_PANCAKE_ROUTER,
    TESTNET_PANCAKE_FACTORY,
    TESTNET_WBNB,
    TESTNET_BUSD,
    TESTNET_BUSD_WBNB_PAIR,
  ]) {
    assert.equal(
      isAddress(address),
      true,
      `Invalid Testnet address: ${address}`,
    );
  }
});

test("restores a valid acceptance token from the URL before local storage", () => {
  const queryToken = "0xE12e6649C2Fd4665B67A5aF9C1218B0c43791111";
  const storedToken = "0x5c5aAa165f5FBcE1875363EF59A17A0Ac3931111";
  assert.equal(
    acceptanceTokenCandidate(`?token=${queryToken}`, storedToken),
    "0xE12E6649C2fD4665b67a5aF9C1218B0C43791111",
  );
  assert.equal(
    acceptanceTokenCandidate("", storedToken),
    "0x5c5AaA165f5fBce1875363ef59A17A0ac3931111",
  );
  assert.equal(acceptanceTokenCandidate("?token=invalid", "invalid"), null);
});

test("reserves enough transaction gas for bounded reward processing", async () => {
  assert.equal(TESTNET_REWARD_PROCESS_GAS, 500_000n);
  assert.equal(TESTNET_REWARD_PROCESS_TX_GAS, 750_000n);
  assert.ok(TESTNET_REWARD_PROCESS_TX_GAS > TESTNET_REWARD_PROCESS_GAS);

  const page = await readFile(
    new URL("../app/acceptance-testnet/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /\[TESTNET_REWARD_PROCESS_GAS\]/);
  assert.match(page, /gas: TESTNET_REWARD_PROCESS_TX_GAS/);
});

test("builds a permanent zero-tax standard request", () => {
  const request = buildAcceptanceCreateRequest({
    template: "standard",
    name: " V4 Standard ",
    symbol: " ZERO ",
    creator,
    vanitySalt: salt,
  });
  assert.deepEqual(request, {
    name: "V4 Standard",
    symbol: "ZERO",
    graduationTargetBNB: 1,
    metadataURI: "",
    vanitySalt: salt,
  });
  assert.doesNotThrow(() =>
    encodeFunctionData({
      abi: acceptanceStandardFactoryAbi,
      functionName: "createVanityToken",
      args: [request],
    }),
  );
});

test("builds immutable holder and LP reward fixtures using Testnet BUSD", () => {
  const holder = buildAcceptanceCreateRequest({
    template: "holders",
    name: "Holder Rewards",
    symbol: "HOLD",
    creator,
    vanitySalt: salt,
  });
  const lp = buildAcceptanceCreateRequest({
    template: "lp",
    name: "LP Rewards",
    symbol: "LP",
    creator,
    vanitySalt: salt,
  });
  assert.equal(holder.rewardToken, TESTNET_BUSD);
  assert.equal(holder.template, 0);
  assert.equal(holder.minimumRewardShare, parseEther("1000000"));
  assert.equal(holder.taxes.buy.rewards, 100);
  assert.equal(holder.taxes.sell.rewards, 100);
  assert.equal(lp.rewardToken, TESTNET_BUSD);
  assert.equal(lp.template, 1);
  assert.equal(lp.minimumRewardShare, TESTNET_LP_MINIMUM);
  assert.doesNotThrow(() =>
    encodeFunctionData({
      abi: advancedFactoryAbi,
      functionName: "createVanityToken",
      args: [lp],
    }),
  );
});

test("rejects missing identity and invalid creator inputs", () => {
  assert.throws(
    () =>
      buildAcceptanceCreateRequest({
        template: "standard",
        name: "",
        symbol: "X",
        creator,
        vanitySalt: salt,
      }),
    /required/,
  );
  assert.throws(
    () =>
      buildAcceptanceCreateRequest({
        template: "holders",
        name: "X",
        symbol: "X",
        creator: "0x0000000000000000000000000000000000000000",
        vanitySalt: salt,
      }),
    /Invalid creator/,
  );
});

test("keeps Testnet acceptance addresses out of production configuration", async () => {
  const [deployments, sitemap, layout, page] = await Promise.all([
    readFile(new URL("./deployments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/acceptance-testnet/layout.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/acceptance-testnet/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(deployments, new RegExp(TESTNET_STANDARD_FACTORY, "i"));
  assert.doesNotMatch(deployments, new RegExp(TESTNET_REWARDS_FACTORY, "i"));
  assert.doesNotMatch(sitemap, /acceptance-testnet/);
  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
  assert.match(page, /bscTestnet/);
  assert.doesNotMatch(page, /from "wagmi\/chains";[\s\S]*\bbsc\b/);
});
