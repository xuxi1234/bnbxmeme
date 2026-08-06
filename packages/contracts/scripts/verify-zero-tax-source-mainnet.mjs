import { resolve } from "node:path";
import solc from "solc";
import {
  createPublicClient,
  encodeAbiParameters,
  fallback,
  getAddress,
  http,
} from "viem";
import { bsc } from "viem/chains";
import { createZeroTaxVerificationInputs } from "./verification-compiler-input.mjs";

const CHAIN_ID = "56";
const API_URL = "https://api.etherscan.io/v2/api";
const EXPECTED_FEE_RECIPIENT = "0xDAF4f62914f7F64c9eabFd473F4dB4b7e74048A6";
const EXPECTED_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const dryRun = process.env.VERIFY_DRY_RUN === "1";
const apiKey = process.env.BSC_SCAN_API_KEY;
const factoryInput = process.env.BNBX_ZERO_TAX_FACTORY_ADDRESS;
const verifyLaunchedTokens = process.env.VERIFY_LAUNCHED_TOKENS !== "0";
const root = resolve(import.meta.dirname, "..");
const verificationInputs = createZeroTaxVerificationInputs(root);

const versionMatch = solc
  .version()
  .match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i);
if (!versionMatch)
  throw new Error(`Unsupported solc version: ${solc.version()}`);

const validatedCompilerInputs = new Set();
function validateCompilerInput(label, compilerInput) {
  const serialized = JSON.stringify(compilerInput);
  if (validatedCompilerInputs.has(serialized)) return;
  const output = JSON.parse(solc.compile(serialized));
  const errors = (output.errors ?? []).filter(
    (item) => item.severity === "error",
  );
  if (errors.length) {
    throw new Error(
      `${label} verification input failed:\n${errors
        .map((item) => item.formattedMessage)
        .join("\n")}`,
    );
  }
  validatedCompilerInputs.add(serialized);
}

if (dryRun && !factoryInput) {
  for (const [label, input] of Object.entries(verificationInputs)) {
    validateCompilerInput(label, input);
  }
  console.log(
    JSON.stringify(
      {
        status: "compiled",
        compiler: `v${versionMatch[1]}`,
        optimizerRuns: 200,
        evmVersion: "shanghai",
        verificationBundles: Object.fromEntries(
          Object.entries(verificationInputs).map(([label, input]) => [
            label,
            Object.keys(input.sources),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!factoryInput) {
  throw new Error("BNBX_ZERO_TAX_FACTORY_ADDRESS is required");
}
if (!dryRun && !apiKey) throw new Error("BSC_SCAN_API_KEY is required");

const factory = getAddress(factoryInput);
const configuredRpcUrls = (process.env.BSC_MAINNET_RPC_URL ?? "")
  .split(/\s+/)
  .map((url) => url.trim())
  .filter(Boolean);
const rpcUrls = configuredRpcUrls.length
  ? configuredRpcUrls
  : ["https://bsc-rpc.publicnode.com", "https://bsc.drpc.org"];
const client = createPublicClient({
  chain: bsc,
  transport: fallback(
    rpcUrls.map((url) => http(url, { timeout: 20_000, retryCount: 2 })),
  ),
});

const addressReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];
const uintReadAbi = (name, type = "uint256") => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type }],
  },
];
const stringReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
];
const indexedAddressReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
];
const mappedAddressReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address" }],
  },
];
const readValue = (address, abi, functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });
const readAddress = (address, name) =>
  readValue(address, addressReadAbi(name), name);

function requireAddress(actual, expected, label) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch: ${actual}`);
  }
}

async function requireCode(address, label) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no bytecode: ${address}`);
  }
}

async function callApi(parameters) {
  const response = await fetch(`${API_URL}?chainid=${CHAIN_ID}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      apikey: apiKey,
      module: "contract",
      ...parameters,
    }),
  });
  if (!response.ok) throw new Error(`Verification API HTTP ${response.status}`);
  return response.json();
}

async function verify(
  address,
  contractName,
  constructorArguments,
  compilerInput,
  label,
) {
  validateCompilerInput(label, compilerInput);
  if (dryRun) {
    console.log(
      `○ ${label} ${contractName} ${address} (${Object.keys(compilerInput.sources).length} sources)`,
    );
    return;
  }

  const submission = await callApi({
    action: "verifysourcecode",
    codeformat: "solidity-standard-json-input",
    sourceCode: JSON.stringify(compilerInput),
    contractaddress: address,
    contractname: contractName,
    compilerversion: `v${versionMatch[1]}`,
    optimizationUsed: "1",
    runs: "200",
    evmversion: "shanghai",
    licenseType: "3",
    constructorArguments: constructorArguments.slice(2),
  });
  const result = String(submission.result);
  if (
    submission.status === "0" &&
    /already verified|source code already verified/i.test(result)
  ) {
    console.log(`✓ already verified ${contractName} ${address}`);
    return;
  }
  if (submission.status !== "1") {
    throw new Error(`Verification submission failed for ${address}: ${result}`);
  }

  for (let attempt = 1; attempt <= 18; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    const status = await callApi({
      action: "checkverifystatus",
      guid: result,
    });
    const statusResult = String(status.result);
    if (status.status === "1" || /already verified/i.test(statusResult)) {
      console.log(`✓ verified ${contractName} ${address}`);
      return;
    }
    if (!/pending|queue/i.test(statusResult)) {
      throw new Error(`Verification failed for ${address}: ${statusResult}`);
    }
  }
  throw new Error(`Verification timed out for ${address}`);
}

const [chainId, feeRecipient, router] = await Promise.all([
  client.getChainId(),
  readAddress(factory, "feeRecipient"),
  readAddress(factory, "pancakeV2Router"),
]);
if (chainId !== 56)
  throw new Error(`Refusing verification on chain ${chainId}`);
await requireCode(factory, "Zero-tax Factory");
requireAddress(feeRecipient, EXPECTED_FEE_RECIPIENT, "Fee recipient");
requireAddress(router, EXPECTED_ROUTER, "Pancake V2 Router");

await verify(
  factory,
  "src/BNBXZeroTaxFactory.sol:BNBXZeroTaxFactory",
  encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [feeRecipient, router],
  ),
  verificationInputs.factory,
  "zero-tax-factory",
);

let tokenCount = 0n;
if (verifyLaunchedTokens) {
  tokenCount = await readValue(
    factory,
    uintReadAbi("tokenCount"),
    "tokenCount",
  );
  const maxTokens = BigInt(process.env.BNBX_VERIFY_MAX_TOKENS || "250");
  if (tokenCount > maxTokens) {
    throw new Error(
      `Zero-tax Factory has ${tokenCount} tokens; raise BNBX_VERIFY_MAX_TOKENS to verify all`,
    );
  }

  for (let index = 0n; index < tokenCount; index += 1n) {
    const token = await readValue(
      factory,
      indexedAddressReadAbi("allTokens"),
      "allTokens",
      [index],
    );
    const curve = await readValue(
      factory,
      mappedAddressReadAbi("curveOf"),
      "curveOf",
      [token],
    );
    await Promise.all([
      requireCode(token, "Zero-tax token"),
      requireCode(curve, "BondingCurve"),
    ]);

    const [name, symbol] = await Promise.all([
      readValue(token, stringReadAbi("name"), "name"),
      readValue(token, stringReadAbi("symbol"), "symbol"),
    ]);
    await verify(
      token,
      "src/BNBXZeroTaxToken.sol:BNBXZeroTaxToken",
      encodeAbiParameters(
        [{ type: "string" }, { type: "string" }, { type: "address" }],
        [name, symbol, factory],
      ),
      verificationInputs.token,
      "zero-tax-token",
    );

    const [curveFee, creator, pair, wbnb, graduationTarget] = await Promise.all(
      [
        readAddress(curve, "feeRecipient"),
        readAddress(curve, "creator"),
        readAddress(curve, "liquidityPair"),
        readAddress(curve, "wbnb"),
        readValue(curve, uintReadAbi("graduationTarget"), "graduationTarget"),
      ],
    );
    requireAddress(curveFee, feeRecipient, "Curve fee recipient");
    const graduationUnit = 1_000_000_000_000_000_000n;
    if (graduationTarget % graduationUnit !== 0n) {
      throw new Error(`Unexpected graduation target on ${curve}`);
    }
    const targetStep = graduationTarget / graduationUnit;
    if (targetStep < 1n || targetStep > 18n) {
      throw new Error(`Graduation target out of range on ${curve}`);
    }
    await verify(
      curve,
      "src/BondingCurve.sol:BondingCurve",
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "uint8" },
          { type: "address" },
          { type: "address" },
        ],
        [token, factory, curveFee, creator, Number(targetStep), pair, wbnb],
      ),
      verificationInputs.bondingCurve,
      "bonding-curve",
    );
  }
}

console.log(
  JSON.stringify(
    {
      status: dryRun ? "verified-config-dry-run" : "verified",
      factory,
      feeRecipient,
      router,
      launchedTokens: verifyLaunchedTokens ? tokenCount.toString() : "skipped",
    },
    null,
    2,
  ),
);
