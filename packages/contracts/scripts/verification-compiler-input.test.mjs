import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import solc from "solc";
import {
  createMainnetVerificationInputs,
  createVerificationCompilerInput,
} from "./verification-compiler-input.mjs";

const root = resolve(import.meta.dirname, "..");
const inputs = createMainnetVerificationInputs(root, "V4");

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
