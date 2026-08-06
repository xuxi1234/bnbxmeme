import { resolve } from "node:path";
import solc from "solc";
import { createMainnetVerificationInputs } from "./verification-compiler-input.mjs";
import {
  createPublicClient,
  encodeAbiParameters,
  fallback,
  getAddress,
  http,
} from "viem";
import { bsc } from "viem/chains";

const CHAIN_ID = "56";
const API_URL = "https://api.etherscan.io/v2/api";
const EXPECTED_DEPLOYER = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const EXPECTED_FEE_RECIPIENT = "0xDAF4f62914f7F64c9eabFd473F4dB4b7e74048A6";
const EXPECTED_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const contractVersion = (
  process.env.BNBX_CONTRACT_VERSION ?? "V3"
).toUpperCase();
if (contractVersion !== "V3" && contractVersion !== "V4") {
  throw new Error(`Unsupported BNBX_CONTRACT_VERSION: ${contractVersion}`);
}
const v4 = contractVersion === "V4";
const addressPrefix = `BNBX_${contractVersion}`;
const standardFactorySource = v4
  ? "src/BNBXFactoryV4.sol"
  : "src/BNBXFactory.sol";
const standardFactoryContract = v4 ? "BNBXFactoryV4" : "BNBXFactory";
const standardTokenSource = v4 ? "src/BNBXTokenV4.sol" : "src/BNBXTokenV3.sol";
const standardTokenContract = v4 ? "BNBXTokenV4" : "BNBXTokenV3";
const rewardsFactorySource = v4
  ? "src/BNBXRewardsFactoryV4.sol"
  : "src/BNBXRewardsFactoryV3.sol";
const rewardsFactoryContract = v4
  ? "BNBXRewardsFactoryV4"
  : "BNBXRewardsFactoryV3";
const tokenDeployerSource = v4
  ? "src/BNBXAdvancedTokenDeployerV4.sol"
  : "src/BNBXAdvancedTokenDeployer.sol";
const tokenDeployerContract = v4
  ? "BNBXAdvancedTokenDeployerV4"
  : "BNBXAdvancedTokenDeployer";
const dividendTokenSource = v4
  ? "src/BNBXDividendTokenV4.sol"
  : "src/BNBXDividendTokenV3.sol";
const dividendTokenContract = v4
  ? "BNBXDividendTokenV4"
  : "BNBXDividendTokenV3";
const rewardVaultSource = v4
  ? "src/BNBXRewardVaultV4.sol"
  : "src/BNBXRewardVaultV3.sol";
const rewardVaultContract = v4 ? "BNBXRewardVaultV4" : "BNBXRewardVaultV3";
const dryRun = process.env.VERIFY_DRY_RUN === "1";
const apiKey = process.env.BSC_SCAN_API_KEY;
const configuredRpcUrls = (process.env.BSC_MAINNET_RPC_URL ?? "")
  .split(/\s+/)
  .map((url) => url.trim())
  .filter(Boolean);
const rpcUrls = configuredRpcUrls.length
  ? configuredRpcUrls
  : ["https://bsc-rpc.publicnode.com"];
const standardFactory =
  process.env[`${addressPrefix}_STANDARD_FACTORY_ADDRESS`];
const rewardsFactory = process.env[`${addressPrefix}_REWARDS_FACTORY_ADDRESS`];
const verifyLaunchedTokens = process.env.VERIFY_LAUNCHED_TOKENS === "1";

if (!dryRun && !apiKey) throw new Error("BSC_SCAN_API_KEY is required");
if (!dryRun && (!standardFactory || !rewardsFactory)) {
  throw new Error(
    `${addressPrefix}_STANDARD_FACTORY_ADDRESS and ${addressPrefix}_REWARDS_FACTORY_ADDRESS are required`,
  );
}

const root = resolve(import.meta.dirname, "..");
const verificationInputs = createMainnetVerificationInputs(
  root,
  contractVersion,
);

const validatedCompilerInputs = new Set();
function validateCompilerInput(label, compilerInput) {
  const serialized = JSON.stringify(compilerInput);
  if (validatedCompilerInputs.has(serialized)) return;
  const compilation = JSON.parse(solc.compile(serialized));
  const compileErrors = (compilation.errors ?? []).filter(
    (item) => item.severity === "error",
  );
  if (compileErrors.length) {
    throw new Error(
      `${label} verification input failed:\n${compileErrors
        .map((item) => item.formattedMessage)
        .join("\n")}`,
    );
  }
  validatedCompilerInputs.add(serialized);
}
const versionMatch = solc
  .version()
  .match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i);
if (!versionMatch)
  throw new Error(`Unsupported solc version: ${solc.version()}`);

if (dryRun && (!standardFactory || !rewardsFactory)) {
  for (const [label, compilerInput] of Object.entries(verificationInputs)) {
    validateCompilerInput(label, compilerInput);
  }
  console.log(
    JSON.stringify(
      {
        status: "compiled",
        compiler: `v${versionMatch[1]}`,
        optimizerRuns: 200,
        evmVersion: "shanghai",
        verificationBundles: Object.fromEntries(
          Object.entries(verificationInputs).map(([label, compilerInput]) => [
            label,
            Object.keys(compilerInput.sources),
          ]),
        ),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const standardAddress = getAddress(standardFactory);
const rewardsAddress = getAddress(rewardsFactory);
const client = createPublicClient({
  chain: bsc,
  transport:
    rpcUrls.length === 1
      ? http(rpcUrls[0], { timeout: 20_000, retryCount: 2 })
      : fallback(
          rpcUrls.map((url) => http(url, { timeout: 20_000, retryCount: 1 })),
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
const readAddress = (address, name) =>
  client.readContract({
    address,
    abi: addressReadAbi(name),
    functionName: name,
  });

const [chainId, standardCode, rewardsCode] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: standardAddress }),
  client.getCode({ address: rewardsAddress }),
]);
if (chainId !== 56)
  throw new Error(`Refusing verification on chain ${chainId}`);
if (!standardCode || standardCode === "0x") {
  throw new Error(`Standard ${contractVersion} Factory has no bytecode`);
}
if (!rewardsCode || rewardsCode === "0x") {
  throw new Error(`Rewards ${contractVersion} Factory has no bytecode`);
}

const [standardFee, standardRouter, rewardsFee, rewardsRouter, tokenDeployer] =
  await Promise.all([
    readAddress(standardAddress, "feeRecipient"),
    readAddress(standardAddress, "pancakeV2Router"),
    readAddress(rewardsAddress, "feeRecipient"),
    readAddress(rewardsAddress, "pancakeV2Router"),
    readAddress(rewardsAddress, "tokenDeployer"),
  ]);
const [bootstrapOwner, manager, deployerCode] = await Promise.all([
  readAddress(tokenDeployer, "bootstrapOwner"),
  readAddress(tokenDeployer, "manager"),
  client.getCode({ address: tokenDeployer }),
]);
if (!deployerCode || deployerCode === "0x") {
  throw new Error("Advanced token deployer has no bytecode");
}

function requireAddress(actual, expected, label) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch: ${actual}`);
  }
}
requireAddress(standardFee, EXPECTED_FEE_RECIPIENT, "Standard fee recipient");
requireAddress(rewardsFee, EXPECTED_FEE_RECIPIENT, "Rewards fee recipient");
requireAddress(standardRouter, EXPECTED_ROUTER, "Standard router");
requireAddress(rewardsRouter, EXPECTED_ROUTER, "Rewards router");
requireAddress(bootstrapOwner, EXPECTED_DEPLOYER, "Authorized deployer");
requireAddress(manager, rewardsAddress, "Advanced deployer manager");
if (
  process.env[`${addressPrefix}_TOKEN_DEPLOYER_ADDRESS`] &&
  tokenDeployer.toLowerCase() !==
    process.env[`${addressPrefix}_TOKEN_DEPLOYER_ADDRESS`].toLowerCase()
) {
  throw new Error(`Token deployer mismatch: ${tokenDeployer}`);
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
  verificationLabel,
) {
  validateCompilerInput(verificationLabel, compilerInput);
  if (dryRun) {
    console.log(
      `○ ${verificationLabel} ${contractName} ${address} (${Object.keys(compilerInput.sources).length} sources)`,
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

const stringReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
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
const sideTaxesReadAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "burn", type: "uint16" },
      { name: "liquidity", type: "uint16" },
      { name: "marketing", type: "uint16" },
      { name: "rewards", type: "uint16" },
    ],
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

async function requireCode(address, label) {
  const code = await client.getCode({ address });
  if (!code || code === "0x")
    throw new Error(`${label} has no bytecode: ${address}`);
}

async function verifyCurve(curve, token, factory) {
  await requireCode(curve, "BondingCurve");
  const [fee, creator, pair, wbnb, graduationTarget] = await Promise.all([
    readAddress(curve, "feeRecipient"),
    readAddress(curve, "creator"),
    readAddress(curve, "liquidityPair"),
    readAddress(curve, "wbnb"),
    readValue(curve, uintReadAbi("graduationTarget"), "graduationTarget"),
  ]);
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
      [token, factory, fee, creator, Number(targetStep), pair, wbnb],
    ),
    verificationInputs.bondingCurve,
    "bonding-curve",
  );
}

async function verifyRewardVault(vault, rewardTemplate) {
  await requireCode(vault, "Reward vault");
  const [mode, controller, rewardAsset, minimumShare] = await Promise.all([
    readValue(vault, uintReadAbi("mode", "uint8"), "mode"),
    readAddress(vault, "controller"),
    readAddress(vault, "rewardToken"),
    readValue(vault, uintReadAbi("minimumShare"), "minimumShare"),
  ]);
  if (Number(mode) !== rewardTemplate) {
    throw new Error(`Reward vault mode mismatch on ${vault}`);
  }
  const verificationLabel =
    rewardTemplate === 0 ? "holder-reward-vault" : "lp-reward-vault";
  await verify(
    vault,
    `${rewardVaultSource}:${rewardVaultContract}`,
    encodeAbiParameters(
      [
        { type: "uint8" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [mode, controller, rewardAsset, minimumShare],
    ),
    verificationInputs.rewardVault,
    verificationLabel,
  );
}

async function verifyStandardToken(token, factory) {
  await requireCode(token, `Standard ${contractVersion} token`);
  const [name, symbol] = await Promise.all([
    readValue(token, stringReadAbi("name"), "name"),
    readValue(token, stringReadAbi("symbol"), "symbol"),
  ]);
  await verify(
    token,
    `${standardTokenSource}:${standardTokenContract}`,
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "address" }],
      [name, symbol, factory],
    ),
    verificationInputs.standardToken,
    "zero-tax-token",
  );
}

async function verifyRewardsToken(token, factory) {
  await requireCode(token, `Rewards ${contractVersion} token`);
  const [
    name,
    symbol,
    router,
    marketingWallet,
    rewardAsset,
    buyTaxes,
    sellTaxes,
    template,
    minimumRewardShare,
    vault,
  ] = await Promise.all([
    readValue(token, stringReadAbi("name"), "name"),
    readValue(token, stringReadAbi("symbol"), "symbol"),
    readAddress(token, "router"),
    readAddress(token, "marketingWallet"),
    readAddress(token, "rewardToken"),
    readValue(token, sideTaxesReadAbi("buyTaxes"), "buyTaxes"),
    readValue(token, sideTaxesReadAbi("sellTaxes"), "sellTaxes"),
    readValue(token, uintReadAbi("template", "uint8"), "template"),
    readValue(token, uintReadAbi("minimumRewardShare"), "minimumRewardShare"),
    readAddress(token, "rewardVault"),
  ]);
  const side = (values) => ({
    burn: values[0],
    liquidity: values[1],
    marketing: values[2],
    rewards: values[3],
  });
  const rewardTemplate = Number(template);
  if (rewardTemplate !== 0 && rewardTemplate !== 1) {
    throw new Error(`Unsupported reward template ${template} on ${token}`);
  }
  const tokenCompilerInput =
    rewardTemplate === 0
      ? verificationInputs.holderRewardsToken
      : verificationInputs.lpRewardsToken;
  const tokenVerificationLabel =
    rewardTemplate === 0 ? "holder-rewards-token" : "lp-rewards-token";
  const initType = {
    type: "tuple",
    components: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "launchManager", type: "address" },
      { name: "router", type: "address" },
      { name: "marketingWallet", type: "address" },
      { name: "rewardToken", type: "address" },
      {
        name: "taxes",
        type: "tuple",
        components: [
          {
            name: "buy",
            type: "tuple",
            components: [
              { name: "burn", type: "uint16" },
              { name: "liquidity", type: "uint16" },
              { name: "marketing", type: "uint16" },
              { name: "rewards", type: "uint16" },
            ],
          },
          {
            name: "sell",
            type: "tuple",
            components: [
              { name: "burn", type: "uint16" },
              { name: "liquidity", type: "uint16" },
              { name: "marketing", type: "uint16" },
              { name: "rewards", type: "uint16" },
            ],
          },
        ],
      },
      { name: "template", type: "uint8" },
      { name: "minimumRewardShare", type: "uint256" },
    ],
  };
  await verify(
    token,
    `${dividendTokenSource}:${dividendTokenContract}`,
    encodeAbiParameters(
      [initType],
      [
        {
          name,
          symbol,
          launchManager: factory,
          router,
          marketingWallet,
          rewardToken: rewardAsset,
          taxes: { buy: side(buyTaxes), sell: side(sellTaxes) },
          template,
          minimumRewardShare,
        },
      ],
    ),
    tokenCompilerInput,
    tokenVerificationLabel,
  );
  await verifyRewardVault(vault, rewardTemplate);
}

async function verifyLaunched(factory, kind) {
  const count = await readValue(
    factory,
    uintReadAbi("tokenCount"),
    "tokenCount",
  );
  const maxTokens = BigInt(process.env.BNBX_VERIFY_MAX_TOKENS || "250");
  if (count > maxTokens) {
    throw new Error(
      `${kind} Factory has ${count} tokens; raise BNBX_VERIFY_MAX_TOKENS to verify all`,
    );
  }
  for (let index = 0n; index < count; index += 1n) {
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
    if (kind === "standard") await verifyStandardToken(token, factory);
    else await verifyRewardsToken(token, factory);
    await verifyCurve(curve, token, factory);
  }
  return count;
}

await verify(
  standardAddress,
  `${standardFactorySource}:${standardFactoryContract}`,
  encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [standardFee, standardRouter],
  ),
  verificationInputs.standardFactory,
  "standard-factory",
);
await verify(
  tokenDeployer,
  `${tokenDeployerSource}:${tokenDeployerContract}`,
  encodeAbiParameters([{ type: "address" }], [bootstrapOwner]),
  verificationInputs.tokenDeployer,
  "advanced-token-deployer",
);
await verify(
  rewardsAddress,
  `${rewardsFactorySource}:${rewardsFactoryContract}`,
  encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }],
    [rewardsFee, rewardsRouter, tokenDeployer],
  ),
  verificationInputs.rewardsFactory,
  "rewards-factory",
);

let standardTokensVerified = 0n;
let rewardsTokensVerified = 0n;
if (verifyLaunchedTokens) {
  standardTokensVerified = await verifyLaunched(standardAddress, "standard");
  rewardsTokensVerified = await verifyLaunched(rewardsAddress, "rewards");
}

console.log(
  JSON.stringify(
    {
      status: dryRun ? "verified-config-dry-run" : "verified",
      contractVersion,
      standardFactory: standardAddress,
      rewardsFactory: rewardsAddress,
      tokenDeployer,
      authorizedDeployer: bootstrapOwner,
      feeRecipient: standardFee,
      router: standardRouter,
      launchedTokens: verifyLaunchedTokens
        ? {
            standard: standardTokensVerified.toString(),
            rewards: rewardsTokensVerified.toString(),
          }
        : "skipped (set VERIFY_LAUNCHED_TOKENS=1)",
    },
    null,
    2,
  ),
);
