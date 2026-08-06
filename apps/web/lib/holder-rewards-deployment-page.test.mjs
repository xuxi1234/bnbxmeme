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
    "0xbac03db40596b0ad0b5f1c445592a6cc897a57dbbf2d4d7e5b60d47b03ef4573",
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
