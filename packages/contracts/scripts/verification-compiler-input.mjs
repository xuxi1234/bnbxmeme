import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

const importPattern = /\bimport\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']\s*;/g;

function dependencyPath(sourcePath, importPath) {
  if (!importPath.startsWith(".")) {
    throw new Error(
      `Unsupported non-relative import in ${sourcePath}: ${importPath}`,
    );
  }
  const dependency = posix.normalize(
    posix.join(posix.dirname(sourcePath), importPath),
  );
  if (dependency.startsWith("../") || posix.isAbsolute(dependency)) {
    throw new Error(
      `Import escapes contract root in ${sourcePath}: ${importPath}`,
    );
  }
  return dependency;
}

export function collectVerificationSources(root, entryPaths) {
  const pending = [...entryPaths];
  const sources = new Map();

  while (pending.length) {
    const sourcePath = pending.pop();
    if (sources.has(sourcePath)) continue;
    const content = readFileSync(resolve(root, sourcePath), "utf8");
    sources.set(sourcePath, { content });

    importPattern.lastIndex = 0;
    for (const match of content.matchAll(importPattern)) {
      pending.push(dependencyPath(sourcePath, match[1]));
    }
  }

  return Object.fromEntries(
    [...sources.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function createVerificationCompilerInput(root, entryPaths) {
  return {
    language: "Solidity",
    sources: collectVerificationSources(root, entryPaths),
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
}

export function createMainnetVerificationInputs(root, contractVersion) {
  const v4 = contractVersion === "V4";
  if (!v4 && contractVersion !== "V3") {
    throw new Error(`Unsupported contract version: ${contractVersion}`);
  }
  const standardFactorySource = v4
    ? "src/BNBXFactoryV4.sol"
    : "src/BNBXFactory.sol";
  const rewardsFactorySource = v4
    ? "src/BNBXRewardsFactoryV4.sol"
    : "src/BNBXRewardsFactoryV3.sol";
  const tokenDeployerSource = v4
    ? "src/BNBXAdvancedTokenDeployerV4.sol"
    : "src/BNBXAdvancedTokenDeployer.sol";
  const standardTokenSource = v4
    ? "src/BNBXTokenV4.sol"
    : "src/BNBXTokenV3.sol";
  const dividendTokenSource = v4
    ? "src/BNBXDividendTokenV4.sol"
    : "src/BNBXDividendTokenV3.sol";
  const rewardVaultSource = v4
    ? "src/BNBXRewardVaultV4.sol"
    : "src/BNBXRewardVaultV3.sol";

  return {
    standardFactory: createVerificationCompilerInput(root, [
      standardFactorySource,
    ]),
    rewardsFactory: createVerificationCompilerInput(root, [
      rewardsFactorySource,
    ]),
    tokenDeployer: createVerificationCompilerInput(root, [tokenDeployerSource]),
    standardToken: createVerificationCompilerInput(root, [standardTokenSource]),
    holderRewardsToken: createVerificationCompilerInput(root, [
      dividendTokenSource,
    ]),
    lpRewardsToken: createVerificationCompilerInput(root, [
      dividendTokenSource,
    ]),
    rewardVault: createVerificationCompilerInput(root, [rewardVaultSource]),
    bondingCurve: createVerificationCompilerInput(root, [
      "src/BondingCurve.sol",
    ]),
  };
}
