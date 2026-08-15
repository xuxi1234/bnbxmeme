import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertCompileProof,
  assertDeploymentArtifact,
  assertSafeTree,
  atomicReplaceDirectory,
  containsProhibitedIdentifier,
  stableJson,
} from "./futures-tooling.mjs";

const hash = `0x${"11".repeat(32)}`;
const address = `0x${"22".repeat(20)}`;

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
  extra.internalIdentity = "ADL";
  assert.throws(() => assertDeploymentArtifact(extra));
});

test("prohibited identifiers are detected in prefix, suffix and infix form", () => {
  for (const identifier of ["adl", "adlModule", "moduleAdl", "doAdlNow", "autoDeleverage", "executeAutoDeleverageNow"]) {
    assert.equal(containsProhibitedIdentifier(identifier), true, identifier);
  }
  for (const identifier of ["address", "handle", "gradle", "saddle", "moduleAllowed"]) {
    assert.equal(containsProhibitedIdentifier(identifier), false, identifier);
  }
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
  mkdirSync(target);
  writeFileSync(join(target, "stale.json"), "stale");
  atomicReplaceDirectory(target, (staging) => writeFileSync(join(staging, "fresh.json"), "fresh"));
  assert.equal(readFileSync(join(target, "fresh.json"), "utf8"), "fresh");
  assert.throws(() => readFileSync(join(target, "stale.json")));
  assert.throws(() => atomicReplaceDirectory(target, () => { throw new Error("compile failed"); }));
  assert.equal(readFileSync(join(target, "fresh.json"), "utf8"), "fresh");
});
