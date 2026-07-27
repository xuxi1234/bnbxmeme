import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
} from "viem";
import { bsc } from "viem/chains";

const CHAIN_ID = "56";
const API_URL = "https://api.etherscan.io/v2/api";
const apiKey = process.env.BSC_SCAN_API_KEY;
const dryRun = process.env.VERIFY_DRY_RUN === "1";
const rpcUrl =
  process.env.BSC_MAINNET_RPC_URL ?? "https://bsc-rpc.publicnode.com";
const requestedFactories =
  process.env.BNBX_MAINNET_FACTORY_ADDRESSES ??
  [
    "0xdb189396ae2a350c484ddd749a6af96baebc124b",
    "0x9f572dc9d582ec8347d2a803f766652982220539",
    "0xab744222f0f8699db98b5d9481562eb7c1500428",
  ].join(",");

if (!apiKey && !dryRun) throw new Error("BSC_SCAN_API_KEY is required");

const factories = [
  ...new Set(
    requestedFactories
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean)
      // Keep RPC arguments lowercase after validation. This also tolerates
      // explorers/providers that return non-EIP-55 mixed-case addresses.
      .map((address) => getAddress(address).toLowerCase()),
  ),
];
if (factories.length === 0) {
  throw new Error("BNBX_MAINNET_FACTORY_ADDRESSES must contain an address");
}

const root = resolve(import.meta.dirname, "..");
const sourcePaths = [
  "src/BNBXFactory.sol",
  "src/BNBXToken.sol",
  "src/BNBXAutoLiquidityFactory.sol",
  "src/BNBXAdvancedTokenDeployer.sol",
  "src/BNBXAutoLiquidityToken.sol",
  "src/BNBXRewardVault.sol",
  "src/BondingCurve.sol",
  "src/interfaces/IERC20Minimal.sol",
  "src/interfaces/IPancakeV2.sol",
  "src/libraries/FeeMath.sol",
  "src/libraries/TemplateConfig.sol",
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
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const versionMatch = solc.version().match(
  /^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i,
);
if (!versionMatch) throw new Error(`Unsupported solc version: ${solc.version()}`);

const client = createPublicClient({
  chain: bsc,
  transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }),
});

const addressOutput = [{ type: "address" }];
const uintOutput = [{ type: "uint256" }];
const stringOutput = [{ type: "string" }];
const readAbi = (name, outputs, inputs = []) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs,
    outputs,
  },
];
const read = (address, name, outputs, args, inputs) =>
  client.readContract({
    address,
    abi: readAbi(name, outputs, inputs),
    functionName: name,
    args,
  });
const readAddress = (address, name, args, inputs) =>
  read(address, name, addressOutput, args, inputs);
const readUint = (address, name, args, inputs) =>
  read(address, name, uintOutput, args, inputs);
const readString = (address, name) => read(address, name, stringOutput);

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
  if (!response.ok) throw new Error(`Verification API HTTP ${response.status}`);
  return response.json();
}

async function verify(address, contractName, constructorArguments) {
  if (dryRun) {
    console.log(
      `○ dry run ${contractName} ${address} (${constructorArguments.length - 2} constructor hex chars)`,
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
  const submissionResult = String(submission.result);
  if (
    submission.status === "0" &&
    /already verified|source code already verified/i.test(submissionResult)
  ) {
    console.log(`✓ already verified ${contractName} ${address}`);
    return;
  }
  if (submission.status !== "1") {
    throw new Error(
      `Verification submission failed for ${contractName} ${address}: ${submissionResult}`,
    );
  }

  for (let attempt = 1; attempt <= 18; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
    const status = await callApi({
      action: "checkverifystatus",
      guid: submissionResult,
    });
    const result = String(status.result);
    if (status.status === "1" || /already verified/i.test(result)) {
      console.log(`✓ verified ${contractName} ${address}`);
      return;
    }
    if (!/pending|queue/i.test(result)) {
      throw new Error(
        `Verification failed for ${contractName} ${address}: ${result}`,
      );
    }
    console.log(`… pending ${contractName} ${address} (${attempt}/18)`);
  }
  throw new Error(`Verification timed out for ${contractName} ${address}`);
}

async function hasFunction(address, name) {
  try {
    await readAddress(address, name);
    return true;
  } catch {
    return false;
  }
}

const taxSideComponents = [
  { name: "burn", type: "uint16" },
  { name: "liquidity", type: "uint16" },
  { name: "marketing", type: "uint16" },
  { name: "rewards", type: "uint16" },
];
const taxesComponents = [
  { name: "buy", type: "tuple", components: taxSideComponents },
  { name: "sell", type: "tuple", components: taxSideComponents },
];

async function verifyCurve(curve, token, factory) {
  const [feeRecipient, creator, target, graduationUnit, pair, wbnb] =
    await Promise.all([
      readAddress(curve, "feeRecipient"),
      readAddress(curve, "creator"),
      readUint(curve, "graduationTarget"),
      readUint(curve, "GRADUATION_UNIT"),
      readAddress(curve, "liquidityPair"),
      readAddress(curve, "wbnb"),
    ]);
  if (graduationUnit === 0n || target % graduationUnit !== 0n) {
    throw new Error(`Invalid graduation unit or target on Curve ${curve}`);
  }
  const targetStep = target / graduationUnit;
  if (targetStep < 1n || targetStep > 18n) {
    throw new Error(
      `Invalid graduation target step ${targetStep} on Curve ${curve}`,
    );
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
      [token, factory, feeRecipient, creator, Number(targetStep), pair, wbnb],
    ),
  );
}

async function verifyStandardFactory(factory) {
  const [feeRecipient, router] = await Promise.all([
    readAddress(factory, "feeRecipient"),
    readAddress(factory, "pancakeV2Router"),
  ]);
  await verify(
    factory,
    "src/BNBXFactory.sol:BNBXFactory",
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [feeRecipient, router],
    ),
  );

  const count = await readUint(factory, "tokenCount");
  console.log(`Standard factory ${factory}: ${count} token(s)`);
  for (let index = 0n; index < count; index += 1n) {
    const token = await readAddress(
      factory,
      "allTokens",
      [index],
      [{ type: "uint256" }],
    );
    const [name, symbol, curve] = await Promise.all([
      readString(token, "name"),
      readString(token, "symbol"),
      readAddress(
        factory,
        "curveOf",
        [token],
        [{ type: "address" }],
      ),
    ]);
    await verify(
      token,
      "src/BNBXToken.sol:BNBXToken",
      encodeAbiParameters(
        [{ type: "string" }, { type: "string" }, { type: "address" }],
        [name, symbol, factory],
      ),
    );
    await verifyCurve(curve, token, factory);
  }
}

async function verifyAdvancedFactory(factory) {
  const [feeRecipient, router, tokenDeployer] = await Promise.all([
    readAddress(factory, "feeRecipient"),
    readAddress(factory, "pancakeV2Router"),
    readAddress(factory, "tokenDeployer"),
  ]);
  const bootstrapOwner = await readAddress(tokenDeployer, "bootstrapOwner");
  await verify(
    tokenDeployer,
    "src/BNBXAdvancedTokenDeployer.sol:BNBXAdvancedTokenDeployer",
    encodeAbiParameters([{ type: "address" }], [bootstrapOwner]),
  );
  await verify(
    factory,
    "src/BNBXAutoLiquidityFactory.sol:BNBXAutoLiquidityFactory",
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "address" }],
      [feeRecipient, router, tokenDeployer],
    ),
  );

  const count = await readUint(factory, "tokenCount");
  console.log(`Advanced factory ${factory}: ${count} token(s)`);
  for (let index = 0n; index < count; index += 1n) {
    const token = await readAddress(
      factory,
      "allTokens",
      [index],
      [{ type: "uint256" }],
    );
    const [
      name,
      symbol,
      marketingWallet,
      template,
      minimumRewardShare,
      buyTaxes,
      sellTaxes,
      rewardVault,
      curve,
    ] = await Promise.all([
      readString(token, "name"),
      readString(token, "symbol"),
      readAddress(token, "marketingWallet"),
      readUint(token, "template"),
      readUint(token, "minimumRewardShare"),
      read(token, "buyTaxes", taxSideComponents),
      read(token, "sellTaxes", taxSideComponents),
      readAddress(token, "rewardVault"),
      readAddress(
        factory,
        "curveOf",
        [token],
        [{ type: "address" }],
      ),
    ]);
    const taxes = {
      buy: {
        burn: Number(buyTaxes[0]),
        liquidity: Number(buyTaxes[1]),
        marketing: Number(buyTaxes[2]),
        rewards: Number(buyTaxes[3]),
      },
      sell: {
        burn: Number(sellTaxes[0]),
        liquidity: Number(sellTaxes[1]),
        marketing: Number(sellTaxes[2]),
        rewards: Number(sellTaxes[3]),
      },
    };
    await verify(
      token,
      "src/BNBXAutoLiquidityToken.sol:BNBXAutoLiquidityToken",
      encodeAbiParameters(
        [
          { type: "string" },
          { type: "string" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "tuple", components: taxesComponents },
          { type: "uint8" },
          { type: "uint256" },
        ],
        [
          name,
          symbol,
          factory,
          router,
          marketingWallet,
          taxes,
          Number(template),
          minimumRewardShare,
        ],
      ),
    );
    if (rewardVault !== "0x0000000000000000000000000000000000000000") {
      const mode = await readUint(rewardVault, "mode");
      await verify(
        rewardVault,
        "src/BNBXRewardVault.sol:BNBXRewardVault",
        encodeAbiParameters(
          [{ type: "uint8" }, { type: "address" }],
          [Number(mode), token],
        ),
      );
    }
    await verifyCurve(curve, token, factory);
  }
}

for (const factory of factories) {
  const code = await client.getCode({ address: factory });
  if (!code || code === "0x") {
    throw new Error(`No contract deployed at factory ${factory}`);
  }
  console.log(`\nVerifying factory ${factory}`);
  if (await hasFunction(factory, "tokenDeployer")) {
    await verifyAdvancedFactory(factory);
  } else {
    await verifyStandardFactory(factory);
  }
}

console.log("\nAll BNBX mainnet contracts are verified or already verified.");
