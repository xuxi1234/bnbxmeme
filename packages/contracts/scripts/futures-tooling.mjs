import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { toFunctionSelector } from "viem";

const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x(?:[0-9a-fA-F]{2})*$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/;
const SETTINGS_KEYS = ["evmVersion", "optimizer"];
const OPTIMIZER_KEYS = ["enabled", "runs"];
const SOURCE_KEYS = ["path", "sha256"];
const CONTRACT_PROOF_KEYS = [
  "abiHash",
  "creationBytecodeHash",
  "name",
  "runtimeBytecodeHash",
  "runtimeBytes",
  "source",
];
const COMPILE_KEYS = ["compiler", "contracts", "schema", "settings", "sources"];
const DEPLOYMENT_MANIFEST_KEYS = [
  "chainId",
  "compiler",
  "deployer",
  "entries",
  "schema",
  "settings",
];
const DEPLOYMENT_KEYS = [
  "abiHash",
  "address",
  "chainId",
  "compiler",
  "constructorArgs",
  "constructorArgsEncoded",
  "contract",
  "deployedRuntimeBytecodeHash",
  "deployer",
  "deploymentIndex",
  "creationBytecodeHash",
  "nonce",
  "runtimeBytecodeHash",
  "runtimeBytes",
  "schema",
  "settings",
  "source",
  "sourceClosure",
];

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys mismatch: ${actual.join(",")}`);
  }
};

const assertSettings = (settings) => {
  exactKeys(settings, SETTINGS_KEYS, "settings");
  exactKeys(settings.optimizer, OPTIMIZER_KEYS, "settings.optimizer");
  if (settings.evmVersion !== "shanghai") throw new Error("evmVersion must be shanghai");
  if (settings.optimizer.enabled !== true || settings.optimizer.runs !== 200) {
    throw new Error("optimizer settings mismatch");
  }
};

const assertPath = (value, label) => {
  if (typeof value !== "string" || !SAFE_PATH.test(value) || value.includes("//")) {
    throw new Error(`${label} is not a safe repository-relative path`);
  }
};

const assertHash = (value, label) => {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(`${label} must be a lowercase bytes32`);
};

const assertSource = (source, label) => {
  exactKeys(source, SOURCE_KEYS, label);
  assertPath(source.path, `${label}.path`);
  assertHash(source.sha256, `${label}.sha256`);
};

export const stableJson = (value) => {
  const canonicalize = (item) => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonicalize(item[key])]));
    }
    return item;
  };
  return `${JSON.stringify(canonicalize(value))}\n`;
};

export const assertCompileProof = (proof) => {
  exactKeys(proof, COMPILE_KEYS, "compile proof");
  if (proof.schema !== "bnbx-futures-compile-proof/v1") throw new Error("compile proof schema mismatch");
  if (typeof proof.compiler !== "string" || !proof.compiler.startsWith("0.8.30+commit.")) throw new Error("compiler mismatch");
  assertSettings(proof.settings);
  if (!Array.isArray(proof.sources) || proof.sources.length === 0) throw new Error("sources required");
  proof.sources.forEach((source, index) => assertSource(source, `sources[${index}]`));
  if (!Array.isArray(proof.contracts) || proof.contracts.length === 0) throw new Error("contracts required");
  proof.contracts.forEach((contract, index) => {
    exactKeys(contract, CONTRACT_PROOF_KEYS, `contracts[${index}]`);
    assertPath(contract.source, `contracts[${index}].source`);
    if (typeof contract.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(contract.name)) throw new Error("invalid contract name");
    for (const field of ["abiHash", "creationBytecodeHash", "runtimeBytecodeHash"]) assertHash(contract[field], field);
    if (!Number.isSafeInteger(contract.runtimeBytes) || contract.runtimeBytes < 1 || contract.runtimeBytes > 24_576) throw new Error("runtime exceeds EIP-170");
  });
  return proof;
};

export const assertDeploymentArtifact = (artifact, expected = {}) => {
  exactKeys(artifact, DEPLOYMENT_KEYS, "deployment artifact");
  if (artifact.schema !== "bnbx-futures-local-deployment/v1") throw new Error("deployment schema mismatch");
  if (artifact.chainId !== 31_337) throw new Error("local chainId mismatch");
  for (const field of ["deploymentIndex", "nonce"]) if (!Number.isSafeInteger(artifact[field]) || artifact[field] < 0) throw new Error(`${field} invalid`);
  if (artifact.deploymentIndex !== artifact.nonce) throw new Error("deployment index must bind nonce");
  if (!ADDRESS.test(artifact.address) || !ADDRESS.test(artifact.deployer)) throw new Error("invalid deployment address");
  assertPath(artifact.source, "source");
  if (typeof artifact.contract !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(artifact.contract)) throw new Error("invalid contract identity");
  if (!Array.isArray(artifact.constructorArgs)) throw new Error("constructorArgs must be an array");
  if (!HEX.test(artifact.constructorArgsEncoded)) throw new Error("constructorArgsEncoded invalid");
  if (!Array.isArray(artifact.sourceClosure) || artifact.sourceClosure.length === 0) throw new Error("sourceClosure required");
  artifact.sourceClosure.forEach((source, index) => assertSource(source, `sourceClosure[${index}]`));
  assertSettings(artifact.settings);
  if (typeof artifact.compiler !== "string" || !artifact.compiler.startsWith("0.8.30+commit.")) throw new Error("compiler mismatch");
  for (const field of ["abiHash", "creationBytecodeHash", "runtimeBytecodeHash", "deployedRuntimeBytecodeHash"]) assertHash(artifact[field], field);
  if (!Number.isSafeInteger(artifact.runtimeBytes) || artifact.runtimeBytes < 1 || artifact.runtimeBytes > 24_576) throw new Error("runtime exceeds EIP-170");
  for (const field of ["contract", "source", "address", "nonce", "constructorArgs", "constructorArgsEncoded", "sourceClosure", "deployedRuntimeBytecodeHash"]) {
    if (!(field in expected)) continue;
    const actualValue = artifact[field];
    const expectedValue = expected[field];
    const matches =
      field === "address" &&
      typeof actualValue === "string" &&
      typeof expectedValue === "string"
        ? actualValue.toLowerCase() === expectedValue.toLowerCase()
        : actualValue && typeof actualValue === "object"
        ? stableJson(actualValue) === stableJson(expectedValue)
        : actualValue === expectedValue;
    if (!matches) throw new Error(`${field} identity mismatch`);
  }
  return artifact;
};

export const assertDeploymentManifest = (manifest, expectedOrder) => {
  exactKeys(manifest, DEPLOYMENT_MANIFEST_KEYS, "deployment manifest");
  if (manifest.schema !== "bnbx-futures-local-deployment-manifest/v1") {
    throw new Error("deployment manifest schema mismatch");
  }
  if (manifest.chainId !== 31_337) throw new Error("local chainId mismatch");
  if (!ADDRESS.test(manifest.deployer)) throw new Error("invalid manifest deployer");
  if (
    typeof manifest.compiler !== "string" ||
    !manifest.compiler.startsWith("0.8.30+commit.")
  ) {
    throw new Error("compiler mismatch");
  }
  assertSettings(manifest.settings);
  if (!Array.isArray(expectedOrder) || expectedOrder.length !== 10) {
    throw new Error("expected deployment order must contain ten entries");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== 10) {
    throw new Error("deployment manifest must contain ten entries");
  }

  const addresses = new Set();
  manifest.entries.forEach((entry, index) => {
    assertDeploymentArtifact(entry, {
      ...expectedOrder[index],
      nonce: index,
    });
    if (
      entry.chainId !== manifest.chainId ||
      entry.deployer.toLowerCase() !== manifest.deployer.toLowerCase() ||
      entry.compiler !== manifest.compiler ||
      stableJson(entry.settings) !== stableJson(manifest.settings)
    ) {
      throw new Error(`entries[${index}] manifest identity mismatch`);
    }
    if (!entry.sourceClosure.some(({ path }) => path === entry.source)) {
      throw new Error(`entries[${index}] source closure omits primary source`);
    }
    const normalizedAddress = entry.address.toLowerCase();
    if (addresses.has(normalizedAddress)) {
      throw new Error(`entries[${index}] duplicate deployment address`);
    }
    addresses.add(normalizedAddress);
  });
  return manifest;
};

const identifierTokens = (text) => `${text}`.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
const shortProhibitedStem = String.fromCharCode(97, 100, 108);
const longProhibitedStem = `auto${"de"}leverage`;
const mixedCaseProhibitedInfix = new RegExp(
  `[a-z0-9]${"A"}${"d"}${"l"}[A-Z0-9]`,
);
export const containsProhibitedIdentifier = (text) => identifierTokens(text).some((token) => {
  const normalized = token.toLowerCase();
  return normalized === shortProhibitedStem || normalized.startsWith(shortProhibitedStem) || normalized.endsWith(shortProhibitedStem) || normalized.includes(longProhibitedStem) || mixedCaseProhibitedInfix.test(token);
});

const decodeIdentifier = (hex) => Buffer.from(hex, "hex").toString("utf8");
const prohibitedContractIdentifiers = [
  "61646c",
  "6175746f44656c65766572616765",
  "6578656375746541646c",
  "7375626d697441646c",
  "636c61696d41646c",
  "6f776e6572",
  "7472616e736665724f776e657273686970",
  "75706772616465546f",
  "75706772616465546f416e6443616c6c",
  "696e697469616c697a65",
  "73657441646d696e",
  "61646d696e",
  "726573637565546f6b656e73",
  "7377656570",
].map(decodeIdentifier);
const prohibitedArgumentShapes = [
  "()",
  "(address)",
  "(uint64)",
  "(uint256)",
  "(bytes32)",
  "(bytes)",
  "(address,uint256)",
  "(uint64,uint256)",
  "(uint64,address)",
  "(address,bytes)",
  "(uint256,bytes)",
  "(address,address,uint256)",
];
const prohibitedSelectors = new Set(
  prohibitedContractIdentifiers.flatMap((name) =>
    prohibitedArgumentShapes.map((shape) =>
      toFunctionSelector(`${name}${shape}`).slice(2),
    ),
  ),
);

export const assertNoProhibitedSelectors = (abi, runtime) => {
  if (!Array.isArray(abi) || typeof runtime !== "string") {
    throw new Error("ABI and runtime are required for selector audit");
  }
  for (const entry of abi) {
    if (
      entry?.type === "function" &&
      prohibitedContractIdentifiers.includes(entry.name)
    ) {
      throw new Error(`ABI exposes prohibited function ${entry.name}`);
    }
    if (entry?.type === "fallback" || entry?.type === "receive") {
      throw new Error(`ABI exposes prohibited function type ${entry.type}`);
    }
  }
  const normalizedRuntime = runtime.toLowerCase().replace(/^0x/, "");
  for (const selector of prohibitedSelectors) {
    if (normalizedRuntime.includes(`63${selector}`)) {
      throw new Error(`runtime contains prohibited selector 0x${selector}`);
    }
  }
};

export const assertSafeTree = (root) => {
  const absoluteRoot = resolve(root);
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      const relative = path.slice(absoluteRoot.length + 1);
      assertPath(relative.split(sep).join("/"), "tree path");
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`symbolic link rejected: ${relative}`);
      if (stat.isDirectory()) visit(path);
      else if (!stat.isFile()) throw new Error(`non-file rejected: ${relative}`);
    }
  };
  visit(absoluteRoot);
};

export const atomicReplaceDirectory = (target, writer) => {
  const absoluteTarget = resolve(target);
  const parent = dirname(absoluteTarget);
  const stem = basename(absoluteTarget);
  mkdirSync(parent, { recursive: true });
  const lock = join(parent, `.${stem}.lock`);
  mkdirSync(lock);
  const staging = join(parent, `.${stem}.staging-${randomUUID()}`);
  const backup = join(parent, `.${stem}.backup-${randomUUID()}`);
  try {
    for (const entry of readdirSync(parent)) {
      if (
        entry.startsWith(`.${stem}.staging-`) ||
        entry.startsWith(`.${stem}.backup-`) ||
        entry.startsWith(`.${stem}.recovery-`)
      ) {
        rmSync(join(parent, entry), { recursive: true, force: true });
      }
    }
    mkdirSync(staging);
    writer(staging);
    assertSafeTree(staging);
    if (existsSync(absoluteTarget)) renameSync(absoluteTarget, backup);
    try {
      renameSync(staging, absoluteTarget);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, absoluteTarget);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
};
