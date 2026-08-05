import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const deploymentPage = await readFile(
  new URL("../app/deploy-testnet/page.tsx", import.meta.url),
  "utf8",
);

test("deploys the independent holder rewards Factory without routing through the legacy deployer", () => {
  assert.match(
    deploymentPage,
    /holderRewardsFactoryBytecode/,
  );
  assert.match(deploymentPage, /"standard" \| "rewards" \| "holderRewards"/);
  assert.match(
    deploymentPage,
    /args: \[FEE_RECIPIENT, pancakeRouter\]/,
  );
  assert.match(
    deploymentPage,
    /holderRewardsDeployment\.deployContract\(/,
  );
  assert.match(deploymentPage, /zeroTaxFactoryDeploymentBytecode/);
  const holderDeploymentFunction = deploymentPage.match(
    /function deployHolderRewardsFactory\(\) \{[\s\S]*?\n  \}/,
  )?.[0];
  assert.ok(holderDeploymentFunction);
  assert.doesNotMatch(
    holderDeploymentFunction,
    /advancedTokenDeployerDeploymentBytecode/,
  );
});
