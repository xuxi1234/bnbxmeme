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
if (factoryRuntime > 24_576 || tokenRuntime > 24_576)
  throw new Error("EIP-170 runtime limit exceeded");
console.log(
  JSON.stringify(
    {
      factoryRuntime,
      tokenRuntime,
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
