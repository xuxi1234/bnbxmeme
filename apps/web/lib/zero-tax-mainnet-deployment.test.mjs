import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeAbiParameters, encodeDeployData, parseAbiParameters } from "viem";
import {
  AUTHORIZED_ZERO_TAX_DEPLOYER,
  ZERO_TAX_DEPLOYMENT_GAS_LIMIT,
  ZERO_TAX_FEE_RECIPIENT,
  ZERO_TAX_MAINNET_ROUTER,
  buildZeroTaxMainnetDeployment,
} from "./zero-tax-mainnet-deployment.ts";
import {
  zeroTaxFactoryDeploymentAbi,
  zeroTaxFactoryDeploymentBytecode,
} from "./zero-tax-factory-deployment.ts";

const deployment = buildZeroTaxMainnetDeployment(
  zeroTaxFactoryDeploymentAbi,
  zeroTaxFactoryDeploymentBytecode,
);
const deploymentPage = await readFile(
  new URL("../app/deploy-zero-tax-mainnet/page.tsx", import.meta.url),
  "utf8",
);

test("zero-tax mainnet page exposes one independent deployment action", () => {
  assert.match(deploymentPage, /zeroTaxMainnetDeployment/);
  assert.match(deploymentPage, /zeroTaxFactoryDeploymentBytecode/);
  assert.doesNotMatch(deploymentPage, /holderRewards|lpRewards|factoryType|<select/);
});

test("encodes the two reviewed immutable mainnet arguments", () => {
  assert.equal(
    AUTHORIZED_ZERO_TAX_DEPLOYER,
    "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2",
  );
  assert.ok(ZERO_TAX_DEPLOYMENT_GAS_LIMIT >= 8_000_000n);
  assert.deepEqual(deployment.args, [
    ZERO_TAX_FEE_RECIPIENT,
    ZERO_TAX_MAINNET_ROUTER,
  ]);
  const data = encodeDeployData(deployment);
  assert.equal(data.slice(0, deployment.bytecode.length), deployment.bytecode);
  const suffix = `0x${data.slice(deployment.bytecode.length)}`;
  assert.deepEqual(
    decodeAbiParameters(parseAbiParameters("address, address"), suffix).map(
      (address) => address.toLowerCase(),
    ),
    deployment.args.map((address) => address.toLowerCase()),
  );
});
