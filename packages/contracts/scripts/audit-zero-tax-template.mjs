import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import { createZeroTaxVerificationInputs } from "./verification-compiler-input.mjs";

const root = resolve(import.meta.dirname, "..");
const inputs = createZeroTaxVerificationInputs(root);

function compile(label, input) {
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    (item) => item.severity === "error",
  );
  if (errors.length) {
    throw new Error(
      `${label} compilation failed:\n${errors
        .map((item) => item.formattedMessage)
        .join("\n")}`,
    );
  }
  return output;
}

const tokenOutput = compile("zero-tax token", inputs.token);
const factoryOutput = compile("zero-tax Factory", inputs.factory);
const token =
  tokenOutput.contracts["src/BNBXZeroTaxToken.sol"].BNBXZeroTaxToken;
const factory =
  factoryOutput.contracts["src/BNBXZeroTaxFactory.sol"].BNBXZeroTaxFactory;

const tokenFunctions = token.abi
  .filter((item) => item.type === "function")
  .map((item) => item.name);
const forbiddenFunctions = [
  "owner",
  "mint",
  "burn",
  "pause",
  "unpause",
  "blacklist",
  "setBlacklist",
  "setTax",
  "setTaxes",
  "setFee",
  "setFees",
  "setMaxWallet",
  "setMaxTransactionAmount",
  "excludeFromFees",
  "upgradeTo",
  "upgradeToAndCall",
  "withdraw",
  "rescue",
];
const exposedForbiddenFunctions = forbiddenFunctions.filter((name) =>
  tokenFunctions.includes(name),
);
if (exposedForbiddenFunctions.length) {
  throw new Error(
    `Zero-tax token exposes forbidden controls: ${exposedForbiddenFunctions.join(", ")}`,
  );
}

const expectedMutatingFunctions = [
  "approve",
  "configureLaunch",
  "transfer",
  "transferFrom",
  "unlockLiquidityPair",
];
const actualMutatingFunctions = token.abi
  .filter(
    (item) =>
      item.type === "function" &&
      item.stateMutability !== "view" &&
      item.stateMutability !== "pure",
  )
  .map((item) => item.name)
  .sort();
if (
  JSON.stringify(actualMutatingFunctions) !==
  JSON.stringify(expectedMutatingFunctions)
) {
  throw new Error(
    `Unexpected mutating token surface: ${actualMutatingFunctions.join(", ")}`,
  );
}

const tokenSources = Object.keys(inputs.token.sources);
if (
  tokenSources.length !== 1 ||
  tokenSources[0] !== "src/BNBXZeroTaxToken.sol"
) {
  throw new Error(`Token verification bundle is not isolated: ${tokenSources}`);
}

const factorySource = readFileSync(
  resolve(root, "src/BNBXZeroTaxFactory.sol"),
  "utf8",
);
if (
  /BNBXDividend|BNBXRewards|marketingWallet|rewardToken|buyTaxes|sellTaxes/.test(
    factorySource,
  )
) {
  throw new Error("Zero-tax Factory source references an advanced template");
}

const webRoot = resolve(root, "../../apps/web");
const factoryDeploymentArtifact = readFileSync(
  resolve(webRoot, "lib/zero-tax-factory-deployment.ts"),
  "utf8",
);
const tokenCreationArtifact = readFileSync(
  resolve(webRoot, "lib/zero-tax-token-creation-bytecode.ts"),
  "utf8",
);
if (!factoryDeploymentArtifact.includes(`0x${factory.evm.bytecode.object}`)) {
  throw new Error(
    "Generated zero-tax Factory bytecode is stale; run export:zero-tax-web-artifact",
  );
}
if (!tokenCreationArtifact.includes(`0x${token.evm.bytecode.object}`)) {
  throw new Error(
    "Generated zero-tax token bytecode is stale; run export:zero-tax-web-artifact",
  );
}
const deploymentPage = readFileSync(
  resolve(webRoot, "app/deploy-testnet/page.tsx"),
  "utf8",
);
if (
  !deploymentPage.includes("zeroTaxFactoryDeploymentBytecode") ||
  deploymentPage.includes("factoryDeploymentBytecode")
) {
  throw new Error(
    "Deployment page is not pinned to the clean zero-tax bytecode",
  );
}

function byteSizes(artifact) {
  return {
    creation: artifact.evm.bytecode.object.length / 2,
    runtime: artifact.evm.deployedBytecode.object.length / 2,
  };
}

const tokenBytes = byteSizes(token);
const factoryBytes = byteSizes(factory);
for (const [label, sizes] of [
  ["Zero-tax token", tokenBytes],
  ["Zero-tax Factory", factoryBytes],
]) {
  if (sizes.creation > 49_152) {
    throw new Error(`${label} initcode exceeds EIP-3860: ${sizes.creation}`);
  }
  if (sizes.runtime > 24_576) {
    throw new Error(`${label} runtime exceeds EIP-170: ${sizes.runtime}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      compiler: solc.version(),
      optimizerRuns: 200,
      evmVersion: "shanghai",
      verificationSources: tokenSources,
      tokenBytes,
      factoryBytes,
      mutatingTokenFunctions: actualMutatingFunctions,
      forbiddenControls: "none",
      webDeploymentArtifacts: "exact",
    },
    null,
    2,
  ),
);
