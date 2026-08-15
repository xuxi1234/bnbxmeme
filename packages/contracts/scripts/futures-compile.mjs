import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import { assertCompileProof, containsProhibitedIdentifier, stableJson } from "./futures-tooling.mjs";

const root = resolve(import.meta.dirname, "..");
const sourcePaths = [
  "src/futures/ClearingHouse.sol",
  "src/futures/FuturesOracle.sol",
  "src/futures/FuturesTypes.sol",
  "src/futures/OrderBook.sol",
  "src/futures/RiskEngine.sol",
  "src/futures/SafetyController.sol",
];
const deployable = new Set(["ClearingHouse", "FuturesOracle", "OrderBook", "RiskEngine", "SafetyController"]);
const digest = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;
const sources = Object.fromEntries(sourcePaths.map((path) => [path, { content: readFileSync(resolve(root, path), "utf8") }]));
const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" };
const input = { language: "Solidity", sources, settings: { ...settings, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(({ severity }) => severity === "error");
if (errors.length) throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));

const contracts = Object.entries(output.contracts).flatMap(([source, artifacts]) => Object.entries(artifacts).filter(([name]) => deployable.has(name)).map(([name, artifact]) => {
  const runtime = artifact.evm.deployedBytecode.object;
  if (containsProhibitedIdentifier(`${source} ${name} ${JSON.stringify(artifact.abi)}`)) throw new Error(`${name} exposes a prohibited identifier`);
  return { source, name, abiHash: digest(stableJson(artifact.abi)), creationBytecodeHash: digest(artifact.evm.bytecode.object), runtimeBytecodeHash: digest(runtime), runtimeBytes: runtime.length / 2 };
})).sort((left, right) => `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`));
const proof = {
  schema: "bnbx-futures-compile-proof/v1",
  compiler: solc.version(),
  settings,
  sources: sourcePaths.map((path) => ({ path, sha256: digest(sources[path].content) })),
  contracts,
};
assertCompileProof(proof);
const destination = resolve(root, process.env.FUTURES_COMPILE_PROOF ?? ".futures-compile/futures.compile-proof.json");
writeFileSync(destination, stableJson(proof), { flag: "w" });
console.log(`WROTE ${destination}`);
