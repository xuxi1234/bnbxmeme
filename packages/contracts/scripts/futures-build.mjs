import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeAbiParameters,
  getContractAddress,
} from "viem";

import {
  assertCompileProof,
  assertDeploymentArtifact,
  assertDeploymentManifest,
  assertNoProhibitedSelectors,
  atomicReplaceDirectory,
  containsProhibitedIdentifier,
  stableJson,
} from "./futures-tooling.mjs";

const root = resolve(import.meta.dirname, "..");
const compileDirectory = resolve(
  root,
  process.env.FUTURES_COMPILE_DIR ?? ".futures-compile",
);
const deploymentDirectory = resolve(
  root,
  process.env.FUTURES_DEPLOYMENT_DIR ?? ".futures-deployments",
);
const settings = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "shanghai",
};
const sourcePaths = [
  "src/futures/ClearingHouse.sol",
  "src/futures/FuturesOracle.sol",
  "src/futures/FuturesTypes.sol",
  "src/futures/OrderBook.sol",
  "src/futures/RiskEngine.sol",
  "src/futures/SafetyController.sol",
  "test/FuturesOracle.t.sol",
  "test/futures/FuturesCollateralMock.sol",
];
const independentlyCompiledSources = sourcePaths.slice(0, 6);
const deployableContracts = new Set([
  "ClearingHouse",
  "FuturesOracle",
  "OrderBook",
  "RiskEngine",
  "SafetyController",
]);
const artifactFiles = [
  "00-collateral.json",
  "01-bnbx-token.json",
  "02-wbnb-token.json",
  "03-pair.json",
  "04-feed.json",
  "05-risk-engine.json",
  "06-clearing-house.json",
  "07-oracle.json",
  "08-safety-controller.json",
  "09-order-book.json",
];
const expectedOrder = [
  { contract: "FuturesCollateralMock", source: "test/futures/FuturesCollateralMock.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleTokenMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OraclePairMock", source: "test/FuturesOracle.t.sol" },
  { contract: "OracleFeedMock", source: "test/FuturesOracle.t.sol" },
  { contract: "RiskEngine", source: "src/futures/RiskEngine.sol" },
  { contract: "ClearingHouse", source: "src/futures/ClearingHouse.sol" },
  { contract: "FuturesOracle", source: "src/futures/FuturesOracle.sol" },
  { contract: "SafetyController", source: "src/futures/SafetyController.sol" },
  { contract: "OrderBook", source: "src/futures/OrderBook.sol" },
];
const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const expectedDeployer = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const digest = (value) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;
const loadSource = (path) => readFileSync(resolve(root, path), "utf8");
const sourceContents = new Map(sourcePaths.map((path) => [path, loadSource(path)]));
const findImports = (importPath) => {
  for (const candidate of [
    importPath,
    `src/${importPath}`,
    `test/${importPath}`,
    importPath.replace(/^\.\.\//, ""),
    importPath.replace(/^\.\.\//, "src/"),
  ]) {
    try {
      return { contents: loadSource(candidate) };
    } catch {
      // Continue through the bounded repository-relative candidates.
    }
  }
  return { error: `Import not found: ${importPath}` };
};
const outputSelection = {
  "*": {
    "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
  },
};
const compile = (sources) => {
  const input = {
    language: "Solidity",
    sources: Object.fromEntries(
      [...sources].map(([path, content]) => [path, { content }]),
    ),
    settings: { ...settings, outputSelection },
  };
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports }),
  );
  const errors = (output.errors ?? []).filter(
    ({ severity }) => severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));
  }
  return output;
};

for (const path of independentlyCompiledSources) {
  const independent = compile(new Map([[path, sourceContents.get(path)]]));
  if (!independent.contracts[path]) {
    throw new Error(`independent compile omitted ${path}`);
  }
}

const output = compile(sourceContents);
const compiler = solc.version();
const sources = sourcePaths.map((path) => ({
  path,
  sha256: digest(sourceContents.get(path)),
}));
const contracts = Object.entries(output.contracts)
  .flatMap(([source, artifacts]) =>
    Object.entries(artifacts)
      .filter(([name]) => deployableContracts.has(name))
      .map(([name, artifact]) => {
        const runtime = artifact.evm.deployedBytecode.object;
        if (
          containsProhibitedIdentifier(
            `${source} ${name} ${JSON.stringify(artifact.abi)}`,
          )
        ) {
          throw new Error(`${source}:${name} exposes a prohibited identifier`);
        }
        assertNoProhibitedSelectors(artifact.abi, runtime);
        return {
          source,
          name,
          abiHash: digest(stableJson(artifact.abi)),
          creationBytecodeHash: digest(artifact.evm.bytecode.object),
          runtimeBytecodeHash: digest(runtime),
          runtimeBytes: runtime.length / 2,
        };
      }),
  )
  .sort((left, right) =>
    `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`),
  );
const proof = {
  schema: "bnbx-futures-compile-proof/v1",
  compiler,
  settings,
  sources,
  contracts,
};
assertCompileProof(proof);

const chain = defineChain({
  id: 31_337,
  name: "BNBX Futures deterministic fixture",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const provider = ganache.provider({
  logging: { quiet: true },
  wallet: {
    accounts: [
      {
        secretKey: privateKey,
        balance: `0x${(1_000n * 10n ** 18n).toString(16)}`,
      },
    ],
  },
  miner: { blockGasLimit: 120_000_000 },
  chain: { chainId: chain.id },
});
const [deployer] = await provider.request({
  method: "eth_accounts",
  params: [],
});
if (deployer.toLowerCase() !== expectedDeployer) {
  throw new Error("deterministic deployer mismatch");
}
const publicClient = createPublicClient({
  chain,
  transport: custom(provider),
});
const wallet = createWalletClient({
  account: deployer,
  chain,
  transport: custom(provider),
});
const artifact = (source, contract) => output.contracts[source][contract];
const normalizeArgument = (value) =>
  typeof value === "bigint" ? value.toString() : value;
const deploy = async (source, contract, args = []) => {
  const contractArtifact = artifact(source, contract);
  const nonce = await publicClient.getTransactionCount({ address: deployer });
  const predicted = getContractAddress({ from: deployer, nonce: BigInt(nonce) });
  const transactionHash = await wallet.deployContract({
    abi: contractArtifact.abi,
    bytecode: `0x${contractArtifact.evm.bytecode.object}`,
    args,
    gas: 100_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
  });
  if (
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    receipt.contractAddress.toLowerCase() !== predicted.toLowerCase()
  ) {
    throw new Error(`${contract} deterministic deployment mismatch`);
  }
  const deployedRuntime = await publicClient.getBytecode({
    address: receipt.contractAddress,
  });
  if (!deployedRuntime || deployedRuntime === "0x") {
    throw new Error(`${contract} deployed without runtime code`);
  }
  const constructor = contractArtifact.abi.find(({ type }) => type === "constructor");
  const constructorInputs = constructor?.inputs ?? [];
  const constructorArgsEncoded =
    constructorInputs.length === 0
      ? "0x"
      : encodeAbiParameters(constructorInputs, args);
  const runtime = contractArtifact.evm.deployedBytecode.object;
  const deployment = {
    schema: "bnbx-futures-local-deployment/v1",
    chainId: chain.id,
    deploymentIndex: nonce,
    contract,
    source,
    address: receipt.contractAddress,
    deployer,
    nonce,
    constructorArgs: args.map(normalizeArgument),
    constructorArgsEncoded,
    sourceClosure: sources,
    compiler,
    settings,
    abiHash: digest(stableJson(contractArtifact.abi)),
    creationBytecodeHash: digest(contractArtifact.evm.bytecode.object),
    runtimeBytecodeHash: digest(runtime),
    deployedRuntimeBytecodeHash: digest(deployedRuntime.slice(2)),
    runtimeBytes: deployedRuntime.slice(2).length / 2,
  };
  assertDeploymentArtifact(deployment, {
    contract,
    source,
    address: predicted,
    nonce,
    constructorArgs: args.map(normalizeArgument),
    constructorArgsEncoded,
    deployedRuntimeBytecodeHash: digest(deployedRuntime.slice(2)),
  });
  return deployment;
};

const entries = [];
entries.push(
  await deploy(
    "test/futures/FuturesCollateralMock.sol",
    "FuturesCollateralMock",
  ),
);
entries.push(await deploy("test/FuturesOracle.t.sol", "OracleTokenMock"));
entries.push(await deploy("test/FuturesOracle.t.sol", "OracleTokenMock"));
entries.push(
  await deploy("test/FuturesOracle.t.sol", "OraclePairMock", [
    entries[1].address,
    entries[2].address,
  ]),
);
entries.push(await deploy("test/FuturesOracle.t.sol", "OracleFeedMock"));
entries.push(await deploy("src/futures/RiskEngine.sol", "RiskEngine"));
const predictedController = getContractAddress({
  from: deployer,
  nonce: 8n,
});
const predictedOrderBook = getContractAddress({
  from: deployer,
  nonce: 9n,
});
const totalCap = 1_000_000n * 10n ** 18n;
const accountCap = 10_000n * 10n ** 18n;
const openInterestCap = 1_000_000n * 10n ** 18n;
entries.push(
  await deploy("src/futures/ClearingHouse.sol", "ClearingHouse", [
    entries[0].address,
    entries[5].address,
    predictedOrderBook,
    predictedController,
    deployer,
    totalCap,
    accountCap,
    openInterestCap,
  ]),
);
entries.push(
  await deploy("src/futures/FuturesOracle.sol", "FuturesOracle", [
    entries[3].address,
    entries[4].address,
    entries[1].address,
    entries[2].address,
    predictedController,
  ]),
);
entries.push(
  await deploy("src/futures/SafetyController.sol", "SafetyController", [
    deployer,
    entries[6].address,
    entries[7].address,
  ]),
);
entries.push(
  await deploy("src/futures/OrderBook.sol", "OrderBook", [
    entries[6].address,
    entries[5].address,
    entries[7].address,
  ]),
);

const manifest = {
  schema: "bnbx-futures-local-deployment-manifest/v1",
  chainId: chain.id,
  deployer,
  compiler,
  settings,
  entries,
};
assertDeploymentManifest(manifest, expectedOrder);

atomicReplaceDirectory(compileDirectory, (staging) => {
  writeFileSync(
    resolve(staging, "futures.compile-proof.json"),
    stableJson(proof),
  );
});
atomicReplaceDirectory(deploymentDirectory, (staging) => {
  entries.forEach((entry, index) => {
    writeFileSync(resolve(staging, artifactFiles[index]), stableJson(entry));
  });
  writeFileSync(resolve(staging, "manifest.json"), stableJson(manifest));
});
await provider.disconnect();
console.log(`PASS deterministic Futures deployment ${entries.length} contracts`);
