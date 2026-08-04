import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import solc from "solc";
import {
  createMainnetVerificationInputs,
  createVerificationCompilerInput,
  createZeroTaxVerificationInputs,
} from "./verification-compiler-input.mjs";

const root = resolve(import.meta.dirname, "..");
const inputs = createMainnetVerificationInputs(root, "V4");
const zeroTaxInputs = createZeroTaxVerificationInputs(root);

function compile(compilerInput) {
  const output = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
  const errors = (output.errors ?? []).filter(
    (item) => item.severity === "error",
  );
  assert.deepEqual(
    errors,
    [],
    errors.map((item) => item.formattedMessage).join("\n"),
  );
  return output;
}

function bytecodes(compilation, sourcePath, contractName) {
  const evm = compilation.contracts[sourcePath][contractName].evm;
  return {
    creation: evm.bytecode.object,
    runtime: evm.deployedBytecode.object,
  };
}

test("isolates zero-tax, holder-reward, and LP-reward verification bundles", () => {
  assert.deepEqual(Object.keys(inputs.standardToken.sources), [
    "src/BNBXTokenV4.sol",
  ]);

  const expectedRewardSources = [
    "src/BNBXDividendTokenV4.sol",
    "src/BNBXRewardVaultV4.sol",
    "src/interfaces/IERC20Minimal.sol",
    "src/interfaces/IPancakeV2.sol",
    "src/libraries/TemplateConfigV4.sol",
  ];
  assert.deepEqual(
    Object.keys(inputs.holderRewardsToken.sources),
    expectedRewardSources,
  );
  assert.deepEqual(
    Object.keys(inputs.lpRewardsToken.sources),
    expectedRewardSources,
  );
  assert.notStrictEqual(
    inputs.holderRewardsToken,
    inputs.lpRewardsToken,
    "each reward template must select its own submission object",
  );

  for (const compilerInput of [
    inputs.standardToken,
    inputs.holderRewardsToken,
    inputs.lpRewardsToken,
  ]) {
    const paths = Object.keys(compilerInput.sources);
    assert.equal(
      paths.some((path) => path.includes("Factory")),
      false,
    );
    assert.equal(
      paths.some((path) => path.includes("Deployer")),
      false,
    );
    assert.equal(paths.includes("src/BondingCurve.sol"), false);
  }
});

test("minimal bundles preserve the exact V4 creation and runtime bytecode", () => {
  const legacyInput = createVerificationCompilerInput(root, [
    "src/BNBXFactoryV4.sol",
    "src/BNBXTokenV4.sol",
    "src/BNBXRewardsFactoryV4.sol",
    "src/BNBXAdvancedTokenDeployerV4.sol",
    "src/BNBXDividendTokenV4.sol",
    "src/BNBXRewardVaultV4.sol",
    "src/BondingCurve.sol",
  ]);
  const legacy = compile(legacyInput);
  const targets = [
    [inputs.standardToken, "src/BNBXTokenV4.sol", "BNBXTokenV4"],
    [
      inputs.holderRewardsToken,
      "src/BNBXDividendTokenV4.sol",
      "BNBXDividendTokenV4",
    ],
    [
      inputs.lpRewardsToken,
      "src/BNBXDividendTokenV4.sol",
      "BNBXDividendTokenV4",
    ],
    [inputs.rewardVault, "src/BNBXRewardVaultV4.sol", "BNBXRewardVaultV4"],
    [inputs.bondingCurve, "src/BondingCurve.sol", "BondingCurve"],
    [inputs.standardFactory, "src/BNBXFactoryV4.sol", "BNBXFactoryV4"],
    [
      inputs.tokenDeployer,
      "src/BNBXAdvancedTokenDeployerV4.sol",
      "BNBXAdvancedTokenDeployerV4",
    ],
    [
      inputs.rewardsFactory,
      "src/BNBXRewardsFactoryV4.sol",
      "BNBXRewardsFactoryV4",
    ],
  ];

  for (const [compilerInput, sourcePath, contractName] of targets) {
    const minimal = compile(compilerInput);
    assert.deepEqual(
      bytecodes(minimal, sourcePath, contractName),
      bytecodes(legacy, sourcePath, contractName),
      `${contractName} bytecode changed in its minimal verification bundle`,
    );
  }
});

test("keeps V3 verification supported with template-scoped inputs", () => {
  const v3Inputs = createMainnetVerificationInputs(root, "V3");
  assert.deepEqual(Object.keys(v3Inputs.standardToken.sources), [
    "src/BNBXTokenV3.sol",
  ]);
  assert.equal(
    Object.keys(v3Inputs.holderRewardsToken.sources).includes(
      "src/BNBXAdvancedTokenDeployer.sol",
    ),
    false,
  );
  compile(v3Inputs.standardToken);
  compile(v3Inputs.holderRewardsToken);
});

test("publishes the new zero-tax token as one independent source", () => {
  assert.deepEqual(Object.keys(zeroTaxInputs.token.sources), [
    "src/BNBXZeroTaxToken.sol",
  ]);
  assert.deepEqual(Object.keys(zeroTaxInputs.factory.sources), [
    "src/BNBXZeroTaxFactory.sol",
    "src/BNBXZeroTaxToken.sol",
    "src/BondingCurve.sol",
    "src/interfaces/IERC20Minimal.sol",
    "src/interfaces/IPancakeV2.sol",
    "src/libraries/FeeMath.sol",
  ]);
  assert.equal(
    Object.keys(zeroTaxInputs.token.sources).some(
      (path) => path.includes("Factory") || path.includes("Dividend"),
    ),
    false,
  );
  compile(zeroTaxInputs.token);
  compile(zeroTaxInputs.factory);
});

test("keeps zero-tax source publication read-only and scheduled", () => {
  const verifier = readFileSync(
    resolve(root, "scripts/verify-zero-tax-source-mainnet.mjs"),
    "utf8",
  );
  const workflow = readFileSync(
    resolve(root, "../../.github/workflows/verify-zero-tax-mainnet.yml"),
    "utf8",
  );
  for (const forbidden of [
    "DEPLOYER_PRIVATE_KEY",
    "privateKeyToAccount",
    "createWalletClient",
    "writeContract",
    "deployContract",
    "sendTransaction",
  ]) {
    assert.equal(verifier.includes(forbidden), false);
  }
  assert.match(workflow, /cron:\s*"\*\/15 \* \* \* \*"/);
  assert.match(workflow, /audit:zero-tax/);
  assert.match(workflow, /verify-source:zero-tax-mainnet/);
});
