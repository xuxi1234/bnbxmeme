import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  http,
  parseEther,
} from "viem";

const CHAIN_ID = "97";
const API_URL = "https://api.etherscan.io/v2/api";
const apiKey = process.env.BSC_SCAN_API_KEY;
const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
if (!apiKey) throw new Error("BSC_SCAN_API_KEY is required");
if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required");

const root = resolve(import.meta.dirname, "..");
const deployment = JSON.parse(
  readFileSync(resolve(root, "deployments/bsc-testnet.json"), "utf8"),
);
const smoke = JSON.parse(
  readFileSync(resolve(root, "deployments/bsc-testnet-smoke.json"), "utf8"),
);
if (String(deployment.chainId) !== CHAIN_ID || String(smoke.chainId) !== CHAIN_ID) {
  throw new Error("Refusing source verification outside BSC Testnet");
}

const chain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

const tokenAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
];
const curveAbi = [
  ...["factory", "feeRecipient", "creator", "liquidityPair", "wbnb"].map(
    (name) => ({
      type: "function",
      name,
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address" }],
    }),
  ),
  {
    type: "function",
    name: "graduationTarget",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];
const [name, symbol, factory, feeRecipient, creator, pair, wbnb, target] =
  await Promise.all([
    publicClient.readContract({
      address: smoke.token,
      abi: tokenAbi,
      functionName: "name",
    }),
    publicClient.readContract({
      address: smoke.token,
      abi: tokenAbi,
      functionName: "symbol",
    }),
    ...["factory", "feeRecipient", "creator", "liquidityPair", "wbnb", "graduationTarget"].map(
      (functionName) =>
        publicClient.readContract({
          address: smoke.curve,
          abi: curveAbi,
          functionName,
        }),
    ),
  ]);

if (factory.toLowerCase() !== deployment.factory.toLowerCase()) {
  throw new Error("Smoke Curve belongs to a different Factory");
}
if (target % parseEther("1") !== 0n) {
  throw new Error("Curve graduation target is not an integer BNB amount");
}
const targetBNB = target / parseEther("1");
if (targetBNB < 1n || targetBNB > 18n) {
  throw new Error(`Invalid graduation target: ${targetBNB}`);
}

const sourcePaths = [
  "src/BNBXFactory.sol",
  "src/BNBXToken.sol",
  "src/BondingCurve.sol",
  "src/interfaces/IERC20Minimal.sol",
  "src/interfaces/IPancakeV2.sol",
  "src/libraries/FeeMath.sol",
];
const compilerInput = {
  language: "Solidity",
  sources: Object.fromEntries(
    sourcePaths.map((path) => [
      path,
      { content: readFileSync(resolve(root, path), "utf8") },
    ]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 100_000 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const versionMatch = solc.version().match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i);
if (!versionMatch) throw new Error(`Unsupported solc version: ${solc.version()}`);

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

async function verify({ address, contractName, constructorArguments }) {
  const submission = await callApi({
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(compilerInput),
    contractaddress: address,
    contractname: contractName,
    compilerversion: `v${versionMatch[1]}`,
    constructorArguments: constructorArguments.slice(2),
  });
  if (submission.status === "0" && /already verified/i.test(String(submission.result))) {
    console.log(`Source already verified: ${address}`);
    return;
  }
  if (submission.status !== "1") {
    throw new Error(`Source submission failed for ${address}: ${submission.result}`);
  }
  const guid = String(submission.result);
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    const status = await callApi({ action: "checkverifystatus", guid });
    const result = String(status.result);
    if (status.status === "1" || /already verified/i.test(result)) {
      console.log(`Source verified: ${address}`);
      return;
    }
    if (!/pending|queue/i.test(result)) {
      throw new Error(`Source verification failed for ${address}: ${result}`);
    }
  }
  throw new Error(`Source verification still pending for ${address}`);
}

await verify({
  address: smoke.token,
  contractName: "src/BNBXToken.sol:BNBXToken",
  constructorArguments: encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "address" }],
    [name, symbol, factory],
  ),
});
await verify({
  address: smoke.curve,
  contractName: "src/BondingCurve.sol:BondingCurve",
  constructorArguments: encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "address" },
      { type: "uint8" },
      { type: "address" },
      { type: "address" },
    ],
    [smoke.token, factory, feeRecipient, creator, Number(targetBNB), pair, wbnb],
  ),
});
