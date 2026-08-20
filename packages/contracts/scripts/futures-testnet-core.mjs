import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import {
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  zeroAddress,
} from "viem";

export const FUTURES_TESTNET_CHAIN_ID = 97;
export const FUTURES_DEPLOYMENT_ORDER = [
  ["RiskEngine", "src/futures/RiskEngine.sol"],
  ["ClearingHouse", "src/futures/ClearingHouse.sol"],
  ["FuturesOracle", "src/futures/FuturesOracle.sol"],
  ["SafetyController", "src/futures/SafetyController.sol"],
  ["OrderBook", "src/futures/OrderBook.sol"],
];
export const FUTURES_SOURCE_PATHS = [
  "src/futures/ClearingHouse.sol",
  "src/futures/FuturesOracle.sol",
  "src/futures/FuturesTypes.sol",
  "src/futures/OrderBook.sol",
  "src/futures/RiskEngine.sol",
  "src/futures/SafetyController.sol",
];
export const FUTURES_COMPILER_SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "shanghai",
};

const required = (environment, key) => {
  const value = environment[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
};
const explicitAddress = (environment, key) => {
  try {
    const value = getAddress(required(environment, key));
    if (value === zeroAddress) throw new Error("zero address");
    return value;
  } catch {
    throw new Error(`${key} must be an explicit nonzero address`);
  }
};
const positiveUint = (environment, key) => {
  const value = required(environment, key);
  if (!/^[1-9][0-9]{0,77}$/.test(value)) {
    throw new Error(`${key} must be a positive uint256 decimal string`);
  }
  if (BigInt(value) > (1n << 256n) - 1n) {
    throw new Error(`${key} exceeds uint256`);
  }
  return value;
};

export function parseFuturesTestnetConfig(
  environment,
  { requireSecrets = false } = {},
) {
  const rpcUrl = required(environment, "BSC_TESTNET_RPC_URL");
  if (!/^https:\/\//i.test(rpcUrl)) {
    throw new Error("BSC_TESTNET_RPC_URL must use HTTPS");
  }
  const config = {
    chainId: FUTURES_TESTNET_CHAIN_ID,
    rpcUrl,
    testUsdt: explicitAddress(environment, "FUTURES_TEST_USDT"),
    testBnbx: explicitAddress(environment, "FUTURES_TEST_BNBX"),
    wbnb: explicitAddress(environment, "FUTURES_TEST_WBNB"),
    pair: explicitAddress(environment, "FUTURES_TEST_BNBX_WBNB_PAIR"),
    bnbUsdFeed: explicitAddress(environment, "FUTURES_TEST_BNB_USD_FEED"),
    guardian: explicitAddress(environment, "FUTURES_GUARDIAN"),
    revenueRecipient: explicitAddress(environment, "FUTURES_REVENUE_RECIPIENT"),
    totalLiabilityCap: positiveUint(environment, "FUTURES_TOTAL_LIABILITY_CAP"),
    accountEquityCap: positiveUint(environment, "FUTURES_ACCOUNT_EQUITY_CAP"),
    matchedOpenInterestCap: positiveUint(
      environment,
      "FUTURES_OPEN_INTEREST_CAP",
    ),
  };
  const identities = [
    config.testUsdt,
    config.testBnbx,
    config.wbnb,
    config.pair,
    config.bnbUsdFeed,
    config.guardian,
    config.revenueRecipient,
  ].map((value) => value.toLowerCase());
  if (new Set(identities).size !== identities.length) {
    throw new Error("Futures testnet dependencies and roles must be distinct");
  }
  if (
    BigInt(config.accountEquityCap) > BigInt(config.totalLiabilityCap) ||
    BigInt(config.matchedOpenInterestCap) > BigInt(config.totalLiabilityCap)
  ) {
    throw new Error(
      "account and open-interest caps cannot exceed total liabilities",
    );
  }
  if (requireSecrets) {
    const privateKey = required(environment, "DEPLOYER_PRIVATE_KEY");
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte key");
    }
    config.privateKey = privateKey;
    config.scanApiKey = required(environment, "BSC_SCAN_API_KEY");
  }
  return config;
}

export function buildFuturesDeploymentPlan(deployer, startingNonce) {
  const from = getAddress(deployer);
  if (typeof startingNonce !== "bigint" || startingNonce < 0n) {
    throw new Error("starting nonce must be a non-negative bigint");
  }
  return FUTURES_DEPLOYMENT_ORDER.map(([contract, source], index) => {
    const nonce = startingNonce + BigInt(index);
    return {
      contract,
      source,
      nonce,
      address: getContractAddress({ from, nonce }),
    };
  });
}

const digest = (value) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;

export function compileFuturesTestnet(root) {
  const sources = Object.fromEntries(
    FUTURES_SOURCE_PATHS.map((path) => [
      path,
      { content: readFileSync(resolve(root, path), "utf8") },
    ]),
  );
  const input = {
    language: "Solidity",
    sources,
    settings: {
      ...FUTURES_COMPILER_SETTINGS,
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    ({ severity }) => severity === "error",
  );
  if (errors.length) {
    throw new Error(
      errors.map(({ formattedMessage }) => formattedMessage).join("\n"),
    );
  }
  const artifacts = Object.fromEntries(
    FUTURES_DEPLOYMENT_ORDER.map(([contract, source]) => {
      const artifact = output.contracts?.[source]?.[contract];
      if (!artifact) throw new Error(`compile omitted ${source}:${contract}`);
      const runtime = artifact.evm.deployedBytecode.object;
      const runtimeBytes = runtime.length / 2;
      if (runtimeBytes < 1 || runtimeBytes > 24_576) {
        throw new Error(`${contract} runtime exceeds EIP-170`);
      }
      return [
        contract,
        {
          ...artifact,
          contract,
          source,
          runtimeBytes,
          runtimeBytecodeHash: digest(runtime),
        },
      ];
    }),
  );
  return {
    artifacts,
    compiler: solc.version(),
    compilerInput: input,
    settings: FUTURES_COMPILER_SETTINGS,
  };
}

export function encodeConstructorArgs(artifact, args) {
  const constructor = artifact.abi.find(({ type }) => type === "constructor");
  return constructor?.inputs?.length
    ? encodeAbiParameters(constructor.inputs, args)
    : "0x";
}

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys mismatch`);
  }
};
const assertAddress = (value, label) => {
  try {
    if (getAddress(value) === zeroAddress) throw new Error("zero address");
  } catch {
    throw new Error(`${label} invalid`);
  }
};
const assertHash = (value, label) => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} invalid`);
  }
};

export function assertFuturesTestnetManifest(manifest, artifacts) {
  exactKeys(
    manifest,
    [
      "schema",
      "chainId",
      "deployedAt",
      "deployer",
      "assets",
      "roles",
      "caps",
      "compiler",
      "settings",
      "entries",
    ],
    "manifest",
  );
  if (
    manifest.schema !== "bnbx-futures-testnet-deployment/v1" ||
    manifest.chainId !== FUTURES_TESTNET_CHAIN_ID ||
    !Number.isFinite(Date.parse(manifest.deployedAt)) ||
    typeof manifest.compiler !== "string" ||
    !manifest.compiler.startsWith("0.8.30+commit.") ||
    JSON.stringify(manifest.settings) !==
      JSON.stringify(FUTURES_COMPILER_SETTINGS)
  ) {
    throw new Error("manifest identity mismatch");
  }
  assertAddress(manifest.deployer, "deployer");
  exactKeys(
    manifest.assets,
    ["testUsdt", "testBnbx", "wbnb", "pair", "bnbUsdFeed"],
    "assets",
  );
  exactKeys(manifest.roles, ["guardian", "revenueRecipient"], "roles");
  exactKeys(
    manifest.caps,
    ["totalLiability", "accountEquity", "matchedOpenInterest"],
    "caps",
  );
  for (const [key, value] of Object.entries({
    ...manifest.assets,
    ...manifest.roles,
  })) {
    assertAddress(value, key);
  }
  for (const value of Object.values(manifest.caps)) {
    if (!/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) > (1n << 256n) - 1n)
      throw new Error("invalid cap");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 5) {
    throw new Error("manifest must contain five deployments");
  }
  const startingNonce = BigInt(manifest.entries[0]?.nonce ?? -1);
  const plan = buildFuturesDeploymentPlan(manifest.deployer, startingNonce);
  manifest.entries.forEach((entry, index) => {
    exactKeys(
      entry,
      [
        "contract",
        "source",
        "address",
        "nonce",
        "transactionHash",
        "constructorArgs",
        "constructorArgsEncoded",
        "runtimeBytes",
        "runtimeBytecodeHash",
        "deployedRuntimeBytecodeHash",
      ],
      `entries[${index}]`,
    );
    const [contract, source] = FUTURES_DEPLOYMENT_ORDER[index];
    if (
      entry.contract !== contract ||
      entry.source !== source ||
      entry.nonce !== plan[index].nonce.toString() ||
      entry.address.toLowerCase() !== plan[index].address.toLowerCase() ||
      !/^(?:0|[1-9][0-9]*)$/.test(entry.nonce) ||
      !Array.isArray(entry.constructorArgs) ||
      typeof entry.constructorArgsEncoded !== "string" ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(entry.constructorArgsEncoded) ||
      !Number.isSafeInteger(entry.runtimeBytes) ||
      entry.runtimeBytes < 1 ||
      entry.runtimeBytes > 24_576
    ) {
      throw new Error(`entries[${index}] identity mismatch`);
    }
    assertAddress(entry.address, `entries[${index}].address`);
    assertHash(entry.transactionHash, `entries[${index}].transactionHash`);
    assertHash(entry.runtimeBytecodeHash, `entries[${index}].runtime hash`);
    assertHash(
      entry.deployedRuntimeBytecodeHash,
      `entries[${index}].deployed hash`,
    );
  });
  const deployed = Object.fromEntries(
    manifest.entries.map((entry) => [entry.contract, entry]),
  );
  const expectedConstructorArgs = {
    RiskEngine: [],
    ClearingHouse: [
      manifest.assets.testUsdt,
      deployed.RiskEngine.address,
      deployed.OrderBook.address,
      deployed.SafetyController.address,
      manifest.roles.revenueRecipient,
      manifest.caps.totalLiability,
      manifest.caps.accountEquity,
      manifest.caps.matchedOpenInterest,
    ],
    FuturesOracle: [
      manifest.assets.pair,
      manifest.assets.bnbUsdFeed,
      manifest.assets.testBnbx,
      manifest.assets.wbnb,
      deployed.SafetyController.address,
    ],
    SafetyController: [
      manifest.roles.guardian,
      deployed.ClearingHouse.address,
      deployed.FuturesOracle.address,
    ],
    OrderBook: [
      deployed.ClearingHouse.address,
      deployed.RiskEngine.address,
      deployed.FuturesOracle.address,
    ],
  };
  const normalizeArgs = (values) =>
    values.map((value) =>
      typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
        ? value.toLowerCase()
        : `${value}`,
    );
  for (const entry of manifest.entries) {
    if (
      JSON.stringify(normalizeArgs(entry.constructorArgs)) !==
      JSON.stringify(normalizeArgs(expectedConstructorArgs[entry.contract]))
    ) {
      throw new Error(`${entry.contract} constructor identity mismatch`);
    }
    if (artifacts) {
      const artifact = artifacts[entry.contract];
      if (
        !artifact ||
        entry.runtimeBytecodeHash !== artifact.runtimeBytecodeHash ||
        entry.constructorArgsEncoded.toLowerCase() !==
          encodeConstructorArgs(artifact, entry.constructorArgs).toLowerCase()
      ) {
        throw new Error(`${entry.contract} compile proof mismatch`);
      }
    }
  }
  return manifest;
}

export const sha256Bytecode = (bytecode) =>
  digest(bytecode.toLowerCase().replace(/^0x/, ""));
