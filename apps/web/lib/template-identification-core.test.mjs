import assert from "node:assert/strict";
import test from "node:test";
import {
  isAdvancedTemplateFactory,
  isRewardsTemplateFactory,
} from "./template-identification-core.ts";

const factories = {
  autoLiquidity: "0x0000000000000000000000000000000000000001",
  rewards: "0x0000000000000000000000000000000000000002",
  legacyRewards: "0x0000000000000000000000000000000000000003",
  holderRewards: "0xcc1ffca6985658de357f3f5763fd1ff690074625",
};

test("classifies the independent Holder Factory as an advanced rewards template", () => {
  const mixedCaseHolderFactory =
    "0xcc1FFcA6985658DE357f3F5763FD1Ff690074625";

  assert.equal(
    isAdvancedTemplateFactory(mixedCaseHolderFactory, factories),
    true,
  );
  assert.equal(
    isRewardsTemplateFactory(mixedCaseHolderFactory, factories),
    true,
  );
});

test("does not classify the zero-tax Factory as a taxed template", () => {
  const zeroTaxFactory = "0x0000000000000000000000000000000000000004";

  assert.equal(isAdvancedTemplateFactory(zeroTaxFactory, factories), false);
  assert.equal(isRewardsTemplateFactory(zeroTaxFactory, factories), false);
});
