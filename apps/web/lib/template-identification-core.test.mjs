import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTemplateTaxes,
  isAdvancedTemplateFactory,
  isRewardsTemplateFactory,
} from "./template-identification-core.ts";

const factories = {
  autoLiquidity: "0x0000000000000000000000000000000000000001",
  rewards: "0x0000000000000000000000000000000000000002",
  legacyRewards: "0x0000000000000000000000000000000000000003",
  holderRewards: "0xb814fde8835e9081698d997609ce47031a3ca294",
};

test("classifies the independent Holder Factory as an advanced rewards template", () => {
  const mixedCaseHolderFactory =
    "0xB814fDE8835E9081698D997609Ce47031A3cA294";

  assert.equal(
    isAdvancedTemplateFactory(mixedCaseHolderFactory, factories),
    true,
  );
  assert.equal(
    isRewardsTemplateFactory(mixedCaseHolderFactory, factories),
    true,
  );
});

test("maps an independent Holder token's reward-only tax into the public allocation", () => {
  assert.deepEqual(
    resolveTemplateTaxes({
      independentHolderRewards: true,
      buyRewardTaxBps: 300,
      sellRewardTaxBps: 500,
    }),
    {
      buy: [0, 0, 0, 300],
      sell: [0, 0, 0, 500],
    },
  );
});

test("prefers Holder V2 liquidity rewards and burn triples", () => {
  assert.deepEqual(
    resolveTemplateTaxes({
      independentHolderRewards: true,
      holderBuyTaxes: [200, 300, 100],
      holderSellTaxes: [250, 350, 150],
      buyRewardTaxBps: 999,
      sellRewardTaxBps: 999,
    }),
    {
      buy: [100, 200, 0, 300],
      sell: [150, 250, 0, 350],
    },
  );
});

test("does not classify the zero-tax Factory as a taxed template", () => {
  const zeroTaxFactory = "0x0000000000000000000000000000000000000004";

  assert.equal(isAdvancedTemplateFactory(zeroTaxFactory, factories), false);
  assert.equal(isRewardsTemplateFactory(zeroTaxFactory, factories), false);
});
