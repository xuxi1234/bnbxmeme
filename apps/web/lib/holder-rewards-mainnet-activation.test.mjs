import assert from "node:assert/strict";
import test from "node:test";
import { officialFactoryAddresses } from "./deployments.ts";
import { resolveFactoryDeploymentBlock } from "./factory-deployment-blocks.ts";

const holderRewardsFactoryAddress =
  "0x31ce11e80875e1d698089f71f06acbb27726db95";

const supersededHolderRewardsFactoryAddress =
  "0xcc1ffca6985658de357f3f5763fd1ff690074625";

test("recognizes the independent Holder Rewards Factory across the public catalog", () => {
  assert.ok(officialFactoryAddresses.includes(holderRewardsFactoryAddress));
  assert.ok(
    !officialFactoryAddresses.includes(supersededHolderRewardsFactoryAddress),
  );
});

test("indexes Holder Rewards projects from the immutable deployment block", () => {
  assert.equal(
    resolveFactoryDeploymentBlock(holderRewardsFactoryAddress, "999"),
    114_424_429n,
  );
});
