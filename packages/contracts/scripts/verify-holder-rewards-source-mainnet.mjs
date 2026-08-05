import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";

const root = resolve(import.meta.dirname, "..");
const entry = "src/BNBXHolderRewardsFactory.sol";
const tokenEntry = "src/BNBXHolderRewardsToken.sol";

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
  sources: {
    [entry]: { content: readFileSync(resolve(root, entry), "utf8") },
    [tokenEntry]: {
      content: readFileSync(resolve(root, tokenEntry), "utf8"),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(
  solc.compile(JSON.stringify(compilerInput), { import: findImports }),
);
const errors = (output.errors ?? []).filter((item) => item.severity === "error");
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

const apiUrl = "https://api.etherscan.io/v2/api?chainid=56";
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

const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body,
});
const result = await response.json();

if (/already verified/i.test(String(result.result))) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
if (!response.ok || result.status !== "1")
  throw new Error(
    `BscScan verification submission failed: ${JSON.stringify(result)}`,
  );

const guid = String(result.result);
console.log(JSON.stringify({ submission: result, guid }, null, 2));

for (let attempt = 1; attempt <= 30; attempt += 1) {
  await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
  const statusUrl = new URL(apiUrl);
  statusUrl.searchParams.set("apikey", apiKey);
  statusUrl.searchParams.set("module", "contract");
  statusUrl.searchParams.set("action", "checkverifystatus");
  statusUrl.searchParams.set("guid", guid);

  const statusResponse = await fetch(statusUrl);
  const status = await statusResponse.json();
  const message = String(status.result ?? "");

  if (/pass|already verified/i.test(message)) {
    console.log(JSON.stringify({ guid, final: status }, null, 2));
    process.exit(0);
  }
  if (!/pending|queue/i.test(message))
    throw new Error(
      `BscScan verification failed: ${JSON.stringify({ guid, status })}`,
    );

  console.log(`BscScan verification pending (${attempt}/30)`);
}

throw new Error(`BscScan verification timed out for GUID ${guid}`);
