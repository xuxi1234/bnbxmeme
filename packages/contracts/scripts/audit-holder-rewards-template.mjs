import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
const root = resolve(import.meta.dirname, "..");
const entry = "src/BNBXHolderRewardsFactory.sol";
function findImports(path) {
  for (const candidate of [path, path.replace(/^\.\//, "src/")]) {
    try {
      return { contents: readFileSync(resolve(root, candidate), "utf8") };
    } catch {}
  }
  return { error: `Import not found: ${path}` };
}
const input = {
  language: "Solidity",
  sources: { [entry]: { content: readFileSync(resolve(root, entry), "utf8") } },
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
if (errors.length)
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
const factory = output.contracts[entry].BNBXHolderRewardsFactory;
const token =
  output.contracts["src/BNBXHolderRewardsToken.sol"].BNBXHolderRewardsToken;
const deployer =
  output.contracts["src/BNBXHolderRewardsTokenDeployer.sol"]
    .BNBXHolderRewardsTokenDeployer;
const vault =
  output.contracts["src/BNBXHolderRewardsVault.sol"].BNBXHolderRewardsVault;
const forbidden = [
  "BNBXDividendTokenV4",
  "BNBXRewardVaultV4",
  "BNBXRewardsFactoryV4",
  "TemplateConfigV4",
];
const sources = Object.keys(output.contracts);
for (const name of forbidden)
  if (sources.some((source) => source.includes(name)))
    throw new Error(`Legacy dependency detected: ${name}`);
const factoryRuntime = factory.evm.deployedBytecode.object.length / 2;
const tokenRuntime = token.evm.deployedBytecode.object.length / 2;
const deployerRuntime = deployer.evm.deployedBytecode.object.length / 2;
const vaultRuntime = vault.evm.deployedBytecode.object.length / 2;
const factoryInitCode = factory.evm.bytecode.object.length / 2;
if (
  factoryRuntime > 24_576 ||
  tokenRuntime > 24_576 ||
  deployerRuntime > 24_576 ||
  vaultRuntime > 24_576
)
  throw new Error("EIP-170 runtime limit exceeded");
if (factoryInitCode > 49_152)
  throw new Error(`EIP-3860 Factory init-code limit exceeded: ${factoryInitCode}`);

const factoryConstructor = factory.abi.find((item) => item.type === "constructor");
const constructorNames = (factoryConstructor?.inputs ?? []).map(
  (input) => input.name,
);
if (
  JSON.stringify(constructorNames) !==
  JSON.stringify(["feeRecipient_", "router_", "defaultRewardToken_"])
) {
  throw new Error(`Unexpected Factory constructor: ${constructorNames.join(",")}`);
}

const factoryFunctions = new Set(
  factory.abi.filter((item) => item.type === "function").map((item) => item.name),
);
const tokenFunctions = new Set(
  token.abi.filter((item) => item.type === "function").map((item) => item.name),
);
for (const required of ["defaultRewardToken", "tokenDeployer", "predictTokenAddress"]) {
  if (!factoryFunctions.has(required))
    throw new Error(`Missing required Factory interface: ${required}`);
}
for (const required of [
  "buyTaxes",
  "sellTaxes",
  "processTaxes",
  "processRewards",
  "claimRewards",
  "rewardVault",
]) {
  if (!tokenFunctions.has(required))
    throw new Error(`Missing required token interface: ${required}`);
}

const forbiddenInterfaces = [
  "owner",
  "mint",
  "setTax",
  "setTaxes",
  "setBlacklist",
  "blacklist",
  "withdraw",
  "withdrawToken",
  "marketingWallet",
  "claimMarketingBNB",
  "referrer",
  "referral",
  "upgradeTo",
  "upgradeToAndCall",
];
for (const name of forbiddenInterfaces) {
  if (factoryFunctions.has(name) || tokenFunctions.has(name)) {
    throw new Error(`Forbidden privileged interface detected: ${name}`);
  }
}
if (JSON.stringify(factory.abi).toLowerCase().includes("marketing")) {
  throw new Error("Marketing field leaked into Holder V2 Factory ABI");
}
console.log(
  JSON.stringify(
    {
      factoryRuntime,
      tokenRuntime,
      deployerRuntime,
      vaultRuntime,
      factoryInitCode,
      sources,
      factoryCreationHash: await import("viem").then(({ keccak256 }) =>
        keccak256(`0x${factory.evm.bytecode.object}`),
      ),
      tokenCreationHash: await import("viem").then(({ keccak256 }) =>
        keccak256(`0x${token.evm.bytecode.object}`),
      ),
    },
    null,
    2,
  ),
);
