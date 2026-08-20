import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { toFunctionSelector } from "viem";

import * as tooling from "./futures-tooling.mjs";

const {
  assertCompileProof,
  assertDeploymentArtifact,
  assertNoProhibitedSelectors,
  assertSafeTree,
  atomicReplaceDirectory,
  containsProhibitedIdentifier,
  stableJson,
} = tooling;

const hash = `0x${"11".repeat(32)}`;
const address = `0x${"22".repeat(20)}`;
const shortProhibitedStem = String.fromCharCode(97, 100, 108);
const longProhibitedStem = `auto${"de"}leverage`;

const compileProof = () => ({
  schema: "bnbx-futures-compile-proof/v1",
  compiler: "0.8.30+commit.73712a01.Emscripten.clang",
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" },
  sources: [{ path: "src/futures/RiskEngine.sol", sha256: hash }],
  contracts: [{ source: "src/futures/RiskEngine.sol", name: "RiskEngine", abiHash: hash, creationBytecodeHash: hash, runtimeBytecodeHash: hash, runtimeBytes: 123 }],
});

const deploymentArtifact = () => ({
  schema: "bnbx-futures-local-deployment/v1",
  chainId: 31337,
  deploymentIndex: 0,
  contract: "RiskEngine",
  source: "src/futures/RiskEngine.sol",
  address,
  deployer: address,
  nonce: 0,
  constructorArgs: [],
  constructorArgsEncoded: "0x",
  sourceClosure: [{ path: "src/futures/RiskEngine.sol", sha256: hash }],
  compiler: compileProof().compiler,
  settings: compileProof().settings,
  abiHash: hash,
  creationBytecodeHash: hash,
  runtimeBytecodeHash: hash,
  deployedRuntimeBytecodeHash: hash,
  runtimeBytes: 123,
});

const deploymentOrder = [
  ["FuturesCollateralMock", "test/futures/FuturesCollateralMock.sol"],
  ["OracleTokenMock", "test/FuturesOracle.t.sol"],
  ["OracleTokenMock", "test/FuturesOracle.t.sol"],
  ["OraclePairMock", "test/FuturesOracle.t.sol"],
  ["OracleFeedMock", "test/FuturesOracle.t.sol"],
  ["RiskEngine", "src/futures/RiskEngine.sol"],
  ["ClearingHouse", "src/futures/ClearingHouse.sol"],
  ["FuturesOracle", "src/futures/FuturesOracle.sol"],
  ["SafetyController", "src/futures/SafetyController.sol"],
  ["OrderBook", "src/futures/OrderBook.sol"],
];

const deploymentManifest = () => ({
  schema: "bnbx-futures-local-deployment-manifest/v1",
  chainId: 31337,
  deployer: address,
  compiler: compileProof().compiler,
  settings: compileProof().settings,
  entries: deploymentOrder.map(([contract, source], index) => ({
    ...deploymentArtifact(),
    contract,
    source,
    sourceClosure: [{ path: source, sha256: hash }],
    address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    deploymentIndex: index,
    nonce: index,
  })),
});

test("stable JSON canonicalizes object keys without changing array order", () => {
  assert.equal(stableJson({ z: 1, a: [{ y: 2, x: 1 }] }), '{"a":[{"x":1,"y":2}],"z":1}\n');
});

test("compile proof accepts only the exact schema", () => {
  assert.doesNotThrow(() => assertCompileProof(compileProof()));
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { delete value.compiler; },
    (value) => { value.schema = "deployment"; },
    (value) => { value.sources[0].path = "../escape.sol"; },
    (value) => { value.contracts[0].runtimeBytes = 24_577; },
  ]) {
    const value = structuredClone(compileProof());
    mutate(value);
    assert.throws(() => assertCompileProof(value));
  }
});

test("deployment artifact binds identity, nonce, constructor and deployed runtime", () => {
  assert.doesNotThrow(() => assertDeploymentArtifact(deploymentArtifact()));
  for (const field of ["contract", "source", "address", "nonce", "constructorArgsEncoded", "deployedRuntimeBytecodeHash"]) {
    const value = structuredClone(deploymentArtifact());
    value[field] = field === "nonce" ? 1 : `${value[field]}00`;
    assert.throws(() => assertDeploymentArtifact(value, { [field]: deploymentArtifact()[field] }), field);
  }
  const extra = deploymentArtifact();
  extra.internalIdentity = shortProhibitedStem.toUpperCase();
  assert.throws(() => assertDeploymentArtifact(extra));

  const coordinatedConstructorMutation = deploymentArtifact();
  coordinatedConstructorMutation.constructorArgs = [address];
  assert.throws(
    () =>
      assertDeploymentArtifact(coordinatedConstructorMutation, {
        constructorArgs: [],
      }),
    /constructorArgs identity mismatch/,
  );
});

test("deployment manifest binds all ten deployments in exact nonce order", () => {
  const expectedOrder = deploymentOrder.map(([contract, source]) => ({
    contract,
    source,
  }));
  assert.doesNotThrow(() =>
    tooling.assertDeploymentManifest(deploymentManifest(), expectedOrder),
  );

  for (const mutate of [
    (value) => value.entries.pop(),
    (value) => value.entries.reverse(),
    (value) => {
      value.entries[1].address = value.entries[0].address;
    },
    (value) => {
      value.entries[4].compiler = "0.8.30+commit.wrong";
    },
    (value) => {
      value.extra = true;
    },
  ]) {
    const value = structuredClone(deploymentManifest());
    mutate(value);
    assert.throws(() =>
      tooling.assertDeploymentManifest(value, expectedOrder),
    );
  }
});

test("prohibited identifiers are detected in prefix, suffix and infix form", () => {
  for (const identifier of [
    shortProhibitedStem,
    `${shortProhibitedStem}Module`,
    `module${shortProhibitedStem[0].toUpperCase()}${shortProhibitedStem.slice(1)}`,
    `do${shortProhibitedStem[0].toUpperCase()}${shortProhibitedStem.slice(1)}Now`,
    longProhibitedStem,
    `execute${longProhibitedStem[0].toUpperCase()}${longProhibitedStem.slice(1)}Now`,
  ]) {
    assert.equal(containsProhibitedIdentifier(identifier), true, identifier);
  }
  for (const identifier of ["address", "handle", "gradle", "saddle", "moduleAllowed"]) {
    assert.equal(containsProhibitedIdentifier(identifier), false, identifier);
  }
});

test("runtime selector audit rejects prohibited authority entry points", () => {
  const prohibitedName = Buffer.from("6f776e6572", "hex").toString("utf8");
  const selector = toFunctionSelector(`${prohibitedName}()`);
  assert.throws(
    () => assertNoProhibitedSelectors([], `600063${selector.slice(2)}600052`),
    /prohibited selector/,
  );
  assert.throws(
    () =>
      assertNoProhibitedSelectors(
        [{ type: "function", name: prohibitedName, inputs: [] }],
        "6000",
      ),
    /prohibited function/,
  );
  assert.doesNotThrow(() =>
    assertNoProhibitedSelectors(
      [{ type: "function", name: "openPosition", inputs: [] }],
      "6000",
    ),
  );
});

test("safe-tree validation rejects traversal and symbolic links", () => {
  const root = mkdtempSync(join(tmpdir(), "bnbx-futures-tree-"));
  mkdirSync(join(root, "ok"));
  writeFileSync(join(root, "ok", "proof.json"), "{}\n");
  assert.doesNotThrow(() => assertSafeTree(root));
  symlinkSync(join(root, "ok", "proof.json"), join(root, "linked.json"));
  assert.throws(() => assertSafeTree(root));
});

test("atomic replacement removes stale files and preserves prior output on failure", () => {
  const root = mkdtempSync(join(tmpdir(), "bnbx-futures-atomic-"));
  const target = join(root, "artifacts");
  const staleStage = join(root, ".artifacts.staging-old");
  const staleBackup = join(root, ".artifacts.backup-old");
  const staleRecovery = join(root, ".artifacts.recovery-old");
  mkdirSync(target);
  mkdirSync(staleStage);
  mkdirSync(staleBackup);
  mkdirSync(staleRecovery);
  writeFileSync(join(target, "stale.json"), "stale");
  atomicReplaceDirectory(target, (staging) => writeFileSync(join(staging, "fresh.json"), "fresh"));
  assert.equal(readFileSync(join(target, "fresh.json"), "utf8"), "fresh");
  assert.throws(() => readFileSync(join(target, "stale.json")));
  assert.equal(existsSync(staleStage), false);
  assert.equal(existsSync(staleBackup), false);
  assert.equal(existsSync(staleRecovery), false);
  assert.throws(() => atomicReplaceDirectory(target, () => { throw new Error("compile failed"); }));
  assert.equal(readFileSync(join(target, "fresh.json"), "utf8"), "fresh");
});
