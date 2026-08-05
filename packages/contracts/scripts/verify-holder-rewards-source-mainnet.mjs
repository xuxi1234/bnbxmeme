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
const compilerInput = {
  language: "Solidity",
  sources: { [entry]: { content: readFileSync(resolve(root, entry), "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(
  solc.compile(JSON.stringify(compilerInput), { import: findImports }),
);
const errors = (output.errors ?? []).filter(
  (item) => item.severity === "error",
);
if (errors.length)
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
if (process.env.VERIFY_DRY_RUN === "1") {
  console.log(
    JSON.stringify(
      {
        status: "compiled",
        contracts: Object.keys(output.contracts),
        optimizerRuns: 200,
        evmVersion: "shanghai",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const factory = process.env.BNBX_HOLDER_REWARDS_FACTORY_ADDRESS;
const apiKey = process.env.BSC_SCAN_API_KEY;
const constructorArguments =
  process.env.BNBX_HOLDER_REWARDS_CONSTRUCTOR_ARGUMENTS;
if (!factory || !/^0x[0-9a-fA-F]{40}$/.test(factory))
  throw new Error("BNBX_HOLDER_REWARDS_FACTORY_ADDRESS is required");
if (!apiKey) throw new Error("BSC_SCAN_API_KEY is required");
if (!constructorArguments || !/^[0-9a-fA-F]{128}$/.test(constructorArguments))
  throw new Error("Constructor arguments must encode feeRecipient and router");
const version = solc
  .version()
  .match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/i)?.[1];
if (!version) throw new Error(`Unsupported solc version: ${solc.version()}`);
const body = new URLSearchParams({
  apikey: apiKey,
  module: "contract",
  action: "verifysourcecode",
  codeformat: "solidity-standard-json-input",
  sourceCode: JSON.stringify(compilerInput),
  contractaddress: factory,
  contractname: `${entry}:BNBXHolderRewardsFactory`,
  compilerversion: `v${version}`,
  optimizationUsed: "1",
  runs: "200",
  evmversion: "shanghai",
  licenseType: "3",
  constructorArguments,
});
const response = await fetch("https://api.etherscan.io/v2/api?chainid=56", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body,
});
const result = await response.json();
if (
  !response.ok ||
  (result.status !== "1" && !/already verified/i.test(String(result.result)))
)
  throw new Error(
    `BscScan verification submission failed: ${JSON.stringify(result)}`,
  );
console.log(JSON.stringify(result, null, 2));
