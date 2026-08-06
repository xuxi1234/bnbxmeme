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
  AUTHORIZED_HOLDER_REWARDS_DEPLOYER,
  HOLDER_REWARDS_DEFAULT_USDT,
  HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT,
  HOLDER_REWARDS_FEE_RECIPIENT,
  HOLDER_REWARDS_MAINNET_ROUTER,
  buildHolderRewardsMainnetDeployment,
} from "./holder-rewards-mainnet-deployment.ts";
import {
  holderRewardsFactoryAbi,
  holderRewardsFactoryBytecode,
} from "./holder-rewards-factory-deployment.ts";

const holderRewardsMainnetDeployment = buildHolderRewardsMainnetDeployment(
  holderRewardsFactoryAbi,
  holderRewardsFactoryBytecode,
);

const deploymentPage = await readFile(
  new URL("../app/deploy-mainnet/page.tsx", import.meta.url),
  "utf8",
);

test("mainnet deployment gas limit exceeds the measured Holder V2 requirement", () => {
  const measuredDeploymentEstimate = 8_151_233n;
  assert.ok(
    HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT > measuredDeploymentEstimate,
    `deployment gas limit ${HOLDER_REWARDS_DEPLOYMENT_GAS_LIMIT} must exceed measured estimate ${measuredDeploymentEstimate}`,
  );
});

test("exposes one Holder V2 mainnet deployment action and no legacy choices", () => {
  assert.match(deploymentPage, /holderRewardsMainnetDeployment/);
  assert.match(deploymentPage, /useDeployContract/);
  assert.doesNotMatch(deploymentPage, /<select/);
  assert.doesNotMatch(deploymentPage, /factoryType/);
  assert.doesNotMatch(deploymentPage, /configureManager/);
  assert.doesNotMatch(deploymentPage, /advancedTokenDeployer/);
  assert.doesNotMatch(deploymentPage, /rewardsFactoryDeployment/);
  assert.doesNotMatch(deploymentPage, /deployStandardFactory/);
});

test("encodes the reviewed bytecode and exactly three immutable mainnet arguments", () => {
  assert.equal(
    AUTHORIZED_HOLDER_REWARDS_DEPLOYER,
    "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2",
  );
  assert.deepEqual(holderRewardsMainnetDeployment.args, [
    HOLDER_REWARDS_FEE_RECIPIENT,
    HOLDER_REWARDS_MAINNET_ROUTER,
    HOLDER_REWARDS_DEFAULT_USDT,
  ]);

  const data = encodeDeployData(holderRewardsMainnetDeployment);
  const bytecode = holderRewardsMainnetDeployment.bytecode;
  assert.equal(data.slice(0, bytecode.length), bytecode);
  assert.equal(
    keccak256(bytecode),
    "0x6a63a60033c6e39ced4c68ec4be27e1a54bc94d0dfeaeed5bb6aa190c4e4d336",
  );
  const suffix = `0x${data.slice(bytecode.length)}`;
  assert.deepEqual(
    decodeAbiParameters(
      parseAbiParameters("address, address, address"),
      suffix,
    ).map((address) => address.toLowerCase()),
    holderRewardsMainnetDeployment.args.map((address) => address.toLowerCase()),
  );
});
