import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertCompileProof,
  assertDeploymentManifest,
  stableJson,
} from "./futures-tooling.mjs";

const root = resolve(import.meta.dirname, "..");
const buildScript = resolve(import.meta.dirname, "futures-build.mjs");
const auditScript = resolve(import.meta.dirname, "futures-audit.mjs");
const expectedOrder = [
  { contract: "FuturesCollateralMock", source: "test/futures/FuturesCollateralMock.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OraclePairMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleFeedMock", source: "test/FuturesOracle.t.sol" },
  { contract: "RiskEngine", source: "src/futures/RiskEngine.sol" },
  { contract: "ClearingHouse", source: "src/futures/ClearingHouse.sol" },
  { contract: "FuturesOracle", source: "src/futures/FuturesOracle.sol" },
  { contract: "SafetyController", source: "src/futures/SafetyController.sol" },
  { contract: "OrderBook", source: "src/futures/OrderBook.sol" },
];
const expectedAddresses = [
  "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0",
  "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9",
  "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
  "0x5fc8d32690cc91d4c39d9d3abcbd16989f875707",
  "0x0165878a594ca255338adfa4d48449f69242eb8f",
  "0xa513e6e4b8f2a923d98304ec87f64353c4d5c853",
  "0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6",
  "0x8a791620dd6260079bf849dc5567adc3f2fdc318",
];
const expectedFiles = [
  "00-collateral.json",
  "01-bnbx-token.json",
  "02-wbnb-token.json",
  "03-pair.json",
  "04-feed.json",
  "05-risk-engine.json",
  "06-clearing-house.json",
  "07-oracle.json",
  "08-safety-controller.json",
  "09-order-book.json",
  "manifest.json",
];

const run = (script, compileDirectory, deploymentDirectory) =>
  spawnSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      FUTURES_COMPILE_DIR: compileDirectory,
      FUTURES_DEPLOYMENT_DIR: deploymentDirectory,
    },
    encoding: "utf8",
  });

const readOutputs = (compileDirectory, deploymentDirectory) => {
  const proof = JSON.parse(
    readFileSync(join(compileDirectory, "futures.compile-proof.json"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(join(deploymentDirectory, "manifest.json"), "utf8"),
  );
  assertCompileProof(proof);
  assertDeploymentManifest(manifest, expectedOrder);
  return { proof, manifest };
};

test("fresh Ganache builds the exact ten-address deterministic deployment", () => {
  const first = mkdtempSync(join(tmpdir(), "bnbx-futures-deployment-first-"));
  const second = mkdtempSync(join(tmpdir(), "bnbx-futures-deployment-second-"));
  const firstCompile = join(first, "compile");
  const firstDeployment = join(first, "deployments");
  const secondCompile = join(second, "compile");
  const secondDeployment = join(second, "deployments");

  const firstRun = run(buildScript, firstCompile, firstDeployment);
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  assert.deepEqual(readdirSync(firstDeployment).sort(), expectedFiles);
  const firstOutputs = readOutputs(firstCompile, firstDeployment);
  assert.deepEqual(
    firstOutputs.manifest.entries.map(({ address }) => address.toLowerCase()),
    expectedAddresses,
  );

  writeFileSync(join(firstDeployment, "removed-module.json"), "{}\n");
  const cleanRun = run(buildScript, firstCompile, firstDeployment);
  assert.equal(cleanRun.status, 0, cleanRun.stderr || cleanRun.stdout);
  assert.deepEqual(readdirSync(firstDeployment).sort(), expectedFiles);

  const secondRun = run(buildScript, secondCompile, secondDeployment);
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  const secondOutputs = readOutputs(secondCompile, secondDeployment);
  assert.equal(
    stableJson(firstOutputs.proof),
    stableJson(secondOutputs.proof),
  );
  assert.equal(
    stableJson(firstOutputs.manifest),
    stableJson(secondOutputs.manifest),
  );
});

test("independent audit rejects coordinated artifact tampering", () => {
  const directory = mkdtempSync(join(tmpdir(), "bnbx-futures-audit-"));
  const compileDirectory = join(directory, "compile");
  const deploymentDirectory = join(directory, "deployments");
  const build = run(buildScript, compileDirectory, deploymentDirectory);
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const cleanAudit = run(auditScript, compileDirectory, deploymentDirectory);
  assert.equal(cleanAudit.status, 0, cleanAudit.stderr || cleanAudit.stdout);

  const artifactPath = join(deploymentDirectory, "05-risk-engine.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  artifact.contract = "RiskEngineReplacement";
  writeFileSync(artifactPath, stableJson(artifact));
  const tamperedAudit = run(auditScript, compileDirectory, deploymentDirectory);
  assert.notEqual(tamperedAudit.status, 0);
});
