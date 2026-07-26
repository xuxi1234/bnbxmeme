import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import { encodeAbiParameters } from "viem";

const CHAIN_ID = "97";
const API_URL = "https://api.etherscan.io/v2/api";
const apiKey = process.env.BSC_SCAN_API_KEY;

if (!apiKey) throw new Error("BSC_SCAN_API_KEY is required");

const root = resolve(import.meta.dirname, "..");
const deployment = JSON.parse(
  readFileSync(resolve(root, "deployments/bsc-testnet.json"), "utf8"),
);
if (String(deployment.chainId) !== CHAIN_ID) {
  throw new Error(`Refusing verification for chain ID ${deployment.chainId}`);
}

const sourcePaths = [
  "src/BNBXFactory.sol",
  "src/BNBXToken.sol",
  "src/BondingCurve.sol",
  "src/interfaces/IERC20Minimal.sol",
  "src/interfaces/IPancakeV2.sol",
  "src/libraries/FeeMath.sol",
];
const sources = Object.fromEntries(
  sourcePaths.map((path) => [
    path,
    { content: readFileSync(resolve(root, path), "utf8") },
  ]),
);
const compilerInput = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const versionMatch = solc.version().match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i);
if (!versionMatch) throw new Error(`Unsupported solc version: ${solc.version()}`);
const constructorArguments = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }],
  [deployment.feeRecipient, deployment.pancakeV2Router],
).slice(2);

async function callApi(parameters) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      apikey: apiKey,
      chainid: CHAIN_ID,
      module: "contract",
      ...parameters,
    }),
  });
  if (!response.ok) throw new Error(`Source verification HTTP ${response.status}`);
  return response.json();
}

const submission = await callApi({
  action: "verifysourcecode",
  codeformat: "solidity-standard-json-input",
  sourceCode: JSON.stringify(compilerInput),
  contractaddress: deployment.factory,
  contractname: "src/BNBXFactory.sol:BNBXFactory",
  compilerversion: `v${versionMatch[1]}`,
  constructorArguments,
});
if (submission.status === "0" && /already verified/i.test(String(submission.result))) {
  console.log(`Factory source is already verified: ${deployment.factory}`);
  process.exit(0);
}
if (submission.status !== "1") {
  throw new Error(`Source verification submission failed: ${submission.result}`);
}

const guid = String(submission.result);
console.log(`Source submitted for ${deployment.factory}; waiting for result.`);
for (let attempt = 1; attempt <= 12; attempt += 1) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  const status = await callApi({ action: "checkverifystatus", guid });
  const result = String(status.result);
  if (status.status === "1" || /already verified/i.test(result)) {
    console.log(`Factory source verified: ${deployment.factory}`);
    process.exit(0);
  }
  if (!/pending|queue/i.test(result)) {
    throw new Error(`Source verification failed: ${result}`);
  }
  console.log(`Verification pending (${attempt}/12).`);
}
throw new Error("Source verification is still pending after 60 seconds");
