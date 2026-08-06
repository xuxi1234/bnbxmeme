import assert from "node:assert/strict";
import test from "node:test";
import {
  lpRewardsFactoryAddress,
  officialFactoryAddresses,
} from "./deployments.ts";

const deployedLPRewardsFactory =
  "0xa887212925aaa9dee93c1379f7a8119384cf9157";

test("production enables the verified independent LP Rewards V2 factory", () => {
  assert.equal(lpRewardsFactoryAddress, deployedLPRewardsFactory);
  assert.ok(officialFactoryAddresses.includes(deployedLPRewardsFactory));
});
