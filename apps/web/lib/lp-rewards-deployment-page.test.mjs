import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decodeAbiParameters,
  encodeDeployData,
  keccak256,
  parseAbiParameters,
} from "viem";
import {
  AUTHORIZED_LP_REWARDS_DEPLOYER,
  LP_REWARDS_DEFAULT_USDT,
  LP_REWARDS_DEPLOYMENT_GAS_LIMIT,
  LP_REWARDS_FEE_RECIPIENT,
  LP_REWARDS_MAINNET_ROUTER,
  buildLPRewardsMainnetDeployment,
} from "./lp-rewards-mainnet-deployment.ts";
import {
  lpRewardsFactoryAbi,
  lpRewardsFactoryBytecode,
} from "./lp-rewards-factory-deployment.ts";

const deployment = buildLPRewardsMainnetDeployment(
  lpRewardsFactoryAbi,
  lpRewardsFactoryBytecode,
);
const deploymentPage = await readFile(
  new URL("../app/deploy-lp-rewards-mainnet/page.tsx", import.meta.url),
  "utf8",
);

test("LP V2 deploy page uses only its independent artifact and action", () => {
  assert.match(deploymentPage, /lpRewardsMainnetDeployment/);
  assert.match(deploymentPage, /lpRewardsFactoryBytecode/);
  assert.doesNotMatch(deploymentPage, /holderRewards/);
  assert.doesNotMatch(deploymentPage, /rewardsFactoryDeployment/);
  assert.doesNotMatch(deploymentPage, /<select/);
});

test("encodes exactly the reviewed LP V2 constructor arguments", () => {
  assert.equal(
    AUTHORIZED_LP_REWARDS_DEPLOYER,
    "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2",
  );
  assert.ok(LP_REWARDS_DEPLOYMENT_GAS_LIMIT >= 10_000_000n);
  assert.deepEqual(deployment.args, [
    LP_REWARDS_FEE_RECIPIENT,
    LP_REWARDS_MAINNET_ROUTER,
    LP_REWARDS_DEFAULT_USDT,
  ]);

  const data = encodeDeployData(deployment);
  assert.equal(data.slice(0, deployment.bytecode.length), deployment.bytecode);
  assert.equal(keccak256(deployment.bytecode).length, 66);
  const suffix = `0x${data.slice(deployment.bytecode.length)}`;
  assert.deepEqual(
    decodeAbiParameters(
      parseAbiParameters("address, address, address"),
      suffix,
    ).map((address) => address.toLowerCase()),
    deployment.args.map((address) => address.toLowerCase()),
  );
});
