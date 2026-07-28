import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  parseEther,
} from "viem";

const projectRoot = resolve(import.meta.dirname, "..");
const entrypoints = [
  "test/BNBXToken.t.sol",
  "test/FeeMath.t.sol",
  "test/FactoryIntegration.t.sol",
  "test/TemplateConfig.t.sol",
  "test/BNBXAutoLiquidityToken.t.sol",
  "test/AutoLiquidityFactoryIntegration.t.sol",
  "test/BNBXRewardVault.t.sol",
];

function loadSource(path) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function findImports(importPath) {
  const candidates = [
    importPath,
    `src/${importPath}`,
    `test/${importPath}`,
    importPath.replace(/^\.\.\//, ""),
    importPath.replace(/^\.\.\//, "src/"),
  ];

  for (const candidate of candidates) {
    try {
      return { contents: loadSource(candidate) };
    } catch {
      // Try the next resolution candidate.
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: Object.fromEntries(
    entrypoints.map((path) => [path, { content: loadSource(path) }]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors ?? []).filter((error) => error.severity === "error");
if (errors.length > 0) {
  throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
}

const provider = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 2, defaultBalance: 1000 },
  chain: { chainId: 31_337 },
});
const accounts = await provider.request({ method: "eth_accounts", params: [] });
const account = accounts[0];
const localChain = defineChain({
  id: 31_337,
  name: "BNBX Local",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const publicClient = createPublicClient({ chain: localChain, transport: custom(provider) });
const walletClient = createWalletClient({
  account,
  chain: localChain,
  transport: custom(provider),
});

async function deploy(artifact, args = []) {
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
    gas: 28_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || receipt.status !== "success") {
    throw new Error("Contract deployment failed");
  }
  return receipt.contractAddress;
}

function feeOn(grossAmount) {
  return (grossAmount * 50n + 9_999n) / 10_000n;
}

function grossForExactNet(requiredNet) {
  let gross = (requiredNet * 10_000n + 9_949n) / 9_950n;
  while (gross - feeOn(gross) > requiredNet) gross -= 1n;
  while (gross - feeOn(gross) < requiredNet) gross += 1n;
  return gross;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const suites = [
  {
    source: "test/BNBXRewardVault.t.sol",
    contract: "BNBXRewardVaultIntegrationTest",
    tests: [
      "testHolderRewardsFollowConfiguredShares",
      "testQueuedRewardsReleaseWhenFirstShareArrives",
      "testLPRewardsUseCustodiedUserLiquidity",
      "testLPWithdrawalStopsFutureRewardsWithoutLosingPastRewards",
      "testShareChangesDoNotStealPastRewards",
    ],
  },
  {
    source: "test/BNBXToken.t.sol",
    contract: "BNBXTokenTest",
    tests: ["testFixedSupplyIsOneBillion", "testMetadata", "testTransferHasNoTax"],
  },
  {
    source: "test/FeeMath.t.sol",
    contract: "FeeMathTest",
    tests: ["testFiveBNBFillGrossAmount", "testFeeRoundsUp"],
  },
  {
    source: "test/TemplateConfig.t.sol",
    contract: "TemplateConfigTest",
    tests: [
      "testStandardTemplateAcceptsZeroTax",
      "testStandardTemplateRejectsAnyTax",
      "testAdvancedTemplateAllowsExactlyTenPercentPerSide",
      "testRejectsBuyTaxAboveTenPercent",
      "testRejectsSellTaxAboveTenPercent",
      "testAutoLiquidityTaxBoundaryMatrix",
      "testHolderRewardsTaxBoundaryMatrix",
      "testLPRewardsTaxBoundaryMatrix",
    ],
  },
  {
    source: "test/BNBXAutoLiquidityToken.t.sol",
    contract: "BNBXAutoLiquidityTokenTest",
    tests: [
      "testFixedSupplyAndImmutableConfiguration",
      "testBondingCurveTransfersStayTaxFreeBeforeGraduation",
      "testGraduationSeedTransferIsTaxExempt",
      "testBuyTaxActivatesOnlyAfterGraduation",
      "testSellUsesIndependentSellTax",
      "testRejectsTaxAboveTenPercent",
    ],
  },
  {
    source: "test/AutoLiquidityFactoryIntegration.t.sol",
    contract: "AutoLiquidityFactoryIntegrationTest",
    tests: [
      "testCreateWithoutBuyKeepsCurveTaxFree",
      "testAtomicFillGraduatesAndActivatesTax",
      "testCreatesHolderRewardsTemplateWithExcludedCurveAndPair",
      "testCreatesLPRewardsTemplateAndConfiguresPairAsset",
    ],
  },
  {
    source: "test/FactoryIntegration.t.sol",
    contract: "FactoryIntegrationTest",
    tests: [
      "testCreateBuyFillGraduateAndBurnLPAtomically",
      "testCreateWithoutInitialBuy",
      "testGraduationTargetEndpoints",
      "testRejectsOversizedMetadataURI",
      "testBuyEnforcesDeadlineAndSlippage",
      "testPairLockDefeatsOneSidedWBNBGriefing",
      "testFailedRefundRevertsCompleteBuy",
      "testRejectingFeeRecipientRevertsCreation",
      "testFeeRecipientCannotReenterFactory",
      "testGraduatedLaunchCannotTradeAgain",
    ],
  },
  {
    source: "test/FactoryIntegration.t.sol",
    contract: "TradingIntegrationTest",
    tests: ["testPartialBuyThenSellChargesFeeBothWays"],
  },
];

const suiteFilter = process.env.TEST_SUITE;
const selectedSuites = suiteFilter
  ? suites.filter((suite) => suite.contract === suiteFilter)
  : suites;
if (selectedSuites.length === 0) {
  throw new Error(`Unknown TEST_SUITE: ${suiteFilter}`);
}

for (const suite of selectedSuites) {
  const artifact = output.contracts[suite.source][suite.contract];
  const deploymentHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    gas: 28_000_000n,
  });
  const deploymentReceipt = await publicClient.waitForTransactionReceipt({
    hash: deploymentHash,
  });
  const expectedAddress = deploymentReceipt.contractAddress;
  if (!expectedAddress) throw new Error(`${suite.contract} deployment has no address`);

  if (suite.contract.endsWith("IntegrationTest")) {
    const fundingHash = await walletClient.sendTransaction({
      to: expectedAddress,
      value: parseEther("10"),
    });
    await publicClient.waitForTransactionReceipt({ hash: fundingHash });
  }

  const setup = artifact.abi.find(
    (item) => item.type === "function" && item.name === "setUp",
  );
  if (setup) {
    const hash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "setUp",
      gas: 28_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(
        `${suite.contract}.setUp failed: ${JSON.stringify(receipt, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        )}`,
      );
    }
  }

  let snapshot = await provider.request({ method: "evm_snapshot", params: [] });
  for (const [testIndex, testName] of suite.tests.entries()) {
    if (testIndex > 0) {
      await provider.request({ method: "evm_revert", params: [snapshot] });
      snapshot = await provider.request({ method: "evm_snapshot", params: [] });
    }
    const hash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: testName,
      gas: 28_000_000n,
      value:
        suite.contract === "FactoryIntegrationTest" ? parseEther("0") : undefined,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      let detail = "";
      try {
        await publicClient.simulateContract({
          account,
          address: expectedAddress,
          abi: artifact.abi,
          functionName: testName,
        });
      } catch (error) {
        detail = `: ${error.shortMessage ?? error.message}`;
      }
      const gasUsed = receipt.gasUsed?.toString() ?? "unknown";
      throw new Error(
        `${suite.contract}.${testName} failed (gasUsed=${gasUsed})${detail}`,
      );
    }
    console.log(`PASS ${suite.contract}.${testName}`);
  }
}

if (suiteFilter) {
  console.log(`PASS filtered suite ${suiteFilter}`);
  process.exit(0);
}

const integrationArtifacts = output.contracts["test/FactoryIntegration.t.sol"];
const pancakeFactoryArtifact = integrationArtifacts.MockPancakeFactory;
const wbnbArtifact = integrationArtifacts.MockWBNB;
const routerArtifact = integrationArtifacts.MockPancakeRouter;
const launchFactoryArtifact = output.contracts["src/BNBXFactory.sol"].BNBXFactory;
const tokenArtifact = output.contracts["src/BNBXToken.sol"].BNBXToken;
const curveArtifact = output.contracts["src/BondingCurve.sol"].BondingCurve;
const pairArtifact = integrationArtifacts.MockPair;

const pancakeFactoryAddress = await deploy(pancakeFactoryArtifact);
const wbnbAddress = await deploy(wbnbArtifact);
const routerAddress = await deploy(routerArtifact, [
  pancakeFactoryAddress,
  wbnbAddress,
]);
const launchFactoryAddress = await deploy(launchFactoryArtifact, [
  accounts[1],
  routerAddress,
]);
const dead = "0x000000000000000000000000000000000000dEaD";
const eightHundredMillion = parseEther("800000000");
const twoHundredMillion = parseEther("200000000");

for (let target = 1; target <= 18; target += 1) {
  const targetWei = parseEther((target / 100).toFixed(2));
  const grossBuy = grossForExactNet(targetWei);
  const block = await publicClient.getBlock();
  const tokenName = `Target ${target}`;
  const tokenSymbol = `T${target}`;
  let vanitySalt;
  let vanityStart = BigInt(target) * 500_000n;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [found, candidate] = await publicClient.readContract({
      address: launchFactoryAddress,
      abi: launchFactoryArtifact.abi,
      functionName: "findVanitySalt",
      args: [tokenName, tokenSymbol, vanityStart, 20_000n],
    });
    if (found) {
      vanitySalt = candidate;
      break;
    }
    vanityStart += 20_000n;
  }
  if (!vanitySalt) throw new Error(`Target ${target}: vanity salt not found`);
  const hash = await walletClient.writeContract({
    address: launchFactoryAddress,
    abi: launchFactoryArtifact.abi,
    functionName: "createVanityTokenAndBuy",
    args: [{
      name: tokenName,
      symbol: tokenSymbol,
      graduationTargetBNB: target,
      metadataURI: "",
      vanitySalt,
    }, {
      minTokensOut: eightHundredMillion,
      deadline: block.timestamp + 1_200n,
      refundRecipient: account,
    }],
    value: parseEther("0.001") + grossBuy,
    gas: 28_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    let detail = "";
    let traceDetail = "";
    try {
      const trace = await provider.request({
        method: "debug_traceTransaction",
        params: [hash, {}],
      });
      if (trace?.returnValue) {
        traceDetail = ` revertData=0x${trace.returnValue}`;
      } else if (trace?.structLogs?.length) {
        const last = trace.structLogs.at(-1);
        traceDetail = ` lastOp=${last.op} depth=${last.depth} pc=${last.pc}`;
      }
    } catch {
      // Trace support varies by local EVM.
    }
    try {
      await publicClient.simulateContract({
        account,
        address: launchFactoryAddress,
        abi: launchFactoryArtifact.abi,
        functionName: "createVanityTokenAndBuy",
        args: [{
          name: tokenName,
          symbol: tokenSymbol,
          graduationTargetBNB: target,
          metadataURI: "",
          vanitySalt,
        }, {
          minTokensOut: eightHundredMillion,
          deadline: block.timestamp + 1_200n,
          refundRecipient: account,
        }],
        value: parseEther("0.001") + grossBuy,
      });
    } catch (error) {
      detail = error.shortMessage ?? error.message;
    }
    throw new Error(
      `Target ${target}: creation failed (gasUsed=${receipt.gasUsed}) ${detail}${traceDetail}`,
    );
  }

  const token = await publicClient.readContract({
    address: launchFactoryAddress,
    abi: launchFactoryArtifact.abi,
    functionName: "allTokens",
    args: [BigInt(target - 1)],
  });
  const curve = await publicClient.readContract({
    address: launchFactoryAddress,
    abi: launchFactoryArtifact.abi,
    functionName: "curveOf",
    args: [token],
  });
  const pair = await publicClient.readContract({
    address: pancakeFactoryAddress,
    abi: pancakeFactoryArtifact.abi,
    functionName: "getPair",
    args: [token, wbnbAddress],
  });
  const [state, principal, userTokens, pairTokens, burnedLP] = await Promise.all([
    publicClient.readContract({
      address: curve,
      abi: curveArtifact.abi,
      functionName: "state",
    }),
    publicClient.readContract({
      address: curve,
      abi: curveArtifact.abi,
      functionName: "realBNBPrincipal",
    }),
    publicClient.readContract({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [account],
    }),
    publicClient.readContract({
      address: token,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [pair],
    }),
    publicClient.readContract({
      address: pair,
      abi: pairArtifact.abi,
      functionName: "liquidityBalance",
      args: [dead],
    }),
  ]);

  check(Number(state) === 2, `Target ${target}: not graduated`);
  check(principal === targetWei, `Target ${target}: principal mismatch`);
  check(userTokens === eightHundredMillion, `Target ${target}: curve allocation mismatch`);
  check(pairTokens === twoHundredMillion, `Target ${target}: LP allocation mismatch`);
  check(burnedLP > 0n, `Target ${target}: LP was not burned`);
  console.log(`PASS GraduationTarget.${(target / 100).toFixed(2)}BNB`);
}

await provider.disconnect();
