import assert from "node:assert/strict";
import test from "node:test";
import { officialFactoryAddresses } from "./deployments.ts";
import { resolveFactoryDeploymentBlock } from "./factory-deployment-blocks.ts";

const holderRewardsFactoryAddress =
  "0xcc1ffca6985658de357f3f5763fd1ff690074625";

test("recognizes the independent Holder Rewards Factory across the public catalog", () => {
  assert.ok(officialFactoryAddresses.includes(holderRewardsFactoryAddress));
});

test("indexes Holder Rewards projects from the immutable deployment block", () => {
  assert.equal(
    resolveFactoryDeploymentBlock(holderRewardsFactoryAddress, "999"),
    114_097_606n,
  );
});
