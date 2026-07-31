import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { encodeFunctionData, parseEther } from "viem";
import { advancedFactoryAbi } from "./advanced-factory-abi.ts";
import {
  ADVANCED_CREATE_GAS_LIMIT,
  advancedCreateGasLimit,
  advancedTemplateValue,
  emptyTaxSide,
  normalizeTaxesForTemplate,
  parseTaxPercent,
  taxSideToBps,
} from "./advanced-template-config.ts";
import { rewardsFactoryDeploymentAbi } from "./rewards-factory-deployment.ts";

const wallet = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const taxes = {
  buy: { burn: 0, liquidity: 0, marketing: 0, rewards: 100 },
  sell: { burn: 0, liquidity: 0, marketing: 0, rewards: 100 },
};
const request = {
  name: "BNBX",
  symbol: "BNBX",
  graduationTargetBNB: 1,
  metadataURI: "",
  vanitySalt: `0x${"00".repeat(32)}`,
  marketingWallet: wallet,
  rewardToken: "0x55d398326f99059fF775485246999027B3197955",
  taxes,
  template: 0,
  minimumRewardShare: parseEther("10000"),
};

test("uses the deployed advanced Factory function signatures", () => {
  const calls = [
    {
      functionName: "findVanitySalt",
      args: [request, 0n, 10_000n],
    },
    { functionName: "createVanityToken", args: [request] },
    {
      functionName: "createVanityTokenAndBuy",
      args: [
        request,
        {
          minTokensOut: 0n,
          deadline: 1n,
          refundRecipient: wallet,
        },
      ],
    },
  ];

  for (const call of calls) {
    assert.equal(
      encodeFunctionData({ abi: advancedFactoryAbi, ...call }),
      encodeFunctionData({
        abi: rewardsFactoryDeploymentAbi,
        ...call,
      }),
    );
  }
});

test("maps every advanced template to the onchain enum", () => {
  assert.equal(advancedTemplateValue("holders"), 0);
  assert.equal(advancedTemplateValue("lp"), 1);
});

test("keeps template taxes deployable when switching templates", () => {
  const empty = emptyTaxSide();
  const rewards = normalizeTaxesForTemplate("holders", empty, empty);
  assert.equal(rewards.buy.rewards, "0");
  assert.equal(rewards.sell.rewards, "0");

  const standard = normalizeTaxesForTemplate(
    "standard",
    { ...empty, burn: "2" },
    { ...empty, marketing: "3" },
  );
  assert.deepEqual(standard, { buy: emptyTaxSide(), sell: emptyTaxSide() });
});

test("accepts typed zero taxes and rejects malformed values", () => {
  assert.equal(parseTaxPercent("0"), 0);
  assert.equal(parseTaxPercent("2.25"), 2.25);
  assert.equal(parseTaxPercent(""), null);
  assert.equal(parseTaxPercent("-1"), null);
  assert.equal(parseTaxPercent("1.234"), null);
  assert.deepEqual(
    taxSideToBps({
      burn: "0",
      liquidity: "0.5",
      marketing: "1",
      rewards: "2.25",
    }),
    { burn: 0, liquidity: 50, marketing: 100, rewards: 225 },
  );
});

test("reserves enough gas for advanced create-and-buy", () => {
  assert.ok(ADVANCED_CREATE_GAS_LIMIT > 8_002_720n);
  assert.equal(advancedCreateGasLimit(7_980_245n), 8_977_776n);
  assert.ok(advancedCreateGasLimit(7_980_245n) < ADVANCED_CREATE_GAS_LIMIT);
  assert.throws(() => advancedCreateGasLimit(11_000_000n), /safety limit/);
});

test("wires the canonical ABI and advanced gas policy into creation", async () => {
  const [page, web3, deployments] = await Promise.all([
    readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./web3.ts", import.meta.url), "utf8"),
    readFile(new URL("./deployments.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /advancedTemplateValue\(template\)/);
  assert.match(page, /estimateContractGas/);
  assert.match(page, /advancedCreateGasLimit/);
  assert.match(page, /writeContractAsync/);
  assert.match(page, /normalizeTaxesForTemplate/);
  assert.match(page, /type="number"/);
  assert.doesNotMatch(page, /tax-slider-control/);
  assert.match(page, /tax-number-control/);
  assert.match(page, /rewardToken/);
  assert.match(page, /validateRewardPool/);
  assert.match(page, /getReserves/);
  assert.ok(
    page.indexOf("await validateRewardPool") <
      page.indexOf("const metadataURI = await uploadMetadata"),
  );
  assert.match(web3, /advancedFactoryAbi/);
  assert.match(web3, /autoLiquidityFactoryAbi = advancedFactoryAbi/);
  assert.match(web3, /rewardsFactoryAbi = advancedFactoryAbi/);
  assert.match(page, /v3StandardFactoryAddress/);
  assert.doesNotMatch(page, /disabled=\{!enabled\}/);
  assert.match(deployments, /0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d/);
  assert.match(deployments, /stale V1 environment variable/);
  assert.match(deployments, /v3StandardFactoryAddress/);
});
