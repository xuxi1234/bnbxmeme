import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../packages/contracts/package.json", import.meta.url),
);
const solc = require("solc");
const {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  toBytes,
} = require("viem");
const { bsc } = require("viem/chains");

const factory = getAddress(
  process.env.FACTORY_ADDRESS ??
    "0x17b112a7f8ee8bb1b1a3d139c9ba58796ff46352",
);
const rpcUrl = process.env.BSC_MAINNET_RPC_URL?.trim();
if (!rpcUrl) throw new Error("BSC_MAINNET_RPC_URL is required");

const client = createPublicClient({
  chain: bsc,
  transport: http(rpcUrl, { timeout: 30_000, retryCount: 2 }),
});

const sourcePaths = [
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
const contractsRoot = "packages/contracts";

function loadSources(ref) {
  return Object.fromEntries(
    sourcePaths.map((path) => {
      const repositoryPath = `${contractsRoot}/${path}`;
      const content = ref
        ? execFileSync("git", ["show", `${ref}:${repositoryPath}`], {
            encoding: "utf8",
          })
        : readFileSync(repositoryPath, "utf8");
      return [path, { content }];
    }),
  );
}

function compile(ref) {
  const input = {
    language: "Solidity",
    sources: loadSources(ref),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: {
        "*": {
          "*": [
            "evm.deployedBytecode.object",
            "evm.deployedBytecode.immutableReferences",
          ],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const failures = (output.errors ?? []).filter(
    ({ severity }) => severity === "error",
  );
  if (failures.length) {
    throw new Error(failures.map(({ formattedMessage }) => formattedMessage).join("\n"));
  }
  return output.contracts;
}

function artifact(compiled, source, name) {
  const deployed = compiled[source]?.[name]?.evm?.deployedBytecode;
  if (!deployed?.object) throw new Error(`Missing artifact ${source}:${name}`);
  return deployed;
}

function maskImmutables(bytecode, references) {
  const bytes = Buffer.from(bytecode.replace(/^0x/, ""), "hex");
  for (const locations of Object.values(references ?? {})) {
    for (const { start, length } of locations) {
      bytes.fill(0, start, start + length);
    }
  }
  return `0x${bytes.toString("hex")}`;
}

function describeRuntime(onchain, deployed) {
  const normalizedOnchain = maskImmutables(onchain, deployed.immutableReferences);
  const normalizedArtifact = maskImmutables(
    `0x${deployed.object}`,
    deployed.immutableReferences,
  );
  return {
    matches: normalizedOnchain === normalizedArtifact,
    onchainKeccak256: keccak256(toBytes(onchain)),
    normalizedKeccak256: keccak256(toBytes(normalizedOnchain)),
    artifactNormalizedKeccak256: keccak256(toBytes(normalizedArtifact)),
    byteLength: (onchain.length - 2) / 2,
  };
}

const addressAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];
const uintAbi = (name) => [
  {
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];
const readAddress = (address, name) =>
  client.readContract({ address, abi: addressAbi(name), functionName: name });
const readUint = (address, name) =>
  client.readContract({ address, abi: uintAbi(name), functionName: name });

async function firstCodeBlock(address, latest) {
  let low = 0n;
  let high = latest;
  while (low < high) {
    const middle = (low + high) / 2n;
    const code = await client.getCode({ address, blockNumber: middle });
    if (code && code !== "0x") high = middle;
    else low = middle + 1n;
  }
  return low;
}

async function findCreation(address, blockNumber) {
  const block = await client.getBlock({
    blockNumber,
    includeTransactions: true,
  });
  for (const transaction of block.transactions) {
    const receipt = await client.getTransactionReceipt({
      hash: transaction.hash,
    });
    if (
      receipt.contractAddress &&
      receipt.contractAddress.toLowerCase() === address.toLowerCase()
    ) {
      return {
        transactionHash: transaction.hash,
        deployer: transaction.from,
        blockNumber: blockNumber.toString(),
      };
    }
  }
  return null;
}

const [factoryCode, feeRecipient, router, tokenDeployer, tokenCount, latest] =
  await Promise.all([
    client.getCode({ address: factory }),
    readAddress(factory, "feeRecipient"),
    readAddress(factory, "pancakeV2Router"),
    readAddress(factory, "tokenDeployer"),
    readUint(factory, "tokenCount"),
    client.getBlockNumber(),
  ]);
if (!factoryCode || factoryCode === "0x") {
  throw new Error(`No contract code at ${factory}`);
}

const [deployerCode, manager, bootstrapOwner] = await Promise.all([
  client.getCode({ address: tokenDeployer }),
  readAddress(tokenDeployer, "manager"),
  readAddress(tokenDeployer, "bootstrapOwner"),
]);
if (!deployerCode || deployerCode === "0x") {
  throw new Error(`No token deployer code at ${tokenDeployer}`);
}

const [current, main] = [compile(null), compile("origin/main")];
const currentFactoryArtifact = artifact(
  current,
  "src/BNBXAutoLiquidityFactory.sol",
  "BNBXAutoLiquidityFactory",
);
const mainFactoryArtifact = artifact(
  main,
  "src/BNBXAutoLiquidityFactory.sol",
  "BNBXAutoLiquidityFactory",
);
const currentDeployerArtifact = artifact(
  current,
  "src/BNBXAdvancedTokenDeployer.sol",
  "BNBXAdvancedTokenDeployer",
);
const mainDeployerArtifact = artifact(
  main,
  "src/BNBXAdvancedTokenDeployer.sol",
  "BNBXAdvancedTokenDeployer",
);

const factoryCurrent = describeRuntime(factoryCode, currentFactoryArtifact);
const factoryMain = describeRuntime(factoryCode, mainFactoryArtifact);
const deployerCurrent = describeRuntime(deployerCode, currentDeployerArtifact);
const deployerMain = describeRuntime(deployerCode, mainDeployerArtifact);

let classification = "UNKNOWN";
if (deployerCurrent.matches && !deployerMain.matches) classification = "NEW_10_PERCENT";
else if (deployerMain.matches && !deployerCurrent.matches) classification = "OLD_25_PERCENT";
else if (deployerCurrent.matches && deployerMain.matches) {
  classification = "CURRENT_AND_MAIN_ARTIFACTS_IDENTICAL";
}

const [factoryBlock, deployerBlock] = await Promise.all([
  firstCodeBlock(factory, latest),
  firstCodeBlock(tokenDeployer, latest),
]);
const [factoryCreation, deployerCreation] = await Promise.all([
  findCreation(factory, factoryBlock),
  findCreation(tokenDeployer, deployerBlock),
]);

const report = {
  chainId: 56,
  checkedAtBlock: latest.toString(),
  factory: {
    address: factory,
    feeRecipient,
    pancakeV2Router: router,
    tokenDeployer,
    tokenCount: tokenCount.toString(),
    firstCodeBlock: factoryBlock.toString(),
    creation: factoryCreation,
    runtime: {
      againstPr10Percent: factoryCurrent,
      againstMain25Percent: factoryMain,
    },
  },
  tokenDeployer: {
    address: tokenDeployer,
    manager,
    bootstrapOwner,
    managerPointsToFactory: manager.toLowerCase() === factory.toLowerCase(),
    firstCodeBlock: deployerBlock.toString(),
    creation: deployerCreation,
    runtime: {
      againstPr10Percent: deployerCurrent,
      againstMain25Percent: deployerMain,
    },
  },
  taxLimitClassification: classification,
  reportSha256: createHash("sha256")
    .update(`${factoryCode}\n${deployerCode}`)
    .digest("hex"),
};

console.log(JSON.stringify(report, null, 2));
if (classification === "UNKNOWN") process.exitCode = 2;
