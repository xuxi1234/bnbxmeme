import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFuturesTestnetManifest,
  compileFuturesTestnet,
  FUTURES_TESTNET_CHAIN_ID,
  parseFuturesTestnetConfig,
} from "./futures-testnet-core.mjs";

const API_URL = "https://api.etherscan.io/v2/api";
const root = resolve(import.meta.dirname, "..");
const config = parseFuturesTestnetConfig(process.env);
const apiKey = process.env.BSC_SCAN_API_KEY;
if (!apiKey) throw new Error("BSC_SCAN_API_KEY is required");
const { artifacts, compiler, compilerInput } = compileFuturesTestnet(root);
const manifest = assertFuturesTestnetManifest(
  JSON.parse(
    readFileSync(resolve(root, "deployments/bsc-testnet-futures.json"), "utf8"),
  ),
  artifacts,
);
if (
  manifest.chainId !== FUTURES_TESTNET_CHAIN_ID ||
  config.chainId !== FUTURES_TESTNET_CHAIN_ID
)
  throw new Error("refusing non-testnet verification");
const version = compiler.match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i)?.[1];
if (!version) throw new Error("unsupported compiler version");

async function callApi(parameters) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      apikey: apiKey,
      chainid: `${FUTURES_TESTNET_CHAIN_ID}`,
      module: "contract",
      ...parameters,
    }),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`source verification HTTP ${response.status}`);
  return response.json();
}

const results = [];
for (const entry of manifest.entries) {
  const submission = await callApi({
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(compilerInput),
    contractaddress: entry.address,
    contractname: `${entry.source}:${entry.contract}`,
    compilerversion: `v${version}`,
    constructorArguments: entry.constructorArgsEncoded.slice(2),
  });
  if (
    submission.status === "0" &&
    /already verified/i.test(`${submission.result}`)
  ) {
    results.push({
      contract: entry.contract,
      address: entry.address,
      status: "already-verified",
    });
    continue;
  }
  if (submission.status !== "1")
    throw new Error(
      `${entry.contract} verification submission failed: ${submission.result}`,
    );
  const guid = `${submission.result}`;
  let verified = false;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    const status = await callApi({ action: "checkverifystatus", guid });
    const message = `${status.result}`;
    if (status.status === "1" || /already verified/i.test(message)) {
      verified = true;
      break;
    }
    if (!/pending|queue/i.test(message))
      throw new Error(
        `${entry.contract} source verification failed: ${message}`,
      );
  }
  if (!verified)
    throw new Error(`${entry.contract} verification remained pending`);
  results.push({
    contract: entry.contract,
    address: entry.address,
    status: "verified",
  });
}
const proof = {
  schema: "bnbx-futures-testnet-source-verification/v1",
  chainId: FUTURES_TESTNET_CHAIN_ID,
  verifiedAt: new Date().toISOString(),
  compiler,
  entries: results,
};
const directory = resolve(root, "deployments");
mkdirSync(directory, { recursive: true });
const target = resolve(directory, "bsc-testnet-futures-verification.json");
const staging = `${target}.tmp`;
writeFileSync(staging, `${JSON.stringify(proof, null, 2)}\n`);
renameSync(staging, target);
console.log(JSON.stringify(proof, null, 2));
