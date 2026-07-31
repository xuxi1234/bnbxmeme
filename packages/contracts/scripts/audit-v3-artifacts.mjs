import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
} from "viem";

const root = resolve(import.meta.dirname, "..");
const entrypoints = [
  "src/BNBXFactory.sol",
  "src/BNBXRewardsFactoryV3.sol",
  "src/BNBXAdvancedTokenDeployer.sol",
  "src/BNBXTokenV3.sol",
  "src/BNBXDividendTokenV3.sol",
  "src/BNBXRewardVaultV3.sol",
];

function load(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function findImports(importPath) {
  for (const candidate of [
    importPath,
    `src/${importPath}`,
    importPath.replace(/^\.\//, "src/"),
  ]) {
    try {
      return { contents: load(candidate) };
    } catch {
      // Try the next normalized import path.
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: Object.fromEntries(
    entrypoints.map((path) => [path, { content: load(path) }]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports }),
);
const errors = (output.errors ?? []).filter(
  (item) => item.severity === "error",
);
if (errors.length) {
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
}

const contracts = [
  ["Standard Factory", "src/BNBXFactory.sol", "BNBXFactory"],
  ["Standard Token", "src/BNBXTokenV3.sol", "BNBXTokenV3"],
  [
    "Advanced Token Deployer",
    "src/BNBXAdvancedTokenDeployer.sol",
    "BNBXAdvancedTokenDeployer",
  ],
  ["Rewards Factory", "src/BNBXRewardsFactoryV3.sol", "BNBXRewardsFactoryV3"],
  ["Dividend Token", "src/BNBXDividendTokenV3.sol", "BNBXDividendTokenV3"],
  ["Reward Vault", "src/BNBXRewardVaultV3.sol", "BNBXRewardVaultV3"],
];
const forbiddenTokenFunctions = new Set([
  "owner",
  "mint",
  "pause",
  "unpause",
  "blacklist",
  "setBlacklist",
  "setTaxes",
  "setTax",
  "setTaxExempt",
  "setLiquidityRecipient",
  "upgradeTo",
  "upgradeToAndCall",
]);

const report = {};
for (const [label, source, name] of contracts) {
  const artifact = output.contracts[source][name];
  const initCodeBytes = artifact.evm.bytecode.object.length / 2;
  const runtimeBytes = artifact.evm.deployedBytecode.object.length / 2;
  if (initCodeBytes > 49_152) {
    throw new Error(`${label} initcode exceeds EIP-3860: ${initCodeBytes}`);
  }
  if (runtimeBytes > 24_576) {
    throw new Error(`${label} runtime exceeds EIP-170: ${runtimeBytes}`);
  }
  report[label] = { initCodeBytes, runtimeBytes };
  if (name === "BNBXTokenV3" || name === "BNBXDividendTokenV3") {
    const exposed = artifact.abi
      .filter((item) => item.type === "function")
      .map((item) => item.name)
      .filter((functionName) => forbiddenTokenFunctions.has(functionName));
    if (exposed.length) {
      throw new Error(
        `${label} exposes forbidden controls: ${exposed.join(", ")}`,
      );
    }
  }
}

const provider = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 2, defaultBalance: 100 },
  miner: { blockGasLimit: 30_000_000 },
  chain: { chainId: 31_338 },
});
const accounts = await provider.request({ method: "eth_accounts", params: [] });
const chain = defineChain({
  id: 31_338,
  name: "BNBX V3 Audit",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const publicClient = createPublicClient({ chain, transport: custom(provider) });
const walletClient = createWalletClient({
  account: accounts[0],
  chain,
  transport: custom(provider),
});

async function deploy(source, name, args) {
  const artifact = output.contracts[source][name];
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
    gas: 8_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || receipt.status !== "success") {
    throw new Error(`${name} local deployment failed`);
  }
  if (receipt.gasUsed >= 8_000_000n) {
    throw new Error(`${name} exhausted the deployment gas safety limit`);
  }
  return { address: receipt.contractAddress, gasUsed: receipt.gasUsed };
}

const feeRecipient = accounts[1];
const deployer = await deploy(
  "src/BNBXAdvancedTokenDeployer.sol",
  "BNBXAdvancedTokenDeployer",
  [accounts[0]],
);
const standard = await deploy("src/BNBXFactory.sol", "BNBXFactory", [
  feeRecipient,
  deployer.address,
]);
const rewards = await deploy(
  "src/BNBXRewardsFactoryV3.sol",
  "BNBXRewardsFactoryV3",
  [feeRecipient, deployer.address, deployer.address],
);
const deployerArtifact =
  output.contracts["src/BNBXAdvancedTokenDeployer.sol"]
    .BNBXAdvancedTokenDeployer;
const configureHash = await walletClient.writeContract({
  address: deployer.address,
  abi: deployerArtifact.abi,
  functionName: "configureManager",
  args: [rewards.address],
  gas: 150_000n,
});
const configureReceipt = await publicClient.waitForTransactionReceipt({
  hash: configureHash,
});
if (configureReceipt.status !== "success") {
  throw new Error("Advanced deployer one-time manager binding failed");
}

report["Standard Factory"].deploymentGas = standard.gasUsed.toString();
report["Advanced Token Deployer"].deploymentGas = deployer.gasUsed.toString();
report["Rewards Factory"].deploymentGas = rewards.gasUsed.toString();
report["Advanced Token Deployer"].managerBindingGas =
  configureReceipt.gasUsed.toString();

console.log(JSON.stringify(report, null, 2));
await provider.disconnect();
