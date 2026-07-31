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
  taxes,
  template: 2,
  minimumRewardShare: parseEther("10000"),
};

test("uses the deployed advanced Factory function signatures", () => {
  const calls = [
    {
      functionName: "findVanitySalt",
      args: [
        request.name,
        request.symbol,
        request.marketingWallet,
        request.taxes,
        request.template,
        request.minimumRewardShare,
        0n,
        10_000n,
      ],
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
  assert.equal(advancedTemplateValue("liquidity"), 1);
  assert.equal(advancedTemplateValue("holders"), 2);
  assert.equal(advancedTemplateValue("lp"), 3);
});

test("keeps template taxes deployable when switching templates", () => {
  const empty = emptyTaxSide();
  const rewards = normalizeTaxesForTemplate("holders", empty, empty);
  assert.equal(rewards.buy.rewards, 1);
  assert.equal(rewards.sell.rewards, 1);

  const liquidity = normalizeTaxesForTemplate(
    "liquidity",
    rewards.buy,
    rewards.sell,
  );
  assert.equal(liquidity.buy.rewards, 0);
  assert.equal(liquidity.sell.rewards, 0);

  const standard = normalizeTaxesForTemplate(
    "standard",
    { ...empty, burn: 2 },
    { ...empty, marketing: 3 },
  );
  assert.deepEqual(standard, { buy: emptyTaxSide(), sell: emptyTaxSide() });
});

test("reserves enough gas for advanced create-and-buy", () => {
  assert.ok(ADVANCED_CREATE_GAS_LIMIT > 8_002_720n);
  assert.equal(advancedCreateGasLimit(7_980_245n), 8_977_776n);
  assert.ok(advancedCreateGasLimit(7_980_245n) < ADVANCED_CREATE_GAS_LIMIT);
  assert.throws(() => advancedCreateGasLimit(11_000_000n), /safety limit/);
});

test("wires the canonical ABI and advanced gas policy into creation", async () => {
  const [page, web3] = await Promise.all([
    readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./web3.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /advancedTemplateValue\(template\)/);
  assert.match(page, /estimateContractGas/);
  assert.match(page, /advancedCreateGasLimit/);
  assert.match(page, /writeContractAsync/);
  assert.match(page, /normalizeTaxesForTemplate/);
  assert.match(web3, /advancedFactoryAbi/);
  assert.match(web3, /autoLiquidityFactoryAbi = advancedFactoryAbi/);
  assert.match(web3, /rewardsFactoryAbi = advancedFactoryAbi/);
});
