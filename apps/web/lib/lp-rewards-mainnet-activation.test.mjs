import assert from "node:assert/strict";
import test from "node:test";
import {
  lpRewardsFactoryAddress,
  officialFactoryAddresses,
} from "./deployments.ts";

const deployedLPRewardsFactory =
  "0x33aa029dffbb8e5c4c039ac4af7da61e019f7122";

test("production enables the verified independent LP Rewards V2 factory", () => {
  assert.equal(lpRewardsFactoryAddress, deployedLPRewardsFactory);
  assert.ok(officialFactoryAddresses.includes(deployedLPRewardsFactory));
});
