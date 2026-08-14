import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeDeployData,
  encodeAbiParameters,
  getContractAddress,
  hashTypedData,
  keccak256,
  padHex,
  parseAbiParameters,
  parseEther,
  toFunctionSelector,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const projectRoot = resolve(import.meta.dirname, "..");
const suiteFilter = process.env.TEST_SUITE;
const entrypoints = [
  "test/BNBXToken.t.sol",
  "test/FeeMath.t.sol",
  "test/FactoryIntegration.t.sol",
  "test/TemplateConfig.t.sol",
  "test/BNBXAutoLiquidityToken.t.sol",
  "test/DividendFactoryIntegration.t.sol",
  "test/DividendTaxProcessing.t.sol",
  "test/BNBXRewardVaultV3.t.sol",
  "test/BNBXRewardVaultV4.t.sol",
  "test/BNBXV4Security.t.sol",
  "test/BNBXZeroTaxTemplate.t.sol",
  "test/BNBXHolderRewardsTemplate.t.sol",
  "test/BNBXLPRewardsTemplate.t.sol",
  "test/DividendTaxProcessingV4.t.sol",
  "test/BNBXRewardVault.t.sol",
  "test/FuturesTypes.t.sol",
  "test/RiskEngine.t.sol",
  "test/ClearingHouse.t.sol",
  "test/OrderBook.t.sol",
  "test/FuturesOracle.t.sol",
];
const isolatedEntrypoints = {
  FuturesTypesTest: ["test/FuturesTypes.t.sol"],
  RiskEngineTest: ["test/RiskEngine.t.sol"],
  ClearingHouseTest: ["test/ClearingHouse.t.sol"],
  OrderBookTest: ["test/OrderBook.t.sol"],
  FuturesOracleTest: ["test/FuturesOracle.t.sol"],
};
const compilationEntrypoints = isolatedEntrypoints[suiteFilter] ?? entrypoints;

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
    compilationEntrypoints.map((path) => [path, { content: loadSource(path) }]),
  ),
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

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImports }),
);
const errors = (output.errors ?? []).filter(
  (error) => error.severity === "error",
);
if (errors.length > 0) {
  throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
}

const localChain = defineChain({
  id: 31_337,
  name: "BNBX Local",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
let provider;
let accounts;
let account;
let signingAccounts;
let publicClient;
let walletClient;

async function resetLocalChain() {
  provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 5, defaultBalance: 1000 },
    miner: { blockGasLimit: 120_000_000 },
    chain: {
      chainId: 31_337,
      allowUnlimitedContractSize: true,
      allowUnlimitedInitCodeSize: true,
    },
  });
  accounts = await provider.request({ method: "eth_accounts", params: [] });
  const initialAccounts = provider.getInitialAccounts();
  signingAccounts = accounts.map((address) =>
    privateKeyToAccount(initialAccounts[address.toLowerCase()].secretKey),
  );
  account = accounts[0];
  publicClient = createPublicClient({
    chain: localChain,
    transport: custom(provider),
  });
  walletClient = createWalletClient({
    account,
    chain: localChain,
    transport: custom(provider),
  });
}

await resetLocalChain();

async function deploy(artifact, args = []) {
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
    gas: 100_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress || receipt.status !== "success") {
    throw new Error("Contract deployment failed");
  }
  return receipt.contractAddress;
}

function feeOn(grossAmount) {
  return (grossAmount * 100n + 9_999n) / 10_000n;
}

function grossForExactNet(requiredNet) {
  let gross = (requiredNet * 10_000n + 9_899n) / 9_900n;
  while (gross - feeOn(gross) > requiredNet) gross -= 1n;
  while (gross - feeOn(gross) < requiredNet) gross += 1n;
  return gross;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const orderFields = [
  { name: "trader", type: "address" },
  { name: "side", type: "uint8" },
  { name: "quantity", type: "uint128" },
  { name: "limitPrice", type: "uint128" },
  { name: "leverage", type: "uint8" },
  { name: "nonce", type: "uint64" },
  { name: "deadline", type: "uint64" },
  { name: "reduceOnly", type: "bool" },
  { name: "role", type: "uint8" },
];
const orderTypes = {
  Order: orderFields,
};
const cancelOrderAbi = [
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "order", type: "tuple", components: orderFields }],
    outputs: [],
  },
];

function orderDomain(verifyingContract, overrides = {}) {
  return {
    name: "BNBX Futures",
    version: "1",
    chainId: localChain.id,
    verifyingContract,
    ...overrides,
  };
}

async function runInitialOrderBookTest(fixtureAddress, fixtureArtifact) {
  const fixtureRead = (functionName) =>
    publicClient.readContract({
      address: fixtureAddress,
      abi: fixtureArtifact.abi,
      functionName,
    });
  const [
    collateralAddress,
    clearingHouseAddress,
    orderBookAddress,
    riskEngineAddress,
    marketStateProviderAddress,
  ] = await Promise.all([
    fixtureRead("collateral"),
    fixtureRead("clearingHouse"),
    fixtureRead("orderBook"),
    fixtureRead("riskEngine"),
    fixtureRead("marketStateProvider"),
  ]);
  const collateralArtifact =
    output.contracts["test/futures/FuturesCollateralMock.sol"]
      .FuturesCollateralMock;
  const clearingArtifact =
    output.contracts["src/futures/ClearingHouse.sol"].ClearingHouse;
  const orderBookArtifact =
    output.contracts["src/futures/OrderBook.sol"].OrderBook;
  const traderWallets = [1, 2, 3].map((index) =>
    createWalletClient({
      account: accounts[index],
      chain: localChain,
      transport: custom(provider),
    }),
  );
  const deposit = 1_000n * 10n ** 18n;
  for (let index = 0; index < traderWallets.length; index += 1) {
    let hash = await walletClient.writeContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "mint",
      args: [accounts[index + 1], deposit],
    });
    let fundingReceipt = await publicClient.waitForTransactionReceipt({ hash });
    check(fundingReceipt.status === "success", "OrderBook fixture mint failed");
    hash = await traderWallets[index].writeContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "approve",
      args: [clearingHouseAddress, deposit],
    });
    fundingReceipt = await publicClient.waitForTransactionReceipt({ hash });
    check(
      fundingReceipt.status === "success",
      "OrderBook fixture approval failed",
    );
    hash = await traderWallets[index].writeContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "deposit",
      args: [deposit],
      gas: 1_000_000n,
    });
    fundingReceipt = await publicClient.waitForTransactionReceipt({ hash });
    check(
      fundingReceipt.status === "success",
      "OrderBook fixture deposit failed",
    );
  }
  const fundedAvailable = await Promise.all(
    accounts.slice(1, 4).map((trader) =>
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [trader],
      }),
    ),
  );
  check(
    fundedAvailable.every((value) => value === deposit),
    `OrderBook fixture funding mismatch: ${fundedAvailable.join(",")}`,
  );
  let snapshot = await provider.request({ method: "evm_snapshot", params: [] });

  const quantity = 10n * 10n ** 18n;
  const maker = {
    trader: accounts[1],
    side: 0,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 11n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const taker = {
    trader: accounts[2],
    side: 1,
    quantity,
    limitPrice: 19n * 10n ** 17n,
    leverage: 3,
    nonce: 21n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  const domain = orderDomain(orderBookAddress);
  const signOrder = (order, signerIndex, signedDomain = domain) =>
    signingAccounts[signerIndex].signTypedData({
      domain: signedDomain,
      types: orderTypes,
      primaryType: "Order",
      message: order,
    });
  const sendMatch = async (
    makerOrder,
    makerOrderSignature,
    takerOrder,
    takerOrderSignature,
    fill,
  ) => {
    const transactionHash = await walletClient.writeContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "matchOrders",
      args: [
        makerOrder,
        makerOrderSignature,
        takerOrder,
        takerOrderSignature,
        fill,
      ],
      gas: 10_000_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash: transactionHash });
  };
  const signAndMatch = async (makerOrder, takerOrder, fill) => {
    const makerIndex = accounts.findIndex(
      (candidate) =>
        candidate.toLowerCase() === makerOrder.trader.toLowerCase(),
    );
    const takerIndex = accounts.findIndex(
      (candidate) =>
        candidate.toLowerCase() === takerOrder.trader.toLowerCase(),
    );
    const [signedMaker, signedTaker] = await Promise.all([
      signOrder(makerOrder, makerIndex),
      signOrder(takerOrder, takerIndex),
    ]);
    return sendMatch(makerOrder, signedMaker, takerOrder, signedTaker, fill);
  };
  const resetOrderBookState = async () => {
    await provider.request({ method: "evm_revert", params: [snapshot] });
    snapshot = await provider.request({ method: "evm_snapshot", params: [] });
  };
  const [makerSignature, takerSignature] = await Promise.all([
    signingAccounts[1].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: maker,
    }),
    signingAccounts[2].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: taker,
    }),
  ]);
  const expectedDomain = keccak256(
    encodeAbiParameters(
      parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"),
      [
        keccak256(
          toHex(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
          ),
        ),
        keccak256(toHex("BNBX Futures")),
        keccak256(toHex("1")),
        BigInt(localChain.id),
        orderBookAddress,
      ],
    ),
  );
  const actualDomain = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "domainSeparator",
  });
  check(actualDomain === expectedDomain, "OrderBook domain separator mismatch");
  const expectedMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: maker,
  });
  const actualMakerHash = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "orderHash",
    args: [maker],
  });
  check(actualMakerHash === expectedMakerHash, "OrderBook order hash mismatch");

  const hash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [maker, makerSignature, taker, takerSignature, quantity],
    gas: 10_000_000n,
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
      traceDetail = trace?.returnValue
        ? `0x${trace.returnValue}`
        : JSON.stringify(
            [...(trace?.structLogs ?? [])]
              .reverse()
              .filter(({ op }) => op === "REVERT")
              .slice(0, 4)
              .map(({ pc, op, depth, stack, memory }) => ({
                pc,
                op,
                depth,
                stack: stack?.slice(-4),
                memory: memory?.slice(0, 2),
              })),
          );
    } catch {
      // Trace support varies by local EVM.
    }
    try {
      await publicClient.simulateContract({
        account,
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "matchOrders",
        args: [maker, makerSignature, taker, takerSignature, quantity],
      });
    } catch (error) {
      detail = error.shortMessage ?? error.message;
    }
    throw new Error(
      `signed maker-price open reverted: ${detail} ${traceDetail}`,
    );
  }
  const [
    makerFilled,
    takerFilled,
    longPosition,
    shortPosition,
    lotId,
    longAvailable,
    shortAvailable,
    longLocked,
    shortLocked,
    matchedOpenInterest,
    earnedRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [expectedMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [
        hashTypedData({
          domain,
          types: orderTypes,
          primaryType: "Order",
          message: taker,
        }),
      ],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 0],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(makerFilled === quantity && takerFilled === quantity, "fill mismatch");
  check(longPosition === quantity, "long position mismatch");
  check(shortPosition === -quantity, "short position mismatch");
  check(
    longAvailable === 990n * 10n ** 18n &&
      shortAvailable === 993_132n * 10n ** 15n &&
      longLocked === 10n * 10n ** 18n &&
      shortLocked === 6_668n * 10n ** 15n &&
      matchedOpenInterest === 20n * 10n ** 18n &&
      earnedRevenue === 200n * 10n ** 15n,
    "per-user open margin, OI, or signed short-Taker fee mismatch",
  );
  const lot = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "lots",
    args: [lotId],
  });
  check(lot[4] === 2n * 10n ** 18n, "execution did not use Maker price");
  check(lot[5] === 10n * 10n ** 18n, "2x long margin mismatch");
  check(lot[6] === 6_668n * 10n ** 15n, "3x risk-floor margin mismatch");
  console.log("PASS OrderBookTest.testDomainHashAndSignedMakerPriceOpen");

  await provider.request({ method: "evm_revert", params: [snapshot] });
  snapshot = await provider.request({ method: "evm_snapshot", params: [] });
  const partialQuantity = 4n * 10n ** 18n;
  const partialFill = 2n * 10n ** 18n;
  const partialMaker = { ...maker, quantity: partialQuantity, nonce: 12n };
  const partialTaker = { ...taker, quantity: partialQuantity, nonce: 22n };
  const [partialMakerSignature, partialTakerSignature] = await Promise.all([
    signingAccounts[1].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: partialMaker,
    }),
    signingAccounts[2].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: partialTaker,
    }),
  ]);
  let partialHash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [
      partialMaker,
      partialMakerSignature,
      partialTaker,
      partialTakerSignature,
      partialFill,
    ],
    gas: 10_000_000n,
  });
  let partialReceipt = await publicClient.waitForTransactionReceipt({
    hash: partialHash,
  });
  check(partialReceipt.status === "success", "partial fill reverted");

  const unauthorizedCancelHash = await traderWallets[1].writeContract({
    address: orderBookAddress,
    abi: cancelOrderAbi,
    functionName: "cancel",
    args: [partialMaker],
    gas: 500_000n,
  });
  const unauthorizedCancelReceipt =
    await publicClient.waitForTransactionReceipt({
      hash: unauthorizedCancelHash,
    });
  check(
    unauthorizedCancelReceipt.status === "reverted",
    "non-owner cancelled an EOA order",
  );
  const cancelHash = await traderWallets[0].writeContract({
    address: orderBookAddress,
    abi: cancelOrderAbi,
    functionName: "cancel",
    args: [partialMaker],
    gas: 500_000n,
  });
  const cancelReceipt = await publicClient.waitForTransactionReceipt({
    hash: cancelHash,
  });
  check(
    cancelReceipt.status === "success",
    "order owner cancellation reverted",
  );
  partialHash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [
      partialMaker,
      partialMakerSignature,
      partialTaker,
      partialTakerSignature,
      partialFill,
    ],
    gas: 10_000_000n,
  });
  partialReceipt = await publicClient.waitForTransactionReceipt({
    hash: partialHash,
  });
  check(partialReceipt.status === "reverted", "cancelled remainder filled");
  const partialMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: partialMaker,
  });
  const partialFilled = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "filled",
    args: [partialMakerHash],
  });
  check(partialFilled === partialFill, "cancellation changed prior fill");

  const independentMaker = {
    ...partialMaker,
    quantity: partialFill,
    nonce: 13n,
  };
  const independentTaker = {
    ...partialTaker,
    quantity: partialFill,
    nonce: 23n,
  };
  const [independentMakerSignature, independentTakerSignature] =
    await Promise.all([
      signingAccounts[1].signTypedData({
        domain,
        types: orderTypes,
        primaryType: "Order",
        message: independentMaker,
      }),
      signingAccounts[2].signTypedData({
        domain,
        types: orderTypes,
        primaryType: "Order",
        message: independentTaker,
      }),
    ]);
  partialHash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [
      independentMaker,
      independentMakerSignature,
      independentTaker,
      independentTakerSignature,
      partialFill,
    ],
    gas: 10_000_000n,
  });
  partialReceipt = await publicClient.waitForTransactionReceipt({
    hash: partialHash,
  });
  check(
    partialReceipt.status === "success",
    "independent nonce was invalidated",
  );
  console.log(
    "PASS OrderBookTest.testCancellationPartialFillAndNonceIsolation",
  );

  await resetOrderBookState();
  const cancelledTakerMaker = { ...maker, nonce: 15n };
  const cancelledTakerOrder = { ...taker, nonce: 25n };
  const [cancelledTakerMakerSignature, cancelledTakerSignature] =
    await Promise.all([
      signOrder(cancelledTakerMaker, 1),
      signOrder(cancelledTakerOrder, 2),
    ]);
  const cancelTakerHash = await traderWallets[1].writeContract({
    address: orderBookAddress,
    abi: cancelOrderAbi,
    functionName: "cancel",
    args: [cancelledTakerOrder],
    gas: 500_000n,
  });
  const cancelTakerReceipt = await publicClient.waitForTransactionReceipt({
    hash: cancelTakerHash,
  });
  check(
    cancelTakerReceipt.status === "success",
    "Taker could not cancel its exact order",
  );
  const cancelledTakerMatch = await sendMatch(
    cancelledTakerMaker,
    cancelledTakerMakerSignature,
    cancelledTakerOrder,
    cancelledTakerSignature,
    quantity,
  );
  const cancelledTakerOrderHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: cancelledTakerOrder,
  });
  const [cancelledTakerFlag, cancelledTakerFilled] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "cancelled",
      args: [cancelledTakerOrderHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [cancelledTakerOrderHash],
    }),
  ]);
  check(
    cancelledTakerMatch.status === "reverted" &&
      cancelledTakerFlag &&
      cancelledTakerFilled === 0n,
    "cancelled Taker order filled or changed cumulative state",
  );
  console.log("PASS OrderBookTest.testCancelledTakerCannotFill");

  await resetOrderBookState();
  const repeatedQuantity = 6n * 10n ** 18n;
  const repeatedFill = 2n * 10n ** 18n;
  const repeatedMaker = {
    ...maker,
    quantity: repeatedQuantity,
    nonce: 14n,
  };
  const repeatedTaker = {
    ...taker,
    quantity: repeatedQuantity,
    nonce: 24n,
  };
  const [repeatedMakerSignature, repeatedTakerSignature] = await Promise.all([
    signOrder(repeatedMaker, 1),
    signOrder(repeatedTaker, 2),
  ]);
  for (let fillIndex = 0; fillIndex < 2; fillIndex += 1) {
    const repeatedReceipt = await sendMatch(
      repeatedMaker,
      repeatedMakerSignature,
      repeatedTaker,
      repeatedTakerSignature,
      repeatedFill,
    );
    check(
      repeatedReceipt.status === "success",
      `same-hash partial fill ${fillIndex + 1} reverted`,
    );
  }
  const repeatedMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: repeatedMaker,
  });
  const repeatedTakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: repeatedTaker,
  });
  let [repeatedMakerFilled, repeatedTakerFilled, repeatedLong, repeatedShort] =
    await Promise.all([
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [repeatedMakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [repeatedTakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[2]],
      }),
    ]);
  check(
    repeatedMakerFilled === 2n * repeatedFill &&
      repeatedTakerFilled === 2n * repeatedFill &&
      repeatedLong === 2n * repeatedFill &&
      repeatedShort === -(2n * repeatedFill),
    "same-hash partial fills did not accumulate",
  );
  const repeatedOverfill = await sendMatch(
    repeatedMaker,
    repeatedMakerSignature,
    repeatedTaker,
    repeatedTakerSignature,
    repeatedFill + 1n,
  );
  check(
    repeatedOverfill.status === "reverted",
    "same-hash remainder was overfilled",
  );
  const repeatedFinal = await sendMatch(
    repeatedMaker,
    repeatedMakerSignature,
    repeatedTaker,
    repeatedTakerSignature,
    repeatedFill,
  );
  check(repeatedFinal.status === "success", "exact final remainder reverted");
  [repeatedMakerFilled, repeatedTakerFilled] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedTakerHash],
    }),
  ]);
  check(
    repeatedMakerFilled === repeatedQuantity &&
      repeatedTakerFilled === repeatedQuantity,
    "exact final remainder did not complete both cumulative fills",
  );
  console.log(
    "PASS OrderBookTest.testRepeatedPartialFillsAccumulateAndBoundRemainder",
  );

  await resetOrderBookState();
  const repeatedCloseOpenMaker = {
    ...maker,
    quantity: repeatedQuantity,
    nonce: 16n,
  };
  const repeatedCloseOpenTaker = {
    ...taker,
    quantity: repeatedQuantity,
    nonce: 26n,
  };
  let repeatedCloseReceipt = await signAndMatch(
    repeatedCloseOpenMaker,
    repeatedCloseOpenTaker,
    repeatedQuantity,
  );
  check(
    repeatedCloseReceipt.status === "success",
    "repeated close fixture open reverted",
  );
  const repeatedCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: repeatedQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 17n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const repeatedCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: repeatedQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 3,
    nonce: 27n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const [repeatedCloseMakerSignature, repeatedCloseTakerSignature] =
    await Promise.all([
      signOrder(repeatedCloseMaker, 1),
      signOrder(repeatedCloseTaker, 2),
    ]);
  for (let fillIndex = 0; fillIndex < 2; fillIndex += 1) {
    repeatedCloseReceipt = await sendMatch(
      repeatedCloseMaker,
      repeatedCloseMakerSignature,
      repeatedCloseTaker,
      repeatedCloseTakerSignature,
      repeatedFill,
    );
    check(
      repeatedCloseReceipt.status === "success",
      `same-hash partial close ${fillIndex + 1} reverted`,
    );
  }
  const repeatedCloseMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: repeatedCloseMaker,
  });
  const repeatedCloseTakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: repeatedCloseTaker,
  });
  let [
    repeatedCloseMakerFilled,
    repeatedCloseTakerFilled,
    repeatedCloseLong,
    repeatedCloseShort,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedCloseMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedCloseTakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
  ]);
  check(
    repeatedCloseMakerFilled === 2n * repeatedFill &&
      repeatedCloseTakerFilled === 2n * repeatedFill &&
      repeatedCloseLong === repeatedQuantity - 2n * repeatedFill &&
      repeatedCloseShort === -(repeatedQuantity - 2n * repeatedFill),
    "same-hash partial closes did not accumulate",
  );
  const repeatedCloseOverfill = await sendMatch(
    repeatedCloseMaker,
    repeatedCloseMakerSignature,
    repeatedCloseTaker,
    repeatedCloseTakerSignature,
    repeatedFill + 1n,
  );
  check(
    repeatedCloseOverfill.status === "reverted",
    "same-hash close remainder was overfilled",
  );
  repeatedCloseReceipt = await sendMatch(
    repeatedCloseMaker,
    repeatedCloseMakerSignature,
    repeatedCloseTaker,
    repeatedCloseTakerSignature,
    repeatedFill,
  );
  check(
    repeatedCloseReceipt.status === "success",
    "exact final close remainder reverted",
  );
  [repeatedCloseMakerFilled, repeatedCloseTakerFilled] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedCloseMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [repeatedCloseTakerHash],
    }),
  ]);
  check(
    repeatedCloseMakerFilled === repeatedQuantity &&
      repeatedCloseTakerFilled === repeatedQuantity,
    "exact final close did not complete both cumulative fills",
  );
  console.log(
    "PASS OrderBookTest.testRepeatedPartialClosesAccumulateAndBoundRemainder",
  );

  await resetOrderBookState();
  const nonDivisibleQuantity = 7n;
  const nonDivisibleOpenMaker = {
    trader: accounts[1],
    side: 0,
    quantity: nonDivisibleQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 18n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const nonDivisibleOpenTaker = {
    trader: accounts[2],
    side: 1,
    quantity: nonDivisibleQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 2,
    nonce: 28n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  let nonDivisibleReceipt = await signAndMatch(
    nonDivisibleOpenMaker,
    nonDivisibleOpenTaker,
    nonDivisibleQuantity,
  );
  check(
    nonDivisibleReceipt.status === "success",
    "non-divisible repeated-close fixture open reverted",
  );
  const nonDivisibleCloseMaker = {
    trader: accounts[2],
    side: 0,
    quantity: nonDivisibleQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 2,
    nonce: 19n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const nonDivisibleCloseTaker = {
    trader: accounts[1],
    side: 1,
    quantity: nonDivisibleQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 29n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const [nonDivisibleMakerSignature, nonDivisibleTakerSignature] =
    await Promise.all([
      signOrder(nonDivisibleCloseMaker, 2),
      signOrder(nonDivisibleCloseTaker, 1),
    ]);
  const nonDivisibleMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: nonDivisibleCloseMaker,
  });
  const nonDivisibleTakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: nonDivisibleCloseTaker,
  });
  const nonDivisibleLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const nonDivisibleFills = [2n, 1n, 1n, 3n];
  const expectedNonDivisible = [
    [2n, 5n, 5n, 3n, 5n, deposit - 6n, deposit - 4n, 2n],
    [3n, 4n, 4n, 3n, 4n, deposit - 6n, deposit - 4n, 3n],
    [4n, 3n, 3n, 3n, 3n, deposit - 6n, deposit - 4n, 4n],
    [7n, 0n, 0n, 0n, 0n, deposit - 4n, deposit - 1n, 5n],
  ];
  for (let index = 0; index < nonDivisibleFills.length; index += 1) {
    nonDivisibleReceipt = await sendMatch(
      nonDivisibleCloseMaker,
      nonDivisibleMakerSignature,
      nonDivisibleCloseTaker,
      nonDivisibleTakerSignature,
      nonDivisibleFills[index],
    );
    check(
      nonDivisibleReceipt.status === "success",
      `non-divisible partial close ${index + 1} reverted`,
    );
    const expected = expectedNonDivisible[index];
    const [
      makerFilledAfterPartial,
      takerFilledAfterPartial,
      longNetAfterPartial,
      shortNetAfterPartial,
      longLockedAfterPartial,
      shortLockedAfterPartial,
      oiAfterPartial,
      longAvailableAfterPartial,
      shortAvailableAfterPartial,
      revenueAfterPartial,
      activeAfterPartial,
      lotAfterPartial,
    ] = await Promise.all([
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [nonDivisibleMakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [nonDivisibleTakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "matchedOpenInterest",
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: ["0x000000000000000000000000000000000000bEEF"],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "activeLotCount",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "lots",
        args: [nonDivisibleLotId],
      }),
    ]);
    check(
      makerFilledAfterPartial === expected[0] &&
        takerFilledAfterPartial === expected[0] &&
        longNetAfterPartial === nonDivisibleQuantity - expected[0] &&
        shortNetAfterPartial === -(nonDivisibleQuantity - expected[0]) &&
        longLockedAfterPartial === expected[2] &&
        shortLockedAfterPartial === expected[3] &&
        oiAfterPartial === expected[4] &&
        longAvailableAfterPartial === expected[5] &&
        shortAvailableAfterPartial === expected[6] &&
        revenueAfterPartial === expected[7],
      `non-divisible close ${index + 1} changed CH buckets, OI, fee, or net`,
    );
    if (index < nonDivisibleFills.length - 1) {
      check(
        activeAfterPartial === 1 &&
          lotAfterPartial[3] === expected[1] &&
          lotAfterPartial[5] === expected[2] &&
          lotAfterPartial[6] === expected[3] &&
          lotAfterPartial[7] === expected[4],
        `non-divisible close ${index + 1} changed persisted lot remainder`,
      );
    } else {
      check(
        activeAfterPartial === 0 &&
          lotAfterPartial.every(
            (value) =>
              value === 0n ||
              value === "0x0000000000000000000000000000000000000000",
          ),
        "non-divisible exact final close left a live lot",
      );
    }
  }
  const [nonDivisibleLiabilities, nonDivisibleHouseBalance] = await Promise.all(
    [
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "totalLiabilities",
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: [clearingHouseAddress],
      }),
    ],
  );
  check(
    nonDivisibleLiabilities === 3n * deposit - 5n &&
      nonDivisibleHouseBalance === nonDivisibleLiabilities,
    "non-divisible exact final close did not conserve liabilities",
  );
  console.log(
    "PASS OrderBookTest.testThreeNonDivisiblePartialClosesPersistAndConserve",
  );

  await provider.request({ method: "evm_revert", params: [snapshot] });
  snapshot = await provider.request({ method: "evm_snapshot", params: [] });
  const [openMakerSignature, openTakerSignature] = await Promise.all([
    signingAccounts[1].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: maker,
    }),
    signingAccounts[2].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: taker,
    }),
  ]);
  let closeHash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [maker, openMakerSignature, taker, openTakerSignature, quantity],
    gas: 10_000_000n,
  });
  let closeReceipt = await publicClient.waitForTransactionReceipt({
    hash: closeHash,
  });
  check(closeReceipt.status === "success", "close fixture open reverted");
  const closeMaker = {
    trader: accounts[1],
    side: 1,
    quantity,
    limitPrice: 25n * 10n ** 17n,
    leverage: 2,
    nonce: 31n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const closeTaker = {
    trader: accounts[2],
    side: 0,
    quantity,
    limitPrice: 26n * 10n ** 17n,
    leverage: 3,
    nonce: 41n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const [closeMakerSignature, closeTakerSignature] = await Promise.all([
    signingAccounts[1].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: closeMaker,
    }),
    signingAccounts[2].signTypedData({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: closeTaker,
    }),
  ]);
  closeHash = await walletClient.writeContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "matchOrders",
    args: [
      closeMaker,
      closeMakerSignature,
      closeTaker,
      closeTakerSignature,
      quantity,
    ],
    gas: 10_000_000n,
  });
  closeReceipt = await publicClient.waitForTransactionReceipt({
    hash: closeHash,
  });
  check(closeReceipt.status === "success", "paired close reverted");
  const [
    longAfterClose,
    shortAfterClose,
    longLotsAfterClose,
    shortLotsAfterClose,
    openInterestAfterClose,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
  ]);
  check(longAfterClose === 0n && shortAfterClose === 0n, "close left exposure");
  check(
    longLotsAfterClose === 0 && shortLotsAfterClose === 0,
    "close left active lot references",
  );
  check(openInterestAfterClose === 0n, "close left stored-entry OI");
  console.log("PASS OrderBookTest.testPairedCloseUsesExitFeeAndStoredEntryOi");

  await resetOrderBookState();
  const signatureMaker = { ...maker, nonce: 101n };
  const signatureTaker = { ...taker, nonce: 201n };
  const [validMakerSignature, validTakerSignature] = await Promise.all([
    signOrder(signatureMaker, 1),
    signOrder(signatureTaker, 2),
  ]);
  const wrongDomainSignatures = await Promise.all([
    signOrder(
      signatureMaker,
      1,
      orderDomain(orderBookAddress, { chainId: localChain.id + 1 }),
    ),
    signOrder(signatureMaker, 1, orderDomain(clearingHouseAddress)),
    signOrder(
      signatureMaker,
      1,
      orderDomain(orderBookAddress, { name: "BNBX Future" }),
    ),
    signOrder(
      signatureMaker,
      1,
      orderDomain(orderBookAddress, { version: "2" }),
    ),
  ]);
  const curveN =
    0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const canonicalS = BigInt(`0x${validMakerSignature.slice(66, 130)}`);
  const canonicalV = Number.parseInt(validMakerSignature.slice(130, 132), 16);
  const highS = (curveN - canonicalS).toString(16).padStart(64, "0");
  const highSSignature = `0x${validMakerSignature.slice(2, 66)}${highS}${
    canonicalV === 27 ? "1c" : "1b"
  }`;
  const badVSignature = `${validMakerSignature.slice(0, 130)}1d`;
  const malformedSignature = validMakerSignature.slice(0, 130);
  const wrongSignerSignature = await signOrder(signatureMaker, 3);
  const domainFailures = [
    ...wrongDomainSignatures,
    highSSignature,
    badVSignature,
    malformedSignature,
    wrongSignerSignature,
  ];
  for (const rejectedSignature of domainFailures) {
    const rejected = await sendMatch(
      signatureMaker,
      rejectedSignature,
      signatureTaker,
      validTakerSignature,
      quantity,
    );
    check(rejected.status === "reverted", "invalid EIP-712 signature filled");
  }
  const invalidTakerSignature = await signOrder(signatureTaker, 3);
  const invalidTaker = await sendMatch(
    signatureMaker,
    validMakerSignature,
    signatureTaker,
    invalidTakerSignature,
    quantity,
  );
  check(
    invalidTaker.status === "reverted",
    "invalid Taker signature authorized a debit",
  );
  console.log("PASS OrderBookTest.testRejectsInvalidTakerSignature");

  const swapped = await sendMatch(
    signatureTaker,
    validTakerSignature,
    signatureMaker,
    validMakerSignature,
    quantity,
  );
  check(swapped.status === "reverted", "Maker/Taker roles were swappable");

  const sameWalletTaker = {
    ...signatureTaker,
    trader: accounts[1],
    nonce: 202n,
  };
  const sameWalletSignature = await signOrder(sameWalletTaker, 1);
  const sameWallet = await sendMatch(
    signatureMaker,
    validMakerSignature,
    sameWalletTaker,
    sameWalletSignature,
    quantity,
  );
  check(sameWallet.status === "reverted", "same wallet matched itself");

  const sameSideTaker = { ...signatureTaker, side: 0, nonce: 203n };
  const sameSideSignature = await signOrder(sameSideTaker, 2);
  const sameSide = await sendMatch(
    signatureMaker,
    validMakerSignature,
    sameSideTaker,
    sameSideSignature,
    quantity,
  );
  check(sameSide.status === "reverted", "same-side orders matched");

  const nonCrossingMaker = {
    ...signatureMaker,
    limitPrice: 18n * 10n ** 17n,
    nonce: 102n,
  };
  const nonCrossingSignature = await signOrder(nonCrossingMaker, 1);
  const nonCrossing = await sendMatch(
    nonCrossingMaker,
    nonCrossingSignature,
    signatureTaker,
    validTakerSignature,
    quantity,
  );
  check(nonCrossing.status === "reverted", "non-crossing prices matched");

  const expiredMaker = { ...signatureMaker, deadline: 1n, nonce: 103n };
  const expiredSignature = await signOrder(expiredMaker, 1);
  const expired = await sendMatch(
    expiredMaker,
    expiredSignature,
    signatureTaker,
    validTakerSignature,
    quantity,
  );
  check(expired.status === "reverted", "expired order matched");
  const expiredTaker = { ...signatureTaker, deadline: 1n, nonce: 204n };
  const expiredTakerSignature = await signOrder(expiredTaker, 2);
  const expiredTakerMatch = await sendMatch(
    signatureMaker,
    validMakerSignature,
    expiredTaker,
    expiredTakerSignature,
    quantity,
  );
  check(expiredTakerMatch.status === "reverted", "expired Taker order matched");
  const overfill = await sendMatch(
    signatureMaker,
    validMakerSignature,
    signatureTaker,
    validTakerSignature,
    quantity + 1n,
  );
  check(overfill.status === "reverted", "order overfill succeeded");
  const invalidMakers = [
    { ...signatureMaker, quantity: 0n, nonce: 104n },
    { ...signatureMaker, limitPrice: 0n, nonce: 105n },
    { ...signatureMaker, leverage: 0, nonce: 106n },
    { ...signatureMaker, leverage: 4, nonce: 107n },
  ];
  for (const invalidMaker of invalidMakers) {
    const invalidMakerSignature = await signOrder(invalidMaker, 1);
    const invalidReceipt = await sendMatch(
      invalidMaker,
      invalidMakerSignature,
      signatureTaker,
      validTakerSignature,
      1n,
    );
    check(
      invalidReceipt.status === "reverted",
      "invalid order economics filled",
    );
  }
  const zeroFill = await sendMatch(
    signatureMaker,
    validMakerSignature,
    signatureTaker,
    validTakerSignature,
    0n,
  );
  check(zeroFill.status === "reverted", "zero fill succeeded");

  await resetOrderBookState();
  const smallerTakerFill = 1n * 10n ** 18n;
  const largerMaker = {
    ...signatureMaker,
    quantity: 2n * smallerTakerFill,
    nonce: 108n,
  };
  const smallerTaker = {
    ...signatureTaker,
    quantity: smallerTakerFill,
    nonce: 208n,
  };
  const [largerMakerSignature, smallerTakerSignature] = await Promise.all([
    signOrder(largerMaker, 1),
    signOrder(smallerTaker, 2),
  ]);
  const smallerTakerFirstFill = await sendMatch(
    largerMaker,
    largerMakerSignature,
    smallerTaker,
    smallerTakerSignature,
    smallerTakerFill,
  );
  check(
    smallerTakerFirstFill.status === "success",
    "smaller Taker exact quantity reverted",
  );
  const smallerTakerOverfill = await sendMatch(
    largerMaker,
    largerMakerSignature,
    smallerTaker,
    smallerTakerSignature,
    smallerTakerFill,
  );
  const largerMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: largerMaker,
  });
  const smallerTakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: smallerTaker,
  });
  const [largerMakerFilled, smallerTakerFilled] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [largerMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [smallerTakerHash],
    }),
  ]);
  check(
    smallerTakerOverfill.status === "reverted" &&
      largerMakerFilled === smallerTakerFill &&
      smallerTakerFilled === smallerTakerFill,
    "Taker remaining quantity was ignored or failed atomically",
  );
  console.log("PASS OrderBookTest.testTakerExpiryAndSmallerRemainingQuantity");
  await resetOrderBookState();

  const validFill = await sendMatch(
    signatureMaker,
    validMakerSignature,
    signatureTaker,
    validTakerSignature,
    quantity,
  );
  check(validFill.status === "success", "valid signature control reverted");
  const replay = await sendMatch(
    signatureMaker,
    validMakerSignature,
    signatureTaker,
    validTakerSignature,
    1n,
  );
  check(replay.status === "reverted", "fully filled order replayed");
  console.log(
    "PASS OrderBookTest.testRejectsWrongDomainsCanonicalityRolesAndReplay",
  );

  await resetOrderBookState();
  const oversizedQuantity = 2_000n * 10n ** 18n;
  const oversizedMaker = {
    ...maker,
    quantity: oversizedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 301n,
  };
  const oversizedTaker = {
    ...taker,
    quantity: oversizedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 401n,
  };
  const [oversizedMakerSignature, oversizedTakerSignature] = await Promise.all([
    signOrder(oversizedMaker, 1),
    signOrder(oversizedTaker, 2),
  ]);
  const insufficientHouse = await sendMatch(
    oversizedMaker,
    oversizedMakerSignature,
    oversizedTaker,
    oversizedTakerSignature,
    oversizedQuantity,
  );
  check(
    insufficientHouse.status === "reverted",
    "ClearingHouse insufficiency did not revert",
  );
  const atomicMaker = { ...maker, nonce: 302n };
  const atomicTaker = { ...taker, nonce: 402n };
  const [atomicMakerSignature, atomicTakerSignature] = await Promise.all([
    signOrder(atomicMaker, 1),
    signOrder(atomicTaker, 2),
  ]);
  let modeHash = await walletClient.writeContract({
    address: collateralAddress,
    abi: collateralArtifact.abi,
    functionName: "setFeeBps",
    args: [5_000],
  });
  await publicClient.waitForTransactionReceipt({ hash: modeHash });
  modeHash = await walletClient.writeContract({
    address: collateralAddress,
    abi: collateralArtifact.abi,
    functionName: "setTransferMode",
    args: [4],
  });
  await publicClient.waitForTransactionReceipt({ hash: modeHash });
  const tokenFailure = await sendMatch(
    atomicMaker,
    atomicMakerSignature,
    atomicTaker,
    atomicTakerSignature,
    quantity,
  );
  check(
    tokenFailure.status === "reverted",
    "fee-token mismatch did not revert",
  );
  const atomicMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: atomicMaker,
  });
  const [
    atomicFilled,
    atomicPosition,
    atomicLots,
    atomicOi,
    atomicLongLocked,
    atomicShortLocked,
    atomicRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [atomicMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    atomicFilled === 0n &&
      atomicPosition === 0n &&
      atomicLots === 0 &&
      atomicOi === 0n &&
      atomicLongLocked === 0n &&
      atomicShortLocked === 0n &&
      atomicRevenue === 0n,
    "failed accounting boundary left OrderBook or ClearingHouse state",
  );
  console.log(
    "PASS OrderBookTest.testClearingHouseAndTokenFailuresRollbackAtomically",
  );

  await resetOrderBookState();
  const closeRollbackOpenMaker = { ...maker, nonce: 303n };
  const closeRollbackOpenTaker = { ...taker, nonce: 403n };
  const closeRollbackOpen = await signAndMatch(
    closeRollbackOpenMaker,
    closeRollbackOpenTaker,
    quantity,
  );
  check(
    closeRollbackOpen.status === "success",
    "close rollback fixture open reverted",
  );
  const closeRollbackMaker = {
    trader: accounts[1],
    side: 1,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 304n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const closeRollbackTaker = {
    trader: accounts[2],
    side: 0,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 3,
    nonce: 404n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const closeRollbackMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: closeRollbackMaker,
  });
  const closeRollbackTakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: closeRollbackTaker,
  });
  const closeRollbackLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const readCloseRollbackState = async () => {
    const state = await Promise.all([
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [closeRollbackMakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [closeRollbackTakerHash],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "netQuantity",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "activeLotCount",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "lots",
        args: [closeRollbackLotId],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "matchedOpenInterest",
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: ["0x000000000000000000000000000000000000bEEF"],
      }),
    ]);
    state[5] = state[5].map((value) => value.toString()).join(":");
    return state;
  };
  const closeRollbackBefore = await readCloseRollbackState();
  modeHash = await walletClient.writeContract({
    address: collateralAddress,
    abi: collateralArtifact.abi,
    functionName: "setFeeBps",
    args: [5_000],
  });
  await publicClient.waitForTransactionReceipt({ hash: modeHash });
  modeHash = await walletClient.writeContract({
    address: collateralAddress,
    abi: collateralArtifact.abi,
    functionName: "setTransferMode",
    args: [4],
  });
  await publicClient.waitForTransactionReceipt({ hash: modeHash });
  const closeRollbackFailure = await signAndMatch(
    closeRollbackMaker,
    closeRollbackTaker,
    quantity,
  );
  check(
    closeRollbackFailure.status === "reverted",
    "close fee-token mismatch did not revert",
  );
  const closeRollbackAfter = await readCloseRollbackState();
  check(
    closeRollbackAfter.every(
      (value, index) => value === closeRollbackBefore[index],
    ),
    "failed close transfer changed fill, net, lot, or ClearingHouse state",
  );
  console.log(
    "PASS OrderBookTest.testCloseTokenFailureRollsBackOrderBookAndHouse",
  );

  await resetOrderBookState();
  const stateProviderArtifact =
    output.contracts["test/OrderBook.t.sol"].MarketStateProviderMock;
  const closeOnlyQuantity = 4n * 10n ** 18n;
  const closeOnlyMaker = {
    ...maker,
    quantity: closeOnlyQuantity,
    nonce: 501n,
  };
  const closeOnlyTaker = {
    ...taker,
    quantity: closeOnlyQuantity,
    nonce: 601n,
  };
  const reduceOpenMaker = {
    ...closeOnlyMaker,
    reduceOnly: true,
    nonce: 502n,
  };
  const reduceOpenTaker = {
    ...closeOnlyTaker,
    reduceOnly: true,
    nonce: 602n,
  };
  const [reduceOpenMakerSignature, reduceOpenTakerSignature] =
    await Promise.all([
      signOrder(reduceOpenMaker, 1),
      signOrder(reduceOpenTaker, 2),
    ]);
  const reduceOnlyIncrease = await sendMatch(
    reduceOpenMaker,
    reduceOpenMakerSignature,
    reduceOpenTaker,
    reduceOpenTakerSignature,
    closeOnlyQuantity,
  );
  check(
    reduceOnlyIncrease.status === "reverted",
    "reduce-only order increased exposure",
  );
  let stateHash = await walletClient.writeContract({
    address: marketStateProviderAddress,
    abi: stateProviderArtifact.abi,
    functionName: "setMarketState",
    args: [0],
  });
  await publicClient.waitForTransactionReceipt({ hash: stateHash });
  const [closeOnlyMakerSignature, closeOnlyTakerSignature] = await Promise.all([
    signOrder(closeOnlyMaker, 1),
    signOrder(closeOnlyTaker, 2),
  ]);
  const blockedOpen = await sendMatch(
    closeOnlyMaker,
    closeOnlyMakerSignature,
    closeOnlyTaker,
    closeOnlyTakerSignature,
    closeOnlyQuantity,
  );
  check(blockedOpen.status === "reverted", "CloseOnly allowed an opening fill");
  stateHash = await walletClient.writeContract({
    address: marketStateProviderAddress,
    abi: stateProviderArtifact.abi,
    functionName: "setMarketState",
    args: [1],
  });
  await publicClient.waitForTransactionReceipt({ hash: stateHash });
  const permittedOpen = await sendMatch(
    closeOnlyMaker,
    closeOnlyMakerSignature,
    closeOnlyTaker,
    closeOnlyTakerSignature,
    closeOnlyQuantity,
  );
  check(permittedOpen.status === "success", "Open state blocked opening fill");
  stateHash = await walletClient.writeContract({
    address: marketStateProviderAddress,
    abi: stateProviderArtifact.abi,
    functionName: "setMarketState",
    args: [0],
  });
  await publicClient.waitForTransactionReceipt({ hash: stateHash });

  const reduceThree = 3n * 10n ** 18n;
  const closeOnlyCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: reduceThree,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 503n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const closeOnlyCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: reduceThree,
    limitPrice: 2n * 10n ** 18n,
    leverage: 3,
    nonce: 603n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const [closeOnlyCloseMakerSignature, closeOnlyCloseTakerSignature] =
    await Promise.all([
      signOrder(closeOnlyCloseMaker, 1),
      signOrder(closeOnlyCloseTaker, 2),
    ]);
  const permittedReduction = await sendMatch(
    closeOnlyCloseMaker,
    closeOnlyCloseMakerSignature,
    closeOnlyCloseTaker,
    closeOnlyCloseTakerSignature,
    reduceThree,
  );
  check(
    permittedReduction.status === "success",
    "CloseOnly blocked strict reduction",
  );

  const flipQuantity = 2n * 10n ** 18n;
  const flipMaker = {
    ...closeOnlyCloseMaker,
    quantity: flipQuantity,
    nonce: 504n,
  };
  const flipTaker = {
    ...closeOnlyCloseTaker,
    quantity: flipQuantity,
    nonce: 604n,
  };
  const [flipMakerSignature, flipTakerSignature] = await Promise.all([
    signOrder(flipMaker, 1),
    signOrder(flipTaker, 2),
  ]);
  const flip = await sendMatch(
    flipMaker,
    flipMakerSignature,
    flipTaker,
    flipTakerSignature,
    flipQuantity,
  );
  check(flip.status === "reverted", "one fill reversed open positions");
  const remainingExposure = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "netQuantity",
    args: [accounts[1]],
  });
  check(
    remainingExposure === 1n * 10n ** 18n,
    "failed reversal changed remaining exposure",
  );
  console.log(
    "PASS OrderBookTest.testReduceOnlyCloseOnlyAndNoSingleFillReversal",
  );

  await resetOrderBookState();
  const lotOneQuantity = 3n * 10n ** 18n;
  const lotTwoQuantity = 5n * 10n ** 18n;
  const lotOneMaker = {
    trader: accounts[1],
    side: 0,
    quantity: lotOneQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 1,
    nonce: 701n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const lotOneTaker = {
    trader: accounts[2],
    side: 1,
    quantity: lotOneQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 801n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  const lotTwoMaker = {
    ...lotOneMaker,
    quantity: lotTwoQuantity,
    limitPrice: 3n * 10n ** 18n,
    leverage: 2,
    nonce: 702n,
  };
  const lotTwoTaker = {
    ...lotOneTaker,
    quantity: lotTwoQuantity,
    limitPrice: 3n * 10n ** 18n,
    leverage: 3,
    nonce: 802n,
  };
  let fifoReceipt = await signAndMatch(
    lotOneMaker,
    lotOneTaker,
    lotOneQuantity,
  );
  check(fifoReceipt.status === "success", "first FIFO lot open reverted");
  fifoReceipt = await signAndMatch(lotTwoMaker, lotTwoTaker, lotTwoQuantity);
  check(fifoReceipt.status === "success", "second FIFO lot open reverted");

  const firstCloseQuantity = 4n * 10n ** 18n;
  const firstCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: firstCloseQuantity,
    limitPrice: 25n * 10n ** 17n,
    leverage: 2,
    nonce: 703n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const firstCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: firstCloseQuantity,
    limitPrice: 26n * 10n ** 17n,
    leverage: 3,
    nonce: 803n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  fifoReceipt = await signAndMatch(
    firstCloseMaker,
    firstCloseTaker,
    firstCloseQuantity,
  );
  check(fifoReceipt.status === "success", "multi-lot partial close reverted");
  const remainingLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const remainingLot = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "lots",
    args: [remainingLotId],
  });
  check(remainingLotId === 2n, "FIFO did not remove the fully closed head");
  check(
    remainingLot[3] === 4n * 10n ** 18n &&
      remainingLot[5] === 6n * 10n ** 18n &&
      remainingLot[6] === 4_000_800n * 10n ** 12n &&
      remainingLot[7] === 12n * 10n ** 18n,
    "partial close did not persist conservative margin/OI remainders",
  );
  const [lockedLongAfterPartial, lockedShortAfterPartial, oiAfterPartial] =
    await Promise.all([
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "matchedOpenInterest",
      }),
    ]);
  check(
    lockedLongAfterPartial === 6n * 10n ** 18n &&
      lockedShortAfterPartial === 4_000_800n * 10n ** 12n &&
      oiAfterPartial === 12n * 10n ** 18n,
    "ClearingHouse buckets disagree with the remaining FIFO lot",
  );

  const finalCloseMaker = {
    trader: accounts[2],
    side: 0,
    quantity: firstCloseQuantity,
    limitPrice: 16n * 10n ** 17n,
    leverage: 3,
    nonce: 804n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const finalCloseTaker = {
    trader: accounts[1],
    side: 1,
    quantity: firstCloseQuantity,
    limitPrice: 15n * 10n ** 17n,
    leverage: 2,
    nonce: 704n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  fifoReceipt = await signAndMatch(
    finalCloseMaker,
    finalCloseTaker,
    firstCloseQuantity,
  );
  check(fifoReceipt.status === "success", "final FIFO close reverted");
  const [
    fifoLongAvailable,
    fifoShortAvailable,
    fifoUnrelatedAvailable,
    fifoTotalAvailable,
    fifoTotalLocked,
    fifoOi,
    fifoRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[3]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "totalAvailable",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "totalLockedMargin",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    fifoLongAvailable === 995_336n * 10n ** 15n &&
      fifoShortAvailable === 1_004_290n * 10n ** 15n &&
      fifoUnrelatedAvailable === deposit &&
      fifoTotalAvailable === 2_999_626n * 10n ** 15n &&
      fifoTotalLocked === 0n &&
      fifoOi === 0n &&
      fifoRevenue === 374n * 10n ** 15n,
    "multi-lot zero-sum PnL, close fee, or user bucket mismatch",
  );
  console.log(
    "PASS OrderBookTest.testFifoMultiLotPnlAndConservativeMarginRemainder",
  );

  await resetOrderBookState();
  const pairedQuantity = 1n * 10n ** 18n;
  const pairedMakerOne = {
    ...lotOneMaker,
    quantity: pairedQuantity,
    nonce: 901n,
  };
  const pairedTakerOne = {
    ...lotOneTaker,
    quantity: pairedQuantity,
    nonce: 911n,
  };
  const pairedMakerTwo = { ...pairedMakerOne, nonce: 902n };
  const pairedTakerTwo = {
    ...pairedTakerOne,
    trader: accounts[3],
    nonce: 921n,
  };
  let counterpartyReceipt = await signAndMatch(
    pairedMakerOne,
    pairedTakerOne,
    pairedQuantity,
  );
  check(counterpartyReceipt.status === "success", "first pair open reverted");
  counterpartyReceipt = await signAndMatch(
    pairedMakerTwo,
    pairedTakerTwo,
    pairedQuantity,
  );
  check(counterpartyReceipt.status === "success", "second pair open reverted");
  const wrongPairMaker = {
    trader: accounts[1],
    side: 1,
    quantity: pairedQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 1,
    nonce: 903n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const wrongPairTaker = {
    trader: accounts[3],
    side: 0,
    quantity: pairedQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 922n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  counterpartyReceipt = await signAndMatch(
    wrongPairMaker,
    wrongPairTaker,
    pairedQuantity,
  );
  check(
    counterpartyReceipt.status === "reverted",
    "wrong historical counterparty consumed another pair's FIFO lot",
  );
  const rightPairTaker = {
    ...wrongPairTaker,
    trader: accounts[2],
    nonce: 912n,
  };
  counterpartyReceipt = await signAndMatch(
    wrongPairMaker,
    rightPairTaker,
    pairedQuantity,
  );
  check(
    counterpartyReceipt.status === "success",
    "actual FIFO counterparty could not close",
  );
  const secondPairMaker = { ...wrongPairMaker, nonce: 904n };
  const secondPairTaker = { ...wrongPairTaker, nonce: 923n };
  counterpartyReceipt = await signAndMatch(
    secondPairMaker,
    secondPairTaker,
    pairedQuantity,
  );
  check(
    counterpartyReceipt.status === "success",
    "next actual counterparty could not close after head removal",
  );
  console.log(
    "PASS OrderBookTest.testRejectsWrongHistoricalCounterpartyBeforeAccounting",
  );

  await resetOrderBookState();
  const boundedQuantity = 1n * 10n ** 18n;
  for (let index = 0; index < 8; index += 1) {
    const boundedMaker = {
      ...pairedMakerOne,
      quantity: boundedQuantity,
      limitPrice: 1n * 10n ** 18n,
      leverage: 1,
      nonce: 1_000n + BigInt(index),
    };
    const boundedTaker = {
      ...pairedTakerOne,
      quantity: boundedQuantity,
      limitPrice: 1n * 10n ** 18n,
      leverage: 1,
      nonce: 1_100n + BigInt(index),
    };
    const boundedOpen = await signAndMatch(
      boundedMaker,
      boundedTaker,
      boundedQuantity,
    );
    check(boundedOpen.status === "success", `active lot ${index + 1} reverted`);
  }
  const ninthMaker = {
    ...pairedMakerOne,
    quantity: boundedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 1_008n,
  };
  const ninthTaker = {
    ...pairedTakerOne,
    quantity: boundedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 1_108n,
  };
  const [oiBeforeNinth, revenueBeforeNinth] = await Promise.all([
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  const ninthReceipt = await signAndMatch(
    ninthMaker,
    ninthTaker,
    boundedQuantity,
  );
  check(ninthReceipt.status === "reverted", "ninth active lot opened");
  const ninthHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: ninthMaker,
  });
  const [ninthFilled, oiAfterNinth, revenueAfterNinth, activeAtCap] =
    await Promise.all([
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "filled",
        args: [ninthHash],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "matchedOpenInterest",
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: ["0x000000000000000000000000000000000000bEEF"],
      }),
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "activeLotCount",
        args: [accounts[1]],
      }),
    ]);
  check(
    ninthFilled === 0n &&
      oiAfterNinth === oiBeforeNinth &&
      revenueAfterNinth === revenueBeforeNinth &&
      activeAtCap === 8,
    "ninth-lot failure was not atomic",
  );
  const makerOnlyCapMaker = { ...ninthMaker, nonce: 1_009n };
  const makerOnlyCapTaker = {
    ...ninthTaker,
    trader: accounts[3],
    nonce: 1_109n,
  };
  const makerOnlyCapReceipt = await signAndMatch(
    makerOnlyCapMaker,
    makerOnlyCapTaker,
    boundedQuantity,
  );
  check(
    makerOnlyCapReceipt.status === "reverted",
    "Maker-only active-lot cap opened a ninth segment",
  );
  const takerOnlyCapMaker = {
    ...ninthMaker,
    trader: accounts[3],
    nonce: 1_010n,
  };
  const takerOnlyCapTaker = { ...ninthTaker, nonce: 1_110n };
  const takerOnlyCapReceipt = await signAndMatch(
    takerOnlyCapMaker,
    takerOnlyCapTaker,
    boundedQuantity,
  );
  check(
    takerOnlyCapReceipt.status === "reverted",
    "Taker-only active-lot cap opened a ninth segment",
  );
  const makerOnlyCapHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: makerOnlyCapMaker,
  });
  const takerOnlyCapHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: takerOnlyCapTaker,
  });
  const [
    makerOnlyCapFilled,
    takerOnlyCapFilled,
    freshAccountLots,
    oiAfterOneSidedCaps,
    revenueAfterOneSidedCaps,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [makerOnlyCapHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [takerOnlyCapHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[3]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    makerOnlyCapFilled === 0n &&
      takerOnlyCapFilled === 0n &&
      freshAccountLots === 0 &&
      oiAfterOneSidedCaps === oiBeforeNinth &&
      revenueAfterOneSidedCaps === revenueBeforeNinth,
    "one-sided lot-cap failures changed OrderBook or ClearingHouse state",
  );
  console.log("PASS OrderBookTest.testRejectsOneSidedNinthLotCaps");
  const boundedCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: 8n * boundedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 1_200n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const boundedCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: 8n * boundedQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 1,
    nonce: 1_300n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  const boundedClose = await signAndMatch(
    boundedCloseMaker,
    boundedCloseTaker,
    8n * boundedQuantity,
  );
  check(
    boundedClose.status === "success",
    "bounded eight-segment close reverted",
  );
  check(
    boundedClose.gasUsed < 5_000_000n,
    "bounded eight-segment close exceeded gas ceiling",
  );
  const reusableOpen = await signAndMatch(
    { ...ninthMaker, nonce: 1_009n },
    { ...ninthTaker, nonce: 1_109n },
    boundedQuantity,
  );
  check(
    reusableOpen.status === "success",
    "closed FIFO history blocked a new active lot",
  );
  const reusableCount = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotCount",
    args: [accounts[1]],
  });
  check(reusableCount === 1, "bounded ring did not reuse a closed head slot");
  console.log(
    `PASS OrderBookTest.testEightLotCapNinthAtomicityAndBoundedHeadRemoval (${boundedClose.gasUsed} gas)`,
  );

  await resetOrderBookState();
  const wrapQuantity = 1n * 10n ** 18n;
  for (let index = 0; index < 8; index += 1) {
    const wrapOpen = await signAndMatch(
      {
        ...pairedMakerOne,
        quantity: wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: 2_000n + BigInt(index),
      },
      {
        ...pairedTakerOne,
        quantity: wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: 2_100n + BigInt(index),
      },
      wrapQuantity,
    );
    check(wrapOpen.status === "success", `wrap lot ${index + 1} reverted`);
  }
  const wrapClose = async (segments, makerNonce, takerNonce) =>
    signAndMatch(
      {
        trader: accounts[1],
        side: 1,
        quantity: segments * wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: makerNonce,
        deadline: 18_446_744_073_709_551_615n,
        reduceOnly: true,
        role: 0,
      },
      {
        trader: accounts[2],
        side: 0,
        quantity: segments * wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: takerNonce,
        deadline: 18_446_744_073_709_551_615n,
        reduceOnly: true,
        role: 1,
      },
      segments * wrapQuantity,
    );
  let wrapReceipt = await wrapClose(3n, 2_200n, 2_300n);
  check(wrapReceipt.status === "success", "wrap first-three close reverted");
  let wrapActiveIds = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "activeLotId",
        args: [accounts[1], index],
      }),
    ),
  );
  check(
    wrapActiveIds.every((id, index) => id === BigInt(index + 4)),
    "closing three heads did not preserve FIFO ids 4..8",
  );
  for (let index = 0; index < 3; index += 1) {
    const wrapPush = await signAndMatch(
      {
        ...pairedMakerOne,
        quantity: wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: 2_010n + BigInt(index),
      },
      {
        ...pairedTakerOne,
        quantity: wrapQuantity,
        limitPrice: 1n * 10n ** 18n,
        leverage: 1,
        nonce: 2_110n + BigInt(index),
      },
      wrapQuantity,
    );
    check(wrapPush.status === "success", `wrapped push ${index + 1} reverted`);
  }
  wrapActiveIds = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "activeLotId",
        args: [accounts[1], index],
      }),
    ),
  );
  check(
    wrapActiveIds.every((id, index) => id === BigInt(index + 4)),
    "live ring wrap did not expose FIFO ids 4..11",
  );
  wrapReceipt = await wrapClose(6n, 2_201n, 2_301n);
  check(
    wrapReceipt.status === "success",
    "slot-7-to-slot-0 FIFO close reverted",
  );
  check(
    wrapReceipt.gasUsed < 5_000_000n,
    "slot-boundary close exceeded bounded gas ceiling",
  );
  const wrapBoundaryGas = wrapReceipt.gasUsed;
  const [
    wrapLongNet,
    wrapShortNet,
    wrapLongCount,
    wrapShortCount,
    wrapLongFirst,
    wrapLongSecond,
    wrapShortFirst,
    wrapShortSecond,
    wrapLongLocked,
    wrapShortLocked,
    wrapOi,
    wrapRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 1],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[2], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[2], 1],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    wrapLongNet === 2n * wrapQuantity &&
      wrapShortNet === -(2n * wrapQuantity) &&
      wrapLongCount === 2 &&
      wrapShortCount === 2 &&
      wrapLongFirst === 10n &&
      wrapLongSecond === 11n &&
      wrapShortFirst === 10n &&
      wrapShortSecond === 11n &&
      wrapLongLocked === 2n * wrapQuantity &&
      wrapShortLocked === 2n * wrapQuantity &&
      wrapOi === 2n * wrapQuantity &&
      wrapRevenue === 2n * 10n ** 17n,
    "slot-boundary close changed FIFO, net, margin, OI, or fees",
  );
  const wrapLots = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      publicClient.readContract({
        address: orderBookAddress,
        abi: orderBookArtifact.abi,
        functionName: "lots",
        args: [BigInt(index + 1)],
      }),
    ),
  );
  check(
    wrapLots
      .slice(0, 9)
      .every((lot) =>
        lot.every(
          (value) =>
            value === 0n ||
            value === "0x0000000000000000000000000000000000000000",
        ),
      ) &&
      wrapLots
        .slice(9)
        .every(
          (lot, index) =>
            lot[0] === BigInt(index + 10) &&
            lot[3] === wrapQuantity &&
            lot[5] === wrapQuantity &&
            lot[6] === wrapQuantity &&
            lot[7] === wrapQuantity,
        ),
    "ring wrap retained stale lots or double-settled live ids",
  );
  const wrapReplay = await wrapClose(6n, 2_202n, 2_302n);
  check(
    wrapReplay.status === "reverted",
    "slot-boundary lots were double-settled",
  );
  wrapReceipt = await wrapClose(2n, 2_203n, 2_303n);
  check(wrapReceipt.status === "success", "wrap final cleanup reverted");
  const [
    wrapFinalLongNet,
    wrapFinalShortNet,
    wrapFinalLongCount,
    wrapFinalShortCount,
    wrapFinalLongAvailable,
    wrapFinalShortAvailable,
    wrapFinalLongLocked,
    wrapFinalShortLocked,
    wrapFinalOi,
    wrapFinalRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    wrapFinalLongNet === 0n &&
      wrapFinalShortNet === 0n &&
      wrapFinalLongCount === 0 &&
      wrapFinalShortCount === 0 &&
      wrapFinalLongAvailable === deposit &&
      wrapFinalShortAvailable === deposit - 22n * 10n ** 16n &&
      wrapFinalLongLocked === 0n &&
      wrapFinalShortLocked === 0n &&
      wrapFinalOi === 0n &&
      wrapFinalRevenue === 22n * 10n ** 16n,
    "ring wrap final cleanup did not conserve positions and fees",
  );
  console.log(
    `PASS OrderBookTest.testLiveRingWrapPreservesFifoAcrossSlotBoundary (${wrapBoundaryGas} boundary gas, ${wrapReceipt.gasUsed} final gas)`,
  );

  await resetOrderBookState();
  const leverageQuantity = 12n * 10n ** 18n;
  for (let leverage = 1; leverage <= 3; leverage += 1) {
    const leverageMaker = {
      trader: accounts[1],
      side: 0,
      quantity: leverageQuantity,
      limitPrice: 1n * 10n ** 18n,
      leverage,
      nonce: 1_400n + BigInt(leverage),
      deadline: 18_446_744_073_709_551_615n,
      reduceOnly: false,
      role: 0,
    };
    const leverageTaker = {
      trader: accounts[2],
      side: 1,
      quantity: leverageQuantity,
      limitPrice: 1n * 10n ** 18n,
      leverage,
      nonce: 1_500n + BigInt(leverage),
      deadline: 18_446_744_073_709_551_615n,
      reduceOnly: false,
      role: 1,
    };
    const leverageReceipt = await signAndMatch(
      leverageMaker,
      leverageTaker,
      leverageQuantity,
    );
    check(leverageReceipt.status === "success", `${leverage}x open reverted`);
  }
  const [leverageOneId, leverageTwoId, leverageThreeId] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 1],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 2],
    }),
  ]);
  const [leverageOneLot, leverageTwoLot, leverageThreeLot] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [leverageOneId],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [leverageTwoId],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [leverageThreeId],
    }),
  ]);
  check(
    leverageOneLot[5] === 12n * 10n ** 18n &&
      leverageOneLot[6] === 12n * 10n ** 18n &&
      leverageTwoLot[5] === 6n * 10n ** 18n &&
      leverageTwoLot[6] === 6n * 10n ** 18n &&
      leverageThreeLot[5] === 4_000_800n * 10n ** 12n &&
      leverageThreeLot[6] === 4_000_800n * 10n ** 12n,
    "1x/2x/3x leverage margins do not match signed economics and risk floor",
  );
  const [leverageLongAvailable, leverageShortAvailable, leverageRevenue] =
    await Promise.all([
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "available",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: ["0x000000000000000000000000000000000000bEEF"],
      }),
    ]);
  check(
    leverageLongAvailable === 977_999_200n * 10n ** 12n &&
      leverageShortAvailable === 977_639_200n * 10n ** 12n &&
      leverageRevenue === 360n * 10n ** 15n,
    "Maker margin or signed short-Taker fee attribution changed",
  );
  console.log(
    "PASS OrderBookTest.testExactMarginsAndOneShortTakerFeeAtAllLeverages",
  );

  await resetOrderBookState();
  const makerShortQuantity = 5n;
  const makerShort = {
    trader: accounts[1],
    side: 1,
    quantity: makerShortQuantity,
    limitPrice: 1n * 10n ** 18n,
    leverage: 2,
    nonce: 1_601n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const takerLong = {
    trader: accounts[2],
    side: 0,
    quantity: makerShortQuantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 1_701n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  const makerShortReceipt = await signAndMatch(
    makerShort,
    takerLong,
    makerShortQuantity,
  );
  check(
    makerShortReceipt.status === "success",
    "Maker-Short/Taker-Long odd-notional open reverted",
  );
  const makerShortLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const [
    makerShortLot,
    makerShortAvailable,
    takerLongAvailable,
    makerShortLocked,
    takerLongLocked,
    makerShortOi,
    makerShortRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [makerShortLotId],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    makerShortLot[1].toLowerCase() === accounts[2].toLowerCase() &&
      makerShortLot[2].toLowerCase() === accounts[1].toLowerCase() &&
      makerShortLot[3] === makerShortQuantity &&
      makerShortLot[4] === 1n * 10n ** 18n &&
      makerShortLot[5] === 3n &&
      makerShortLot[6] === 3n &&
      makerShortLot[7] === 5n,
    "Maker-Short lot price, roles, 2x ceil margin, or stored OI changed",
  );
  check(
    makerShortAvailable === deposit - 3n &&
      takerLongAvailable === deposit - 4n &&
      makerShortLocked === 3n &&
      takerLongLocked === 3n &&
      makerShortOi === 5n &&
      makerShortRevenue === 1n,
    "Maker-Short/Taker-Long margin or signed Taker fee ownership changed",
  );
  console.log("PASS OrderBookTest.testMakerShortTakerLongFeeAndOddTwoXMargin");

  await resetOrderBookState();
  const deployOrderBookAttempt = async (args) => {
    const deployment = await walletClient.deployContract({
      abi: orderBookArtifact.abi,
      bytecode: `0x${orderBookArtifact.evm.bytecode.object}`,
      args,
      gas: 10_000_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash: deployment });
  };
  const invalidConstructorArgs = [
    [
      "0x0000000000000000000000000000000000000000",
      riskEngineAddress,
      marketStateProviderAddress,
    ],
    [accounts[4], riskEngineAddress, marketStateProviderAddress],
    [clearingHouseAddress, accounts[4], marketStateProviderAddress],
    [
      clearingHouseAddress,
      riskEngineAddress,
      "0x0000000000000000000000000000000000000000",
    ],
    [clearingHouseAddress, riskEngineAddress, marketStateProviderAddress],
  ];
  for (const constructorArgs of invalidConstructorArgs) {
    const invalidDeployment = await deployOrderBookAttempt(constructorArgs);
    check(
      invalidDeployment.status === "reverted",
      "invalid or mismatched immutable wiring deployed",
    );
  }
  const [wiredOrderBook, wiredRiskEngine] = await Promise.all([
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "orderBook",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "riskEngine",
    }),
  ]);
  check(
    wiredOrderBook.toLowerCase() === orderBookAddress.toLowerCase() &&
      wiredRiskEngine.toLowerCase() === riskEngineAddress.toLowerCase(),
    "fixture did not resolve immutable OrderBook/ClearingHouse cycle",
  );
  console.log("PASS OrderBookTest.testImmutableConstructorWiring");

  await resetOrderBookState();
  const aggregateDustQuantity = 1n * 10n ** 18n;
  const aggregateDustOpenMakerOne = {
    trader: accounts[1],
    side: 0,
    quantity: aggregateDustQuantity,
    limitPrice: 2n,
    leverage: 1,
    nonce: 1_801n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const aggregateDustOpenTakerOne = {
    trader: accounts[2],
    side: 1,
    quantity: aggregateDustQuantity,
    limitPrice: 2n,
    leverage: 1,
    nonce: 1_901n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  const aggregateDustOpenMakerTwo = {
    ...aggregateDustOpenMakerOne,
    limitPrice: 1n,
    nonce: 1_802n,
  };
  const aggregateDustOpenTakerTwo = {
    ...aggregateDustOpenTakerOne,
    limitPrice: 1n,
    nonce: 1_902n,
  };
  let aggregateDustReceipt = await signAndMatch(
    aggregateDustOpenMakerOne,
    aggregateDustOpenTakerOne,
    aggregateDustQuantity,
  );
  check(
    aggregateDustReceipt.status === "success",
    "aggregate dust first lot open reverted",
  );
  aggregateDustReceipt = await signAndMatch(
    aggregateDustOpenMakerTwo,
    aggregateDustOpenTakerTwo,
    aggregateDustQuantity,
  );
  check(
    aggregateDustReceipt.status === "success",
    "aggregate dust second lot open reverted",
  );
  const [aggregateDustFirstId, aggregateDustSecondId] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 1],
    }),
  ]);
  const aggregateDustPartialQuantity = 15n * 10n ** 17n;
  const aggregateDustTailQuantity = 5n * 10n ** 17n;
  const aggregateDustCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: aggregateDustPartialQuantity,
    limitPrice: 1n,
    leverage: 1,
    nonce: 1_803n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const aggregateDustCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: aggregateDustPartialQuantity,
    limitPrice: 1n,
    leverage: 1,
    nonce: 1_903n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  aggregateDustReceipt = await signAndMatch(
    aggregateDustCloseMaker,
    aggregateDustCloseTaker,
    aggregateDustPartialQuantity,
  );
  check(
    aggregateDustReceipt.status === "success",
    "positive aggregate close rejected its zero-release dust tail",
  );
  const [
    aggregateDustLongNet,
    aggregateDustShortNet,
    aggregateDustLongCount,
    aggregateDustShortCount,
    aggregateDustLongHead,
    aggregateDustShortHead,
    aggregateDustFirstLot,
    aggregateDustSecondLot,
    aggregateDustLongAvailable,
    aggregateDustShortAvailable,
    aggregateDustLongLocked,
    aggregateDustShortLocked,
    aggregateDustOi,
    aggregateDustRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[1], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotId",
      args: [accounts[2], 0],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [aggregateDustFirstId],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [aggregateDustSecondId],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    aggregateDustLongNet === aggregateDustTailQuantity &&
      aggregateDustShortNet === -aggregateDustTailQuantity &&
      aggregateDustLongCount === 1 &&
      aggregateDustShortCount === 1 &&
      aggregateDustLongHead === aggregateDustSecondId &&
      aggregateDustShortHead === aggregateDustSecondId &&
      aggregateDustFirstLot.every(
        (value) =>
          value === 0n ||
          value === "0x0000000000000000000000000000000000000000",
      ) &&
      aggregateDustSecondLot[3] === aggregateDustTailQuantity &&
      aggregateDustSecondLot[5] === 1n &&
      aggregateDustSecondLot[6] === 1n &&
      aggregateDustSecondLot[7] === 1n,
    "aggregate dust tail was skipped, misapplied, or removed out of FIFO",
  );
  check(
    aggregateDustLongAvailable === deposit - 2n &&
      aggregateDustShortAvailable === deposit - 3n &&
      aggregateDustLongLocked === 1n &&
      aggregateDustShortLocked === 1n &&
      aggregateDustOi === 1n &&
      aggregateDustRevenue === 3n,
    "aggregate dust close changed margin, OI, PnL, or fee ownership",
  );
  const aggregateDustFinalMaker = {
    ...aggregateDustCloseMaker,
    quantity: aggregateDustTailQuantity,
    nonce: 1_804n,
  };
  const aggregateDustFinalTaker = {
    ...aggregateDustCloseTaker,
    quantity: aggregateDustTailQuantity,
    nonce: 1_904n,
  };
  aggregateDustReceipt = await signAndMatch(
    aggregateDustFinalMaker,
    aggregateDustFinalTaker,
    aggregateDustTailQuantity,
  );
  check(
    aggregateDustReceipt.status === "success",
    "aggregate dust exact tail cleanup reverted",
  );
  const [
    aggregateDustFinalLongNet,
    aggregateDustFinalShortNet,
    aggregateDustFinalLongCount,
    aggregateDustFinalShortCount,
    aggregateDustFinalLot,
    aggregateDustFinalLongAvailable,
    aggregateDustFinalShortAvailable,
    aggregateDustFinalLongLocked,
    aggregateDustFinalShortLocked,
    aggregateDustFinalOi,
    aggregateDustFinalRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "lots",
      args: [aggregateDustSecondId],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "available",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    aggregateDustFinalLongNet === 0n &&
      aggregateDustFinalShortNet === 0n &&
      aggregateDustFinalLongCount === 0 &&
      aggregateDustFinalShortCount === 0 &&
      aggregateDustFinalLot.every(
        (value) =>
          value === 0n ||
          value === "0x0000000000000000000000000000000000000000",
      ) &&
      aggregateDustFinalLongAvailable === deposit - 1n &&
      aggregateDustFinalShortAvailable === deposit - 3n &&
      aggregateDustFinalLongLocked === 0n &&
      aggregateDustFinalShortLocked === 0n &&
      aggregateDustFinalOi === 0n &&
      aggregateDustFinalRevenue === 4n,
    "aggregate dust exact tail cleanup did not conserve final state",
  );
  console.log(
    "PASS OrderBookTest.testAggregateCloseIncludesZeroReleaseDustTail",
  );

  await resetOrderBookState();
  const dustOpenQuantity = 1n * 10n ** 18n;
  const dustCloseQuantity = 5n * 10n ** 17n;
  const dustOpenMaker = {
    trader: accounts[1],
    side: 0,
    quantity: dustOpenQuantity,
    limitPrice: 2n,
    leverage: 1,
    nonce: 1_601n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const dustOpenTaker = {
    trader: accounts[2],
    side: 1,
    quantity: dustOpenQuantity,
    limitPrice: 2n,
    leverage: 1,
    nonce: 1_701n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  let dustReceipt = await signAndMatch(
    dustOpenMaker,
    dustOpenTaker,
    dustOpenQuantity,
  );
  check(dustReceipt.status === "success", "dust close fixture open reverted");
  const dustCloseMaker = {
    trader: accounts[1],
    side: 1,
    quantity: dustCloseQuantity,
    limitPrice: 1n,
    leverage: 1,
    nonce: 1_602n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 0,
  };
  const dustCloseTaker = {
    trader: accounts[2],
    side: 0,
    quantity: dustCloseQuantity,
    limitPrice: 1n,
    leverage: 1,
    nonce: 1_702n,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: true,
    role: 1,
  };
  dustReceipt = await signAndMatch(
    dustCloseMaker,
    dustCloseTaker,
    dustCloseQuantity,
  );
  check(dustReceipt.status === "success", "ceil-notional dust close reverted");
  const dustLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const dustLot = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "lots",
    args: [dustLotId],
  });
  const [dustOi, dustLongLocked, dustShortLocked, dustRevenue] =
    await Promise.all([
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "matchedOpenInterest",
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[1]],
      }),
      publicClient.readContract({
        address: clearingHouseAddress,
        abi: clearingArtifact.abi,
        functionName: "lockedMargin",
        args: [accounts[2]],
      }),
      publicClient.readContract({
        address: collateralAddress,
        abi: collateralArtifact.abi,
        functionName: "balanceOf",
        args: ["0x000000000000000000000000000000000000bEEF"],
      }),
    ]);
  check(
    dustLot[3] === dustCloseQuantity &&
      dustLot[5] === 1n &&
      dustLot[6] === 1n &&
      dustLot[7] === 1n &&
      dustOi === 1n &&
      dustLongLocked === 1n &&
      dustShortLocked === 1n &&
      dustRevenue === 2n,
    "dust notional or 1-unit Taker fee did not round up",
  );

  await resetOrderBookState();
  const thinMarginMaker = { ...dustOpenMaker, leverage: 3, nonce: 1_603n };
  const thinMarginTaker = { ...dustOpenTaker, leverage: 3, nonce: 1_703n };
  dustReceipt = await signAndMatch(
    thinMarginMaker,
    thinMarginTaker,
    dustOpenQuantity,
  );
  check(dustReceipt.status === "success", "thin dust fixture open reverted");
  const insufficientMaker = { ...dustCloseMaker, nonce: 1_604n };
  const insufficientTaker = { ...dustCloseTaker, nonce: 1_704n };
  const insufficientMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: insufficientMaker,
  });
  dustReceipt = await signAndMatch(
    insufficientMaker,
    insufficientTaker,
    dustCloseQuantity,
  );
  check(
    dustReceipt.status === "reverted",
    "dust close used unrelated available to pay its rounded-up fee",
  );
  const [
    insufficientFilled,
    insufficientLongPosition,
    insufficientShortPosition,
    insufficientOi,
    insufficientLongLocked,
    insufficientShortLocked,
    insufficientRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [insufficientMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    insufficientFilled === 0n &&
      insufficientLongPosition === dustOpenQuantity &&
      insufficientShortPosition === -dustOpenQuantity &&
      insufficientOi === 2n &&
      insufficientLongLocked === 1n &&
      insufficientShortLocked === 1n &&
      insufficientRevenue === 1n,
    "insufficient dust close did not roll back atomically",
  );

  await resetOrderBookState();
  const oneOiMaker = {
    ...dustOpenMaker,
    limitPrice: 1n,
    nonce: 1_605n,
  };
  const oneOiTaker = {
    ...dustOpenTaker,
    limitPrice: 1n,
    nonce: 1_705n,
  };
  dustReceipt = await signAndMatch(oneOiMaker, oneOiTaker, dustOpenQuantity);
  check(dustReceipt.status === "success", "one-OI dust fixture open reverted");
  const zeroReleaseMaker = { ...dustCloseMaker, nonce: 1_606n };
  const zeroReleaseTaker = { ...dustCloseTaker, nonce: 1_706n };
  const zeroReleaseMakerHash = hashTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: zeroReleaseMaker,
  });
  dustReceipt = await signAndMatch(
    zeroReleaseMaker,
    zeroReleaseTaker,
    dustCloseQuantity,
  );
  check(
    dustReceipt.status === "reverted",
    "standalone zero-OI/margin partial close succeeded",
  );
  const oneOiLotId = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "activeLotId",
    args: [accounts[1], 0],
  });
  const oneOiLot = await publicClient.readContract({
    address: orderBookAddress,
    abi: orderBookArtifact.abi,
    functionName: "lots",
    args: [oneOiLotId],
  });
  const [
    zeroReleaseFilled,
    zeroReleaseLongPosition,
    zeroReleaseShortPosition,
    zeroReleaseOi,
    zeroReleaseLongLocked,
    zeroReleaseShortLocked,
    zeroReleaseRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "filled",
      args: [zeroReleaseMakerHash],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    zeroReleaseFilled === 0n &&
      zeroReleaseLongPosition === dustOpenQuantity &&
      zeroReleaseShortPosition === -dustOpenQuantity &&
      oneOiLot[3] === dustOpenQuantity &&
      oneOiLot[5] === 1n &&
      oneOiLot[6] === 1n &&
      oneOiLot[7] === 1n &&
      zeroReleaseOi === 1n &&
      zeroReleaseLongLocked === 1n &&
      zeroReleaseShortLocked === 1n &&
      zeroReleaseRevenue === 1n,
    "zero-release partial close changed order, lot, or CH state",
  );
  const finalDustMaker = {
    ...zeroReleaseMaker,
    quantity: dustOpenQuantity,
    nonce: 1_607n,
  };
  const finalDustTaker = {
    ...zeroReleaseTaker,
    quantity: dustOpenQuantity,
    nonce: 1_707n,
  };
  dustReceipt = await signAndMatch(
    finalDustMaker,
    finalDustTaker,
    dustOpenQuantity,
  );
  check(
    dustReceipt.status === "success",
    "final dust close did not release exact OI/margin remainder",
  );
  const [
    finalDustLongPosition,
    finalDustShortPosition,
    finalDustLots,
    finalDustOi,
    finalDustLongLocked,
    finalDustShortLocked,
    finalDustRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBookAddress,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouseAddress,
      abi: clearingArtifact.abi,
      functionName: "lockedMargin",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: collateralAddress,
      abi: collateralArtifact.abi,
      functionName: "balanceOf",
      args: ["0x000000000000000000000000000000000000bEEF"],
    }),
  ]);
  check(
    finalDustLongPosition === 0n &&
      finalDustShortPosition === 0n &&
      finalDustLots === 0 &&
      finalDustOi === 0n &&
      finalDustLongLocked === 0n &&
      finalDustShortLocked === 0n &&
      finalDustRevenue === 2n,
    "final dust close did not settle exact remainders and one fee",
  );
  console.log(
    "PASS OrderBookTest.testDustNotionalRoundsUpAndInsufficientProceedsRollback",
  );
}

function futuresOracleArtifacts() {
  const testArtifacts = output.contracts["test/FuturesOracle.t.sol"];
  return {
    testArtifacts,
    token: testArtifacts.OracleTokenMock,
    pair: testArtifacts.OraclePairMock,
    feed: testArtifacts.OracleFeedMock,
    oracle: output.contracts["src/futures/FuturesOracle.sol"].FuturesOracle,
    collateral:
      output.contracts["test/futures/FuturesCollateralMock.sol"]
        .FuturesCollateralMock,
    risk: output.contracts["src/futures/RiskEngine.sol"].RiskEngine,
    clearing: output.contracts["src/futures/ClearingHouse.sol"].ClearingHouse,
    controller:
      output.contracts["src/futures/SafetyController.sol"].SafetyController,
  };
}

async function oracleWrite(
  address,
  abi,
  functionName,
  args = [],
  gas = 5_000_000n,
) {
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
    gas,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  check(receipt.status === "success", `${functionName} transaction failed`);
  return receipt;
}

async function oracleAdvance(seconds) {
  await provider.request({ method: "evm_increaseTime", params: [seconds] });
  await provider.request({ method: "evm_mine", params: [] });
}

async function oracleSetTimestamp(timestamp) {
  await provider.request({
    method: "evm_setTime",
    params: [Number(timestamp * 1_000n)],
  });
  await provider.request({ method: "evm_mine", params: [] });
  const block = await publicClient.getBlock();
  check(
    block.timestamp === timestamp,
    `Unable to set exact oracle test timestamp: ${block.timestamp}/${timestamp}`,
  );
}

async function deployOracleFixture({
  reverse = false,
  reserve0 = 64n * 10n ** 18n,
  reserve1 = 1n * 10n ** 18n,
  decimals = 8n,
  answer = 60_000_000_000n,
  guardian,
} = {}) {
  await resetLocalChain();
  const artifacts = futuresOracleArtifacts();
  const bnbx = await deploy(artifacts.token);
  const wbnb = await deploy(artifacts.token);
  const token0 = reverse ? wbnb : bnbx;
  const token1 = reverse ? bnbx : wbnb;
  const pair = await deploy(artifacts.pair, [token0, token1]);
  const feed = await deploy(artifacts.feed);
  await oracleWrite(pair, artifacts.pair.abi, "setReserves", [
    reserve0,
    reserve1,
  ]);
  if (decimals !== 8n) {
    await oracleWrite(feed, artifacts.feed.abi, "setDecimals", [decimals]);
  }
  await oracleWrite(feed, artifacts.feed.abi, "setFreshAnswer", [answer]);
  const collateral = await deploy(artifacts.collateral);
  const risk = await deploy(artifacts.risk);
  const deploymentNonce = BigInt(
    await publicClient.getTransactionCount({ address: account }),
  );
  const predictedClearing = getContractAddress({
    from: account,
    nonce: deploymentNonce,
  });
  const predictedOracle = getContractAddress({
    from: account,
    nonce: deploymentNonce + 1n,
  });
  const predictedController = getContractAddress({
    from: account,
    nonce: deploymentNonce + 2n,
  });
  const clearing = await deploy(artifacts.clearing, [
    collateral,
    risk,
    accounts[4],
    predictedController,
    accounts[3],
    10n ** 48n,
    10n ** 48n,
    10n ** 48n,
  ]);
  const oracle = await deploy(artifacts.oracle, [
    pair,
    feed,
    bnbx,
    wbnb,
    predictedController,
  ]);
  const controller = await deploy(artifacts.controller, [
    guardian ?? account,
    clearing,
    oracle,
  ]);
  check(
    clearing.toLowerCase() === predictedClearing.toLowerCase() &&
      oracle.toLowerCase() === predictedOracle.toLowerCase() &&
      controller.toLowerCase() === predictedController.toLowerCase(),
    "Oracle fixture deterministic controller wiring mismatch",
  );
  return {
    artifacts,
    bnbx,
    wbnb,
    pair,
    feed,
    oracle,
    controller,
    answer,
  };
}

async function deployConfigurableTokenOracleFixture() {
  await resetLocalChain();
  const artifacts = futuresOracleArtifacts();
  const tokenArtifact = artifacts.testArtifacts.OracleTokenConfigurableMock;
  const bnbx = await deploy(tokenArtifact, [18n]);
  const wbnb = await deploy(tokenArtifact, [18n]);
  const pair = await deploy(artifacts.pair, [bnbx, wbnb]);
  const feed = await deploy(artifacts.feed);
  await oracleWrite(pair, artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
  ]);
  await oracleWrite(feed, artifacts.feed.abi, "setFreshAnswer", [
    60_000_000_000n,
  ]);
  const oracle = await deploy(artifacts.oracle, [
    pair,
    feed,
    bnbx,
    wbnb,
    account,
  ]);
  return {
    artifacts,
    tokenArtifact,
    bnbx,
    wbnb,
    pair,
    feed,
    oracle,
    answer: 60_000_000_000n,
  };
}

function oracleUpdate(fixture) {
  return oracleWrite(fixture.oracle, fixture.artifacts.oracle.abi, "update");
}

function oracleSafetyWrite(fixture, functionName, args = []) {
  return oracleWrite(
    fixture.controller,
    fixture.artifacts.controller.abi,
    functionName,
    args,
  );
}

function oracleRead(fixture) {
  return publicClient.readContract({
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "safeRead",
    gas: 2_000_000n,
  });
}

function oracleFreshFeed(fixture, answer = fixture.answer) {
  fixture.answer = answer;
  return oracleWrite(
    fixture.feed,
    fixture.artifacts.feed.abi,
    "setFreshAnswer",
    [answer],
  );
}

async function oracleBuildWindow(fixture) {
  const baselineReceipt = await oracleUpdate(fixture);
  const baselineBlock = await publicClient.getBlock({
    blockNumber: baselineReceipt.blockNumber,
  });
  let receipt;
  for (let index = 1; index <= 6; index += 1) {
    await oracleSetTimestamp(baselineBlock.timestamp + BigInt(index * 300));
    await oracleFreshFeed(fixture);
    receipt = await oracleUpdate(fixture);
  }
  return { receipt, value: await oracleRead(fixture) };
}

function checkOracleClose(value, label) {
  check(
    Number(value[0]) === 0 &&
      value[1] === 0n &&
      value[2] === 0n &&
      value[3] === 0n &&
      value[4] === 0n,
    `${label} did not return a zeroed CloseOnly tuple`,
  );
}

async function runFuturesOracleProgressionTest() {
  const fixture = await deployOracleFixture();

  const baselineReceipt = await oracleUpdate(fixture);
  const baselineBlock = await publicClient.getBlock({
    blockNumber: baselineReceipt.blockNumber,
  });
  const baselineAt = baselineBlock.timestamp;
  checkOracleClose(await oracleRead(fixture), "Oracle baseline");
  await oracleSetTimestamp(baselineAt + 299n);
  await oracleFreshFeed(fixture);
  await oracleUpdate(fixture);
  checkOracleClose(await oracleRead(fixture), "Oracle too-early observation");
  await oracleSetTimestamp(baselineAt + 300n);
  await oracleFreshFeed(fixture);
  await oracleUpdate(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle exact five-minute observation",
  );
  for (const offset of [600n, 900n]) {
    await oracleSetTimestamp(baselineAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  checkOracleClose(await oracleRead(fixture), "Oracle intermediate");
  for (const offset of [1_200n, 1_500n]) {
    await oracleSetTimestamp(baselineAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  checkOracleClose(await oracleRead(fixture), "Oracle short window");
  await oracleSetTimestamp(baselineAt + 1_800n);
  await oracleFreshFeed(fixture);
  const acceptedReceipt = await oracleUpdate(fixture);
  const accepted = await oracleRead(fixture);
  check(Number(accepted[0]) === 1, "Oracle did not open at thirty minutes");
  check(
    accepted[1] === 9_375_000_000_000_000_000n,
    `Oracle mark mismatch: ${accepted[1]}`,
  );
  check(
    accepted[2] === 15_625_000_000_000_000n,
    `Oracle BNBX/BNB TWAP mismatch: ${accepted[2]}`,
  );
  check(
    accepted[3] === 600_000_000_000_000_000_000n,
    `Oracle BNB/USD normalization mismatch: ${accepted[3]}`,
  );
  const acceptedBlock = await publicClient.getBlock({
    blockNumber: acceptedReceipt.blockNumber,
  });
  check(
    accepted[4] === acceptedBlock.timestamp,
    "Oracle accepted timestamp is not the update timestamp",
  );
  check(
    Number(
      await publicClient.readContract({
        address: fixture.oracle,
        abi: fixture.artifacts.oracle.abi,
        functionName: "marketState",
      }),
    ) === 1,
    "Oracle marketState provider did not expose Open",
  );
  console.log(
    "PASS FuturesOracleProgression.baselineTooEarlyFifteenThirtyAndExactConversion",
  );
}

async function runFuturesOracleMathAndWrapTests() {
  const price0Selector = toFunctionSelector("price0CumulativeLast()");

  let fixture = await deployOracleFixture({
    reverse: true,
    reserve0: 1n * 10n ** 18n,
    reserve1: 64n * 10n ** 18n,
  });
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setMode", [
    price0Selector,
    1,
  ]);
  let accepted = (await oracleBuildWindow(fixture)).value;
  check(
    Number(accepted[0]) === 1 &&
      accepted[1] === 9_375_000_000_000_000_000n &&
      accepted[2] === 15_625_000_000_000_000n,
    "Reversed pair did not select price1 WBNB/BNBX cumulative",
  );
  console.log("PASS FuturesOracleMath.reversedPairSelectsPrice1");

  fixture = await deployOracleFixture();
  const manipulationBaselineReceipt = await oracleUpdate(fixture);
  const manipulationBaselineBlock = await publicClient.getBlock({
    blockNumber: manipulationBaselineReceipt.blockNumber,
  });
  for (let index = 1; index <= 5; index += 1) {
    await oracleSetTimestamp(
      manipulationBaselineBlock.timestamp + BigInt(index * 300),
    );
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  await oracleSetTimestamp(manipulationBaselineBlock.timestamp + 1_740n);
  const manipulationSwitchReceipt = await oracleWrite(
    fixture.pair,
    fixture.artifacts.pair.abi,
    "setReserves",
    [64n * 10n ** 18n, 2n * 10n ** 18n],
  );
  await oracleSetTimestamp(manipulationBaselineBlock.timestamp + 1_800n);
  await oracleFreshFeed(fixture);
  const manipulationEndReceipt = await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  const [manipulationSwitchBlock, manipulationEndBlock] = await Promise.all(
    [manipulationSwitchReceipt, manipulationEndReceipt].map((receipt) =>
      publicClient.getBlock({ blockNumber: receipt.blockNumber }),
    ),
  );
  const lowElapsed =
    manipulationSwitchBlock.timestamp - manipulationBaselineBlock.timestamp;
  const highElapsed =
    manipulationEndBlock.timestamp - manipulationSwitchBlock.timestamp;
  const manipulationElapsed = lowElapsed + highElapsed;
  const expectedManipulationX112 =
    ((1n << 106n) * lowElapsed + (1n << 107n) * highElapsed) /
    manipulationElapsed;
  const expectedManipulationTwap =
    (expectedManipulationX112 * 10n ** 18n) / (1n << 112n);
  const expectedManipulationMark = expectedManipulationTwap * 600n;
  check(
    accepted[2] === expectedManipulationTwap &&
      accepted[1] === expectedManipulationMark &&
      highElapsed >= 60n &&
      highElapsed <= 61n &&
      accepted[2] < 16_200_000_000_000_000n,
    `One-minute manipulation was not time weighted: ${accepted[1]}/${accepted[2]}`,
  );
  console.log("PASS FuturesOracleMath.oneMinuteManipulationIsTimeWeighted");

  fixture = await deployOracleFixture({
    reserve0: 100n * 10n ** 18n,
    reserve1: 1n * 10n ** 18n,
  });
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    accepted[2] === 9_999_999_999_999_999n &&
      accepted[1] === 5_999_999_999_999_999_400n,
    `Non-divisible UQ112x112 rounding mismatch: ${accepted[1]}/${accepted[2]}`,
  );
  console.log("PASS FuturesOracleMath.nonDivisibleUqRounding");

  const maxUint112 = (1n << 112n) - 1n;
  const largeFeedAnswer = 1n << 100n;
  fixture = await deployOracleFixture({
    reserve0: 1n,
    reserve1: maxUint112,
    decimals: 18n,
    answer: largeFeedAnswer,
  });
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    accepted[2] === maxUint112 * 10n ** 18n,
    "Full-precision TWAP conversion truncated a representable quotient",
  );
  check(
    accepted[1] === maxUint112 << 100n,
    "Full-precision USD multiplication failed a 512-bit intermediate",
  );
  console.log("PASS FuturesOracleMath.fullPrecision512BitConversion");

  fixture = await deployOracleFixture();
  let block = await publicClient.getBlock();
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setRawState", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
    Number(block.timestamp & ((1n << 32n) - 1n)),
    100n,
    0n,
  ]);
  const decreasingBaselineReceipt = await oracleUpdate(fixture);
  const decreasingBaselineBlock = await publicClient.getBlock({
    blockNumber: decreasingBaselineReceipt.blockNumber,
  });
  for (let index = 1; index <= 6; index += 1) {
    const observedAt = decreasingBaselineBlock.timestamp + BigInt(index * 300);
    await oracleSetTimestamp(observedAt);
    await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setRawState", [
      64n * 10n ** 18n,
      1n * 10n ** 18n,
      Number(observedAt & ((1n << 32n) - 1n)),
      index === 6 ? 99n : 100n,
      0n,
    ]);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle physically impossible cumulative decrease",
  );
  console.log("PASS FuturesOracleMath.impossibleCumulativeDeltaFailsClosed");

  fixture = await deployOracleFixture();
  block = await publicClient.getBlock();
  const priceX112 = 1n << 106n;
  const wrappedStart = (1n << 256n) - 1n - priceX112 * 100n;
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setRawState", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
    Number(block.timestamp & ((1n << 32n) - 1n)),
    wrappedStart,
    0n,
  ]);
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    accepted[2] === 15_625_000_000_000_000n &&
      accepted[1] === 9_375_000_000_000_000_000n,
    "Uint256 cumulative wrap changed the TWAP",
  );
  console.log("PASS FuturesOracleMath.uint256CumulativeWrap");

  fixture = await deployOracleFixture();
  block = await publicClient.getBlock();
  const nearUint32Wrap = (1n << 32n) - 1_000n;
  check(
    block.timestamp < nearUint32Wrap,
    "Test chain started after the first uint32 timestamp wrap",
  );
  await oracleAdvance(Number(nearUint32Wrap - block.timestamp));
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
  ]);
  await oracleFreshFeed(fixture);
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    Number(accepted[0]) === 1 && accepted[2] === 15_625_000_000_000_000n,
    "Uint32 block timestamp wrap changed or rejected a valid TWAP",
  );
  console.log("PASS FuturesOracleMath.uint32TimestampWrap");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  check(Number(accepted[0]) === 1, "Future timestamp precondition failed");
  block = await publicClient.getBlock();
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setRawState", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
    Number(block.timestamp + 30n),
    0n,
    0n,
  ]);
  checkOracleClose(await oracleRead(fixture), "Oracle future pair timestamp");
  console.log("PASS FuturesOracleMath.futurePairTimestampFailsClosed");
}

async function runFuturesOracleFreshnessAndRecoveryTests() {
  let fixture = await deployOracleFixture();
  let accepted = (await oracleBuildWindow(fixture)).value;
  const acceptedAt = accepted[4];
  await oracleSetTimestamp(acceptedAt + 300n);
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle rejected the exact five-minute feed/mark boundary",
  );
  await oracleSetTimestamp(acceptedAt + 301n);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle mark older than five minutes",
  );
  console.log("PASS FuturesOracleFreshness.exactMarkBoundaryAndStale");

  for (const gap of [300n, 301n, 450n]) {
    fixture = await deployOracleFixture();
    accepted = (await oracleBuildWindow(fixture)).value;
    const priorUpdatedAt = accepted[4];
    await oracleSetTimestamp(priorUpdatedAt + gap);
    if (gap === 300n) {
      check(
        Number((await oracleRead(fixture))[0]) === 1,
        "Oracle rejected the exact stale-boundary pre-update read",
      );
    } else {
      checkOracleClose(
        await oracleRead(fixture),
        `Oracle stale pre-update read at ${gap} seconds`,
      );
    }
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
    accepted = await oracleRead(fixture);
    check(
      Number(accepted[0]) === 1 &&
        accepted[1] === 9_375_000_000_000_000_000n &&
        accepted[4] === priorUpdatedAt + gap,
      `Oracle did not roll an honest trailing candidate at ${gap} seconds`,
    );
  }
  console.log(
    "PASS FuturesOracleFreshness.staleReadStillAllowsHonestRollingUpdate",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  const staleCandidateAt = accepted[4] + 301n;
  await oracleSetTimestamp(staleCandidateAt);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle stale mark before invalid candidate update",
  );
  await oracleFreshFeed(fixture, 66_000_000_001n);
  await oracleUpdate(fixture);
  await oracleFreshFeed(fixture, 60_000_000_000n);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle invalid stale candidate did not latch rebuild",
  );
  for (let index = 1; index <= 5; index += 1) {
    await oracleSetTimestamp(staleCandidateAt + BigInt(index * 300));
    await oracleFreshFeed(fixture, 60_000_000_000n);
    await oracleUpdate(fixture);
    checkOracleClose(
      await oracleRead(fixture),
      "Oracle invalid stale candidate recovery before thirty minutes",
    );
  }
  await oracleSetTimestamp(staleCandidateAt + 1_800n);
  await oracleFreshFeed(fixture, 60_000_000_000n);
  await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 &&
      accepted[1] === 9_375_000_000_000_000_000n &&
      accepted[4] === staleCandidateAt + 1_800n,
    "Oracle invalid stale candidate did not recover from its reseeded point",
  );
  console.log(
    "PASS FuturesOracleFreshness.invalidStaleCandidateClearsAndReseeds",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleWrite(
    fixture.feed,
    fixture.artifacts.feed.abi,
    "setAnswerWithAge",
    [60_000_000_000n, 300n],
  );
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle rejected feed data exactly five minutes old",
  );
  await oracleWrite(
    fixture.feed,
    fixture.artifacts.feed.abi,
    "setAnswerWithAge",
    [60_000_000_000n, 301n],
  );
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle feed older than five minutes",
  );
  await oracleFreshFeed(fixture);
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle did not expose a still-fresh accepted mark after feed recovery",
  );
  console.log("PASS FuturesOracleFreshness.exactFeedBoundaryAndRecovery");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  const latestRoundSelector = toFunctionSelector("latestRoundData()");
  await oracleWrite(fixture.feed, fixture.artifacts.feed.abi, "setMode", [
    latestRoundSelector,
    1,
  ]);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle reverting live feed read",
  );
  await oracleUpdate(fixture);
  await oracleWrite(fixture.feed, fixture.artifacts.feed.abi, "setMode", [
    latestRoundSelector,
    0,
  ]);
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle did not recover the still-fresh accepted mark",
  );
  await oracleAdvance(301);
  await oracleFreshFeed(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle expired mark after dependency recovery",
  );
  await oracleUpdate(fixture);
  for (let index = 0; index < 6; index += 1) {
    await oracleAdvance(300);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 && accepted[1] === 9_375_000_000_000_000_000n,
    "Oracle did not rebuild a complete window after mark expiry",
  );
  console.log("PASS FuturesOracleRecovery.faultThenFreshFullWindow");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  let priorUpdatedAt = accepted[4];
  for (let index = 0; index < 12; index += 1) {
    await oracleSetTimestamp(priorUpdatedAt + 300n);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
    accepted = await oracleRead(fixture);
    check(
      Number(accepted[0]) === 1 && accepted[4] > priorUpdatedAt,
      `Oracle rolling observation chain failed at refresh ${index}: ${accepted.join(",")}`,
    );
    priorUpdatedAt = accepted[4];
  }
  console.log("PASS FuturesOracleRecovery.rollingFixedObservationChain");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleSafetyWrite(fixture, "forceCloseOnly");
  checkOracleClose(await oracleRead(fixture), "Oracle guardian forced close");
  await oracleAdvance(1_800);
  await oracleFreshFeed(fixture);
  await oracleUpdate(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle guardian forced-close permanence",
  );
  console.log("PASS FuturesOracleSafety.guardianForceCloseIsPermanent");
}

async function runFuturesOracleObservationMutationTests() {
  let fixture = await deployOracleFixture();
  const baselineReceipt = await oracleUpdate(fixture);
  const baselineBlock = await publicClient.getBlock({
    blockNumber: baselineReceipt.blockNumber,
  });
  const baselineAt = baselineBlock.timestamp;
  for (const offset of [300n, 600n, 900n, 1_800n, 2_100n, 2_400n]) {
    await oracleSetTimestamp(baselineAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle window without a centered intermediate",
  );
  await oracleSetTimestamp(baselineAt + 2_700n);
  await oracleFreshFeed(fixture);
  await oracleUpdate(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle reused pre-fault history after a missing centered intermediate",
  );
  console.log(
    "PASS FuturesOracleObservations.intermediateMustBeCenteredAndFresh",
  );

  fixture = await deployOracleFixture();
  const irregularBaselineReceipt = await oracleUpdate(fixture);
  const irregularBaselineBlock = await publicClient.getBlock({
    blockNumber: irregularBaselineReceipt.blockNumber,
  });
  const irregularAt = irregularBaselineBlock.timestamp;
  for (const offset of [300n, 600n, 900n, 1_200n, 1_500n, 2_400n]) {
    await oracleSetTimestamp(irregularAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle irregular-window fixture did not accept its valid centered window",
  );
  await oracleSetTimestamp(irregularAt + 2_700n);
  await oracleFreshFeed(fixture);
  const invalidWindowUpdate = await publicClient.simulateContract({
    account,
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "update",
  });
  checkOracleClose(
    invalidWindowUpdate.result,
    "Oracle full ring without centered evidence update",
  );
  await oracleUpdate(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle full ring without centered evidence safeRead",
  );
  check(
    Number(
      await publicClient.readContract({
        address: fixture.oracle,
        abi: fixture.artifacts.oracle.abi,
        functionName: "marketState",
      }),
    ) === 0,
    "Oracle marketState reopened after an incomplete rolling window",
  );
  for (const offset of [3_000n, 3_300n, 3_600n, 3_900n, 4_200n]) {
    await oracleSetTimestamp(irregularAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
    checkOracleClose(
      await oracleRead(fixture),
      "Oracle incomplete-window rebuild before thirty minutes",
    );
  }
  await oracleSetTimestamp(irregularAt + 4_500n);
  await oracleFreshFeed(fixture);
  await oracleUpdate(fixture);
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle did not recover exactly thirty minutes after reseeding an incomplete window",
  );
  console.log(
    "PASS FuturesOracleObservations.invalidCompleteWindowLatchesRebuild",
  );

  fixture = await deployOracleFixture();
  const rollingBaselineReceipt = await oracleUpdate(fixture);
  const rollingBaselineBlock = await publicClient.getBlock({
    blockNumber: rollingBaselineReceipt.blockNumber,
  });
  const rollingAt = rollingBaselineBlock.timestamp;
  for (const offset of [300n, 600n, 900n]) {
    await oracleSetTimestamp(rollingAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    11n * 10n ** 17n,
  ]);
  for (const offset of [1_200n, 1_500n, 1_800n]) {
    await oracleSetTimestamp(rollingAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  let accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 &&
      accepted[2] === 16_406_249_999_999_999n &&
      accepted[3] === 600_000_000_000_000_000_000n &&
      accepted[1] === 9_843_749_999_999_999_400n,
    "Oracle initial mixed-price window did not match literal expectation",
  );
  for (const offset of [2_100n, 2_400n, 2_700n]) {
    await oracleSetTimestamp(rollingAt + offset);
    await oracleFreshFeed(fixture);
    await oracleUpdate(fixture);
  }
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 &&
      accepted[2] === 17_187_499_999_999_999n &&
      accepted[1] === 10_312_499_999_999_999_400n,
    `Oracle did not roll to a trailing thirty-minute window: ${accepted[1]}/${accepted[2]}`,
  );
  console.log("PASS FuturesOracleObservations.rollingWindowDropsGenesisPrice");
}

async function runFuturesOracleDeviationTests() {
  let fixture = await deployOracleFixture();
  let accepted = (await oracleBuildWindow(fixture)).value;
  const initialMark = 9_375_000_000_000_000_000n;
  check(accepted[1] === initialMark, "Deviation fixture mark mismatch");

  const transientAcceptedAt = accepted[4];
  await oracleSetTimestamp(transientAcceptedAt + 240n);
  await oracleFreshFeed(fixture, 66_000_000_001n);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle transient live deviation before observation spacing",
  );
  const transientUpdate = await publicClient.simulateContract({
    account,
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "update",
  });
  checkOracleClose(
    transientUpdate.result,
    "Oracle transient too-early deviation update",
  );
  await oracleUpdate(fixture);
  await oracleFreshFeed(fixture, 60_000_000_000n);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 &&
      accepted[1] === initialMark &&
      accepted[4] === transientAcceptedAt,
    "Oracle latched or rewrote state for a recovered sub-spacing deviation",
  );
  console.log(
    "PASS FuturesOracleDeviation.transientSubSpacingOutlierDoesNotLatch",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleSetTimestamp(accepted[4] + 300n);
  await oracleFreshFeed(fixture, 66_000_000_000n);
  check(
    Number((await oracleRead(fixture))[0]) === 1,
    "Oracle live read rejected the exact positive ten-percent boundary",
  );
  await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 && accepted[1] === 10_312_500_000_000_000_000n,
    "Oracle candidate rejected the exact positive ten-percent boundary",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleSetTimestamp(accepted[4] + 300n);
  await oracleFreshFeed(fixture, 54_000_000_000n);
  await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 && accepted[1] === 8_437_500_000_000_000_000n,
    "Oracle candidate rejected the exact negative ten-percent boundary",
  );
  console.log(
    "PASS FuturesOracleDeviation.positiveAndNegativeEqualityAccepted",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  const faultAt = accepted[4] + 300n;
  await oracleSetTimestamp(faultAt);
  await oracleFreshFeed(fixture, 66_000_000_001n);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle live mark just above ten percent",
  );
  const simulatedFault = await publicClient.simulateContract({
    account,
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "update",
  });
  checkOracleClose(
    simulatedFault.result,
    "Oracle update candidate just above ten percent",
  );
  await oracleUpdate(fixture);
  checkOracleClose(await oracleRead(fixture), "Oracle deviation latch");
  for (let index = 1; index <= 5; index += 1) {
    await oracleSetTimestamp(faultAt + BigInt(index * 300));
    await oracleFreshFeed(fixture, 60_000_000_000n);
    await oracleUpdate(fixture);
  }
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle deviation recovery before thirty minutes",
  );
  await oracleSetTimestamp(faultAt + 1_800n);
  await oracleFreshFeed(fixture, 60_000_000_000n);
  await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 && accepted[1] === initialMark,
    "Oracle deviation recovery did not accept a full valid window",
  );
  console.log("PASS FuturesOracleDeviation.oneUnitAboveRejectsAndRebuilds");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleSafetyWrite(fixture, "lowerMaxDeviationBps", [500]);
  await oracleSetTimestamp(accepted[4] + 300n);
  await oracleFreshFeed(fixture, 63_000_000_000n);
  await oracleUpdate(fixture);
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 && accepted[1] === 9_843_750_000_000_000_000n,
    "Oracle rejected the guardian-lowered five-percent equality",
  );

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  await oracleSafetyWrite(fixture, "lowerMaxDeviationBps", [500]);
  await oracleSetTimestamp(accepted[4] + 300n);
  await oracleFreshFeed(fixture, 63_000_000_001n);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle live mark just above lowered deviation",
  );
  await oracleUpdate(fixture);
  checkOracleClose(
    await oracleRead(fixture),
    "Oracle candidate just above lowered deviation",
  );
  console.log("PASS FuturesOracleDeviation.guardianLoweredEqualityIsStrict");

  fixture = await deployOracleFixture();
  accepted = (await oracleBuildWindow(fixture)).value;
  const latestRoundSelector = toFunctionSelector("latestRoundData()");
  await oracleWrite(fixture.feed, fixture.artifacts.feed.abi, "setMode", [
    latestRoundSelector,
    1,
  ]);
  await oracleUpdate(fixture);
  await oracleWrite(fixture.feed, fixture.artifacts.feed.abi, "setMode", [
    latestRoundSelector,
    0,
  ]);
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    2n * 10n ** 18n,
  ]);
  const componentBaselineBlock = await publicClient.getBlock();
  await oracleFreshFeed(fixture, 30_000_000_000n);
  await oracleUpdate(fixture);
  for (let index = 1; index <= 6; index += 1) {
    await oracleSetTimestamp(
      componentBaselineBlock.timestamp + BigInt(index * 300),
    );
    await oracleFreshFeed(fixture, 30_000_000_000n);
    await oracleUpdate(fixture);
  }
  accepted = await oracleRead(fixture);
  check(
    Number(accepted[0]) === 1 &&
      accepted[1] === initialMark &&
      accepted[2] === 31_250_000_000_000_000n &&
      accepted[3] === 300_000_000_000_000_000_000n,
    "Oracle independently deviation-capped valid offsetting components",
  );
  console.log("PASS FuturesOracleDeviation.finalUsdMarkIsTheBoundedValue");
}

async function assertOracleDependencyFault(
  fixture,
  target,
  targetAbi,
  selector,
  mode,
  label,
) {
  await oracleWrite(target, targetAbi, "setMode", [selector, mode]);
  checkOracleClose(await oracleRead(fixture), `${label} safeRead`);
  const simulation = await publicClient.simulateContract({
    account,
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "update",
    gas: 2_000_000n,
  });
  checkOracleClose(simulation.result, `${label} update`);
  const receipt = await oracleWrite(
    fixture.oracle,
    fixture.artifacts.oracle.abi,
    "update",
    [],
    2_000_000n,
  );
  check(receipt.status === "success", `${label} update bubbled`);
  await oracleWrite(target, targetAbi, "setMode", [selector, 0]);
}

async function runFuturesOracleDependencyBoundsTests() {
  const modes = [
    [6, "gas-burning"],
    [1, "revert"],
    [2, "short"],
    [3, "overlong"],
    [4, "malformed"],
    [5, "bomb"],
  ];
  const selectors = {
    token0: toFunctionSelector("token0()"),
    token1: toFunctionSelector("token1()"),
    reserves: toFunctionSelector("getReserves()"),
    price0: toFunctionSelector("price0CumulativeLast()"),
    price1: toFunctionSelector("price1CumulativeLast()"),
    decimals: toFunctionSelector("decimals()"),
    round: toFunctionSelector("latestRoundData()"),
  };

  for (const [selector, selectorLabel] of [
    [selectors.token0, "token0"],
    [selectors.token1, "token1"],
  ]) {
    const fixture = await deployOracleFixture();
    await oracleBuildWindow(fixture);
    for (const [mode, modeLabel] of modes) {
      await assertOracleDependencyFault(
        fixture,
        fixture.pair,
        fixture.artifacts.pair.abi,
        selector,
        mode,
        `Oracle ${selectorLabel} ${modeLabel}`,
      );
    }
  }

  let fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  for (const [mode, modeLabel] of modes) {
    if (mode === 4) {
      for (const field of [0, 1, 2]) {
        await oracleWrite(
          fixture.pair,
          fixture.artifacts.pair.abi,
          "setReserveMalformedField",
          [field],
        );
        await assertOracleDependencyFault(
          fixture,
          fixture.pair,
          fixture.artifacts.pair.abi,
          selectors.reserves,
          mode,
          `Oracle reserves malformed field ${field}`,
        );
      }
    } else {
      await assertOracleDependencyFault(
        fixture,
        fixture.pair,
        fixture.artifacts.pair.abi,
        selectors.reserves,
        mode,
        `Oracle reserves ${modeLabel}`,
      );
    }
  }

  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  for (const [mode, modeLabel] of modes.filter(([mode]) => mode !== 4)) {
    await assertOracleDependencyFault(
      fixture,
      fixture.pair,
      fixture.artifacts.pair.abi,
      selectors.price0,
      mode,
      `Oracle price0 cumulative ${modeLabel}`,
    );
  }

  fixture = await deployOracleFixture({
    reverse: true,
    reserve0: 1n * 10n ** 18n,
    reserve1: 64n * 10n ** 18n,
  });
  await oracleBuildWindow(fixture);
  for (const [mode, modeLabel] of modes.filter(([mode]) => mode !== 4)) {
    await assertOracleDependencyFault(
      fixture,
      fixture.pair,
      fixture.artifacts.pair.abi,
      selectors.price1,
      mode,
      `Oracle price1 cumulative ${modeLabel}`,
    );
  }

  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  for (const [mode, modeLabel] of modes) {
    await assertOracleDependencyFault(
      fixture,
      fixture.feed,
      fixture.artifacts.feed.abi,
      selectors.decimals,
      mode,
      `Oracle feed decimals ${modeLabel}`,
    );
  }
  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  for (const [mode, modeLabel] of modes) {
    if (mode === 4) {
      for (const field of [0, 1]) {
        await oracleWrite(
          fixture.feed,
          fixture.artifacts.feed.abi,
          "setRoundMalformedField",
          [field],
        );
        await assertOracleDependencyFault(
          fixture,
          fixture.feed,
          fixture.artifacts.feed.abi,
          selectors.round,
          mode,
          `Oracle latestRoundData malformed field ${field}`,
        );
      }
    } else {
      await assertOracleDependencyFault(
        fixture,
        fixture.feed,
        fixture.artifacts.feed.abi,
        selectors.round,
        mode,
        `Oracle latestRoundData ${modeLabel}`,
      );
    }
  }

  for (const tokenSide of ["bnbx", "wbnb"]) {
    fixture = await deployConfigurableTokenOracleFixture();
    await oracleBuildWindow(fixture);
    const token = fixture[tokenSide];
    for (const [mode, modeLabel] of modes) {
      await oracleWrite(token, fixture.tokenArtifact.abi, "setMode", [mode]);
      await assertOracleSafeAndUpdateClose(
        fixture,
        `Oracle ${tokenSide} decimals ${modeLabel}`,
      );
      await oracleWrite(token, fixture.tokenArtifact.abi, "setMode", [0]);
    }
  }
  console.log(
    "PASS FuturesOracleDependencies.everySelectorRejectsMalformedAndGasBurningReturns",
  );
}

async function assertOracleSafeAndUpdateClose(fixture, label) {
  checkOracleClose(await oracleRead(fixture), `${label} safeRead`);
  const simulation = await publicClient.simulateContract({
    account,
    address: fixture.oracle,
    abi: fixture.artifacts.oracle.abi,
    functionName: "update",
    gas: 2_000_000n,
  });
  checkOracleClose(simulation.result, `${label} update`);
  const receipt = await oracleWrite(
    fixture.oracle,
    fixture.artifacts.oracle.abi,
    "update",
    [],
    2_000_000n,
  );
  check(receipt.status === "success", `${label} update bubbled`);
}

async function runFuturesOracleDependencySemanticTests() {
  let fixture = await deployOracleFixture({
    decimals: 0n,
    answer: 600n,
  });
  let accepted = (await oracleBuildWindow(fixture)).value;
  check(
    Number(accepted[0]) === 1 && accepted[3] === 600_000_000_000_000_000_000n,
    "Oracle did not normalize a zero-decimal feed",
  );
  fixture = await deployOracleFixture({
    decimals: 18n,
    answer: 600n * 10n ** 18n,
  });
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    Number(accepted[0]) === 1 && accepted[3] === 600_000_000_000_000_000_000n,
    "Oracle did not normalize an eighteen-decimal feed",
  );
  fixture = await deployOracleFixture({ decimals: 19n });
  await assertOracleSafeAndUpdateClose(
    fixture,
    "Oracle unsupported nineteen-decimal feed",
  );
  console.log("PASS FuturesOracleFeed.decimalNormalizationAndUnsupportedRange");

  const cases = [
    {
      label: "zero answer",
      args: (now) => [2n, 0n, now, now, 2n],
    },
    {
      label: "negative answer",
      args: (now) => [2n, -1n, now, now, 2n],
    },
    {
      label: "round inconsistency",
      args: (now) => [3n, 60_000_000_000n, now, now, 2n],
    },
    {
      label: "zero updatedAt",
      args: (now) => [2n, 60_000_000_000n, 0n, 0n, 2n],
    },
    {
      label: "startedAt after updatedAt",
      args: (now) => [2n, 60_000_000_000n, now, now - 1n, 2n],
    },
    {
      label: "future updatedAt",
      args: (now) => [2n, 60_000_000_000n, now + 1n, now + 1n, 2n],
    },
    {
      label: "stale updatedAt",
      args: (now) => [2n, 60_000_000_000n, now - 301n, now - 301n, 2n],
    },
  ];
  for (const testCase of cases) {
    fixture = await deployOracleFixture();
    await oracleBuildWindow(fixture);
    const block = await publicClient.getBlock();
    await oracleWrite(
      fixture.feed,
      fixture.artifacts.feed.abi,
      "setRoundData",
      testCase.args(block.timestamp),
    );
    await assertOracleSafeAndUpdateClose(
      fixture,
      `Oracle feed ${testCase.label}`,
    );
  }
  console.log("PASS FuturesOracleFeed.roundAnswerAndTimestampValidation");

  fixture = await deployOracleFixture({
    decimals: 0n,
    answer: (1n << 255n) - 1n,
  });
  await assertOracleSafeAndUpdateClose(
    fixture,
    "Oracle feed normalization overflow",
  );

  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    0n,
    1n * 10n ** 18n,
  ]);
  await assertOracleSafeAndUpdateClose(fixture, "Oracle zero reserve0");

  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    0n,
  ]);
  await assertOracleSafeAndUpdateClose(fixture, "Oracle zero reserve1");

  fixture = await deployOracleFixture();
  await oracleBuildWindow(fixture);
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setTokens", [
    fixture.wbnb,
    fixture.bnbx,
  ]);
  await assertOracleSafeAndUpdateClose(
    fixture,
    "Oracle post-deployment pair orientation mutation",
  );
  console.log("PASS FuturesOraclePair.zeroReservesAndIdentityMutation");

  const maxUint112 = (1n << 112n) - 1n;
  fixture = await deployOracleFixture({
    reserve0: 1n,
    reserve1: maxUint112,
    decimals: 18n,
    answer: (1n << 255n) - 1n,
  });
  const overflowWindow = await oracleBuildWindow(fixture);
  checkOracleClose(overflowWindow.value, "Oracle unrepresentable final mark");
  console.log("PASS FuturesOracleMath.unrepresentableMarkFailsClosed");

  fixture = await deployOracleFixture();
  const postWrapAt = (1n << 32n) + 1_000n;
  await oracleSetTimestamp(postWrapAt);
  await oracleFreshFeed(fixture);
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
  ]);
  accepted = (await oracleBuildWindow(fixture)).value;
  check(
    Number(accepted[0]) === 1,
    "Oracle post-wrap future-timestamp fixture did not open",
  );
  const postWrapBlock = await publicClient.getBlock();
  await oracleWrite(fixture.pair, fixture.artifacts.pair.abi, "setRawState", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
    Number((postWrapBlock.timestamp + 30n) & ((1n << 32n) - 1n)),
    0n,
    0n,
  ]);
  await assertOracleSafeAndUpdateClose(
    fixture,
    "Oracle post-wrap future reserve timestamp",
  );
  console.log("PASS FuturesOracleMath.postWrapFuturePairTimestampFailsClosed");
}

async function expectDeploymentRevert(artifact, args, label) {
  let reverted = false;
  try {
    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
      args,
      gas: 20_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    reverted = receipt.status === "reverted";
  } catch {
    reverted = true;
  }
  check(reverted, `${label} deployment unexpectedly succeeded`);
}

async function runFuturesOracleConstructorTests() {
  await resetLocalChain();
  const artifacts = futuresOracleArtifacts();
  const bnbx = await deploy(artifacts.token);
  const wbnb = await deploy(artifacts.token);
  const outsider = await deploy(artifacts.token);
  const feed = await deploy(artifacts.feed);
  const pair = await deploy(artifacts.pair, [bnbx, wbnb]);
  await oracleWrite(pair, artifacts.pair.abi, "setReserves", [
    64n * 10n ** 18n,
    1n * 10n ** 18n,
  ]);
  await oracleWrite(feed, artifacts.feed.abi, "setFreshAnswer", [
    60_000_000_000n,
  ]);
  const goodArgs = [pair, feed, bnbx, wbnb, account];

  for (let index = 0; index < goodArgs.length; index += 1) {
    const args = [...goodArgs];
    args[index] = "0x0000000000000000000000000000000000000000";
    await expectDeploymentRevert(
      artifacts.oracle,
      args,
      `Oracle zero constructor argument ${index}`,
    );
  }
  for (const index of [0, 1, 2, 3]) {
    const args = [...goodArgs];
    args[index] = accounts[4];
    await expectDeploymentRevert(
      artifacts.oracle,
      args,
      `Oracle no-code constructor argument ${index}`,
    );
  }

  let wrongPair = await deploy(artifacts.pair, [bnbx, outsider]);
  await expectDeploymentRevert(
    artifacts.oracle,
    [wrongPair, feed, bnbx, wbnb, account],
    "Oracle wrong pair tokens",
  );
  wrongPair = await deploy(artifacts.pair, [bnbx, bnbx]);
  await expectDeploymentRevert(
    artifacts.oracle,
    [wrongPair, feed, bnbx, wbnb, account],
    "Oracle duplicate pair tokens",
  );
  await expectDeploymentRevert(
    artifacts.oracle,
    [wrongPair, feed, bnbx, bnbx, account],
    "Oracle identical expected token dependencies",
  );

  const configurableToken = artifacts.testArtifacts.OracleTokenConfigurableMock;
  const wrongDecimals = await deploy(configurableToken, [17n]);
  const wrongDecimalsPair = await deploy(artifacts.pair, [wrongDecimals, wbnb]);
  await expectDeploymentRevert(
    artifacts.oracle,
    [wrongDecimalsPair, feed, wrongDecimals, wbnb, account],
    "Oracle non-18 BNBX decimals",
  );
  for (const expectedSide of ["bnbx", "wbnb"]) {
    const configurable = await deploy(configurableToken, [18n]);
    const decimalPair =
      expectedSide === "bnbx"
        ? await deploy(artifacts.pair, [configurable, wbnb])
        : await deploy(artifacts.pair, [bnbx, configurable]);
    for (const [mode, modeLabel] of [
      [6, "gas-burning"],
      [1, "revert"],
      [2, "short"],
      [3, "overlong"],
      [4, "malformed"],
      [5, "bomb"],
    ]) {
      await oracleWrite(configurable, configurableToken.abi, "setMode", [mode]);
      await expectDeploymentRevert(
        artifacts.oracle,
        [
          decimalPair,
          feed,
          expectedSide === "bnbx" ? configurable : bnbx,
          expectedSide === "wbnb" ? configurable : wbnb,
          account,
        ],
        `Oracle ${expectedSide} decimals ${modeLabel}`,
      );
      await oracleWrite(configurable, configurableToken.abi, "setMode", [0]);
    }
  }

  const token0Selector = toFunctionSelector("token0()");
  const token1Selector = toFunctionSelector("token1()");
  for (const [selector, label] of [
    [token0Selector, "token0"],
    [token1Selector, "token1"],
  ]) {
    for (const [mode, modeLabel] of [
      [6, "gas-burning"],
      [1, "revert"],
      [2, "short"],
      [3, "overlong"],
      [4, "malformed"],
      [5, "bomb"],
    ]) {
      await oracleWrite(pair, artifacts.pair.abi, "setMode", [selector, mode]);
      await expectDeploymentRevert(
        artifacts.oracle,
        goodArgs,
        `Oracle ${label} ${modeLabel}`,
      );
      await oracleWrite(pair, artifacts.pair.abi, "setMode", [selector, 0]);
    }
  }
  console.log(
    "PASS FuturesOracleConstructor.dependenciesIdentityDecimalsAndBounds",
  );
}

async function runFuturesOracleOrderBookIntegrationTest() {
  const fixture = await deployOracleFixture();
  const testArtifacts = fixture.artifacts.testArtifacts;
  const deployerArtifact = testArtifacts.OracleOrderBookFixtureDeployer;
  const collateralArtifact =
    output.contracts["test/futures/FuturesCollateralMock.sol"]
      .FuturesCollateralMock;
  const riskArtifact =
    output.contracts["src/futures/RiskEngine.sol"].RiskEngine;
  const clearingArtifact =
    output.contracts["src/futures/ClearingHouse.sol"].ClearingHouse;
  const orderBookArtifact =
    output.contracts["src/futures/OrderBook.sol"].OrderBook;
  const collateral = await deploy(collateralArtifact);
  const riskEngine = await deploy(riskArtifact);
  const fixtureDeployer = await deploy(deployerArtifact);
  const cap = 10n ** 48n;
  await oracleWrite(
    fixtureDeployer,
    deployerArtifact.abi,
    "deploy",
    [collateral, riskEngine, fixture.oracle, account, accounts[4], cap],
    100_000_000n,
  );
  const [clearingHouse, orderBook] = await Promise.all(
    ["clearingHouse", "orderBook"].map((functionName) =>
      publicClient.readContract({
        address: fixtureDeployer,
        abi: deployerArtifact.abi,
        functionName,
      }),
    ),
  );

  const traderWallets = [1, 2].map((index) =>
    createWalletClient({
      account: accounts[index],
      chain: localChain,
      transport: custom(provider),
    }),
  );
  const deposit = 1_000n * 10n ** 18n;
  for (let index = 0; index < traderWallets.length; index += 1) {
    await oracleWrite(collateral, collateralArtifact.abi, "mint", [
      accounts[index + 1],
      deposit,
    ]);
    let hash = await traderWallets[index].writeContract({
      address: collateral,
      abi: collateralArtifact.abi,
      functionName: "approve",
      args: [clearingHouse, deposit],
      gas: 1_000_000n,
    });
    let receipt = await publicClient.waitForTransactionReceipt({ hash });
    check(receipt.status === "success", "Oracle integration approval failed");
    hash = await traderWallets[index].writeContract({
      address: clearingHouse,
      abi: clearingArtifact.abi,
      functionName: "deposit",
      args: [deposit],
      gas: 2_000_000n,
    });
    receipt = await publicClient.waitForTransactionReceipt({ hash });
    check(receipt.status === "success", "Oracle integration deposit failed");
  }

  const quantity = 10n * 10n ** 18n;
  const deadline = (1n << 64n) - 1n;
  const openMaker = {
    trader: accounts[1],
    side: 0,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 101n,
    deadline,
    reduceOnly: false,
    role: 0,
  };
  const openTaker = {
    trader: accounts[2],
    side: 1,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 3,
    nonce: 201n,
    deadline,
    reduceOnly: false,
    role: 1,
  };
  const signOrder = (order, signerIndex) =>
    signingAccounts[signerIndex].signTypedData({
      domain: orderDomain(orderBook),
      types: orderTypes,
      primaryType: "Order",
      message: order,
    });
  const match = async (maker, taker, expectSuccess) => {
    const makerIndex = accounts.findIndex(
      (candidate) => candidate.toLowerCase() === maker.trader.toLowerCase(),
    );
    const takerIndex = accounts.findIndex(
      (candidate) => candidate.toLowerCase() === taker.trader.toLowerCase(),
    );
    const [makerSignature, takerSignature] = await Promise.all([
      signOrder(maker, makerIndex),
      signOrder(taker, takerIndex),
    ]);
    let receipt;
    try {
      const hash = await walletClient.writeContract({
        address: orderBook,
        abi: orderBookArtifact.abi,
        functionName: "matchOrders",
        args: [maker, makerSignature, taker, takerSignature, quantity],
        gas: 10_000_000n,
      });
      receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      check(!expectSuccess, "Oracle integration match unexpectedly threw");
      return;
    }
    check(
      (receipt.status === "success") === expectSuccess,
      `Oracle integration match status mismatch: ${receipt.status}`,
    );
  };

  await match(openMaker, openTaker, false);
  const preOpenState = await Promise.all([
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "nextLotId",
    }),
    publicClient.readContract({
      address: clearingHouse,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
  ]);
  check(
    preOpenState[0] === 0n && preOpenState[1] === 1n && preOpenState[2] === 0n,
    "Incomplete oracle window changed OrderBook or ClearingHouse state",
  );

  await oracleBuildWindow(fixture);
  await match(openMaker, openTaker, true);
  let liveState = await Promise.all([
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouse,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
  ]);
  check(
    liveState[0] === quantity &&
      liveState[1] === -quantity &&
      Number(liveState[2]) === 1 &&
      liveState[3] === 20n * 10n ** 18n,
    "Open oracle state did not permit one exact paired increase",
  );

  await oracleSafetyWrite(fixture, "forceCloseOnly");
  const blockedMaker = { ...openMaker, nonce: 102n };
  const blockedTaker = { ...openTaker, nonce: 202n };
  await match(blockedMaker, blockedTaker, false);
  liveState = await Promise.all([
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "nextLotId",
    }),
    publicClient.readContract({
      address: clearingHouse,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
  ]);
  check(
    liveState[0] === quantity &&
      liveState[1] === 2n &&
      liveState[2] === 20n * 10n ** 18n,
    "CloseOnly paired increase changed live position state",
  );

  const closeMaker = {
    trader: accounts[1],
    side: 1,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 2,
    nonce: 103n,
    deadline,
    reduceOnly: true,
    role: 0,
  };
  const closeTaker = {
    trader: accounts[2],
    side: 0,
    quantity,
    limitPrice: 2n * 10n ** 18n,
    leverage: 3,
    nonce: 203n,
    deadline,
    reduceOnly: true,
    role: 1,
  };
  await match(closeMaker, closeTaker, true);
  const closedState = await Promise.all([
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "netQuantity",
      args: [accounts[2]],
    }),
    publicClient.readContract({
      address: orderBook,
      abi: orderBookArtifact.abi,
      functionName: "activeLotCount",
      args: [accounts[1]],
    }),
    publicClient.readContract({
      address: clearingHouse,
      abi: clearingArtifact.abi,
      functionName: "matchedOpenInterest",
    }),
  ]);
  check(
    closedState[0] === 0n &&
      closedState[1] === 0n &&
      Number(closedState[2]) === 0 &&
      closedState[3] === 0n,
    "CloseOnly did not allow the exact paired reduction",
  );
  console.log(
    "PASS FuturesOracleOrderBook.openWindowGateAndCloseOnlyReduction",
  );
}

const suites = [
  {
    source: "test/BNBXLPRewardsTemplate.t.sol",
    contract: "BNBXLPRewardsTemplateTest",
    tests: [
      "testFactoryOwnsDedicatedLPTokenDeployer",
      "testFactoryCreatesIndependentTokenVaultAndCurve",
      "testStakeRequiresAtLeastOneHundredthWbnbOfPairReserves",
      "testWithdrawalRejectsDustRemnantButAlwaysAllowsFullExit",
      "testStakedLPReceivesSynchronizedRewardsAndCanClaim",
      "testRejectsLPThatTransfersLessThanTheApprovedAmount",
      "testNewLPStakerCannotCapturePreviouslyAccruedRewards",
      "testFailedAutomaticRewardTransferRemainsClaimable",
      "testBoundedProcessorPaysEligibleLPStaker",
      "testTokenAcceptsExactlyTenPercentAndRejectsAnyHigherSide",
      "testBlankRewardPredictionUsesDefaultAndDeployerRejectsOutsiders",
      "testLaunchConfigurationCreatesDedicatedVaultAndDestroysRoles",
      "testBuyAndSellAccountThreeTaxBucketsIndependently",
      "testProcessesTaxesBurnsAutomaticLPAndFundsOnlyLPVault",
      "testFailedAutomaticTaxProcessingCannotBlockSell",
    ],
  },
  {
    source: "test/BNBXHolderRewardsTemplate.t.sol",
    contract: "BNBXHolderRewardsTemplateTest",
    tests: [
      "testFactoryUsesThreeImmutableConstructorValuesAndPrivateDeployer",
      "testBlankAndExplicitDefaultRewardPredictTheSameAddress",
      "testRejectsCustomRewardWithoutLiveWbnbPool",
      "testDedicatedDeployerAuthorizationAndCreate2Parity",
      "testFixedThreeWayTaxesAndNoOwnerSurface",
      "testBuyAndSellAccountLiquidityRewardsAndBurnIndependently",
      "testRejectsAnySideTotalAboveTenPercent",
      "testLaunchRolesAreSingleUseAndDestroyed",
      "testBoundedAutomaticRewardsPayAndIsolateFailedRecipients",
      "testProcessesLiquidityAndRewardsAndBurnsAutomaticLp",
    ],
  },
  {
    source: "test/BNBXZeroTaxTemplate.t.sol",
    contract: "BNBXZeroTaxTemplateTest",
    tests: [
      "testFixedSupplyAndTransfersNeverTakeTax",
      "testRejectsInvalidIdentityAndLaunchManager",
      "testLaunchPermissionsAreSingleUseAndDestroyed",
      "testFiniteAndInfiniteAllowancesFollowERC20Rules",
      "testNoOwnerMintTaxBlacklistPauseUpgradeOrWithdrawal",
      "testFactorySourceUsesOnlyTheDedicatedZeroTaxToken",
      "testFactoryCreatesAndLocksOneBillionZeroTaxTokens",
      "testFactoryPredictionUsesOnlyTheCleanTokenInitCode",
      "testImmediateBuySellCannotCreateBNBProfit",
      "testExactFillGraduatesAndBurnsAllLP",
    ],
  },
  {
    source: "test/BNBXRewardVaultV4.t.sol",
    contract: "BNBXRewardVaultV4Test",
    tests: [
      "testExternalRewardsFollowHolderSharesAndCanBeClaimed",
      "testQueuedRewardsReleaseOnlyAfterFirstEligibleShare",
      "testLPRewardsUseOnlyCustodiedLiquidityAndPreservePastRewards",
      "testNewSharesCannotTakePreviouslyAccruedRewards",
      "testExcludedAndSubminimumAccountsReceiveNoShares",
      "testBoundedProcessorAutomaticallyPaysEligibleHolders",
      "testFailedAutomaticTransferStaysClaimable",
      "testPastRewardsRemainAutomaticallyPayableAfterShareRemoval",
      "testStakedLPRewardsAreAutomaticallyPaid",
    ],
  },
  {
    source: "test/BNBXV4Security.t.sol",
    contract: "BNBXV4SecurityTest",
    tests: [
      "testZeroTaxV4HasNoOwnerMintBlacklistOrTaxSetter",
      "testHolderMinimumIsStrictlyAboveOneThousandOnToken",
      "testFactoryAlsoRejectsBypassedHolderMinimum",
      "testDividendLaunchRolesAreOneTimeAndDestroyed",
      "testFactoryManagerBindingCannotBeChanged",
      "testRewardsFactoryCreatesConfiguredV4TokenAndDestroysSetupRole",
      "testZeroMarketingWalletPredictionUsesTheCreator",
    ],
  },
  {
    source: "test/DividendTaxProcessingV4.t.sol",
    contract: "DividendTaxProcessingV4Test",
    tests: [
      "testProcessesAllBucketsAndBurnsAutomaticLP",
      "testFailedAutomaticProcessingCannotBlockSell",
      "testPartialProcessingWithZeroMarketingTaxCannotUnderflow",
    ],
  },
  {
    source: "test/BNBXRewardVaultV3.t.sol",
    contract: "BNBXRewardVaultV3Test",
    tests: [
      "testExternalRewardsFollowHolderSharesAndCanBeClaimed",
      "testQueuedRewardsReleaseOnlyAfterFirstEligibleShare",
      "testLPRewardsUseOnlyCustodiedLiquidityAndPreservePastRewards",
      "testNewSharesCannotTakePreviouslyAccruedRewards",
      "testExcludedAndSubminimumAccountsReceiveNoShares",
    ],
  },
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
    tests: [
      "testFixedSupplyIsOneBillion",
      "testMetadata",
      "testTransferHasNoTax",
    ],
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
    source: "test/DividendFactoryIntegration.t.sol",
    contract: "DividendFactoryIntegrationTest",
    tests: [
      "testHolderTemplateUsesExternalRewardTokenAndDeadRoles",
      "testEveryTaxFieldMayBeZero",
      "testGraduationActivatesTaxesAndBurnsLPAndRoles",
      "testHolderRewardsUseBalanceDeltaAccounting",
      "testLPTemplateConfiguresCustodyBackedPairShares",
      "testContractRejectsMoreThanTenPercentPerSide",
      "testContractAllowsExactlyTenPercentPerSide",
      "testRejectsRewardTokenWithoutLiveWbnbPool",
      "testRejectsWbnbAsRewardToken",
      "testPathologicalRewardAccountingCannotFreezeTokenTransfers",
    ],
  },
  {
    source: "test/DividendTaxProcessing.t.sol",
    contract: "DividendTaxProcessingTest",
    tests: [
      "testProcessesAllBucketsAndBurnsAutomaticLP",
      "testFailedAutomaticProcessingCannotBlockSell",
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
  {
    source: "test/FuturesTypes.t.sol",
    contract: "FuturesTypesTest",
    tests: [
      "testKnownOrderHashBindsEverySignedField",
      "testMarketStateDefaultsToCloseOnlyAndSidesAreStable",
      "testCollateralMockSupportsAdversarialTransferModes",
      "testRawReturnDependencyMockBoundsAndSignalsPayloads",
    ],
  },
  {
    source: "test/RiskEngine.t.sol",
    contract: "RiskEngineTest",
    tests: [
      "testTakerFeeRoundsUpAndMakerFeeIsZero",
      "testInitialMarginRoundsUpAtThirtyThreePointThreeFourPercent",
      "testMaintenanceMarginRoundsUpAtTwentyPercent",
      "testPairedPnlIsZeroSumForProfitLossAndNoPriceMove",
      "testPairedPnlSupportsTheSignedBoundaryAndRejectsLargerMagnitude",
      "testLiquidationUsesStrictRequirementEqualityAndNonPositiveEquity",
      "testLiquidationPenaltyRoundsUpAndCannotExceedPositiveEquity",
      "testFundingCapsRateAndTimeAndAssignsRoundingToInsurance",
      "testMulDivHandlesA512BitProductAndRejectsInvalidQuotients",
      "testDeployedRuntimeRejectsPrivilegedAndFallbackSelectors",
    ],
  },
  {
    source: "test/ClearingHouse.t.sol",
    contract: "ClearingHouseTest",
    tests: [
      "testConstructorRejectsInvalidDependenciesAndCaps",
      "testConstructorAcceptsPredictedOrderBookAndControllerWithoutCode",
      "testStandardAndNoReturnDepositsCreditExactAvailableLiability",
      "testDepositRejectsZeroCapsFalseMalformedAndDeltaMismatchAtomically",
      "testDepositRejectsCrossFunctionReentryWithoutPartialTransferOrCredit",
      "testStandardAndNoReturnWithdrawalsDebitOnlyCallerAvailable",
      "testWithdrawRejectsUnavailableAndAdversarialTransfersAtomically",
      "testFundInsuranceIsExactCapBoundAndCreatesNoUserOrRevenueBalance",
      "testPreexistingInsolvencyBlocksUserMoveDirectClaimAndController",
      "testPreexistingInsolvencyBlocksRewardMoveAndDirectWithdrawal",
      "testPreexistingInsolvencyBlocksOrderBookInternalReclassifications",
      "testPreexistingInsolvencyBlocksInboundDepositAndInsuranceFunding",
      "testPreexistingInsolvencyBlocksOutboundAvailableWithdrawal",
      "testPreexistingInsolvencyBlocksFeeBearingOpenAndClose",
      "testOpenPairLocksBothMarginsCountsNotionalOnceAndPaysOneExactFee",
      "testOpenPairShortTakerDebitsOnlyShortAvailableAndPaysExactFee",
      "testOpenPairRejectsUnauthorizedInvalidInsufficientAndOverCapCalls",
      "testOpenPairFeeTransferFailureRollsBackEveryBalanceAndOpenInterest",
      "testClosePairLongWinIsZeroSumBeforeFeeAndUsesOnlyCloseProceeds",
      "testClosePairSeparatesExitFeeNotionalFromEntryOiReduction",
      "testClosePairShortTakerDebitsOnlyShortGeneratedProceeds",
      "testClosePairShortWinSpillsOnlyReceiverExcessToClaimable",
      "testClosePairRejectsExcessPnlAndFeeWithoutUsingUnrelatedAvailable",
      "testClosePairShortTakerRejectsFeeWithoutShortCloseProceeds",
      "testClosePairTransferFailureRollsBackReleasePnlFeeAndOpenInterest",
      "testStandalonePenaltyCannotFullyDepleteOrStrandOpenInterest",
      "testClaimableCanMoveWithinCapOrWithdrawDirectlyOnlyByItsOwner",
      "testRoundingResidualMovesOnlySpecifiedLockedFundsToInsurance",
      "testPenaltyCapsAtRemainingEquityAndRoundsResidualToInsurance",
      "testLiquidationRewardCanMoveWithinCapOrWithdrawDirectlyByOwner",
      "testInsuranceCoversOnlyExplicitDeficitWithAccountCapSpill",
      "testSafetyControllerCanOnlyStrictlyLowerCapsAboveLiveUsage",
      "testUnauthorizedWalletsCannotMutateMatchedAccountingOrOtherClaims",
      "testForcedDonationIsOnlySurplusAndLongSequenceStaysSolvent",
      "testDeployedRuntimeRejectsFallbackReceiveAndForbiddenAuthority",
    ],
  },
  {
    source: "test/OrderBook.t.sol",
    contract: "OrderBookTest",
    tests: [
      "testDomainHashAndSignedMakerPriceOpen",
      "testCancellationPartialFillAndNonceIsolation",
      "testCancelledTakerCannotFill",
      "testRepeatedPartialFillsAccumulateAndBoundRemainder",
      "testRepeatedPartialClosesAccumulateAndBoundRemainder",
      "testThreeNonDivisiblePartialClosesPersistAndConserve",
      "testPairedCloseUsesExitFeeAndStoredEntryOi",
      "testRejectsInvalidTakerSignature",
      "testTakerExpiryAndSmallerRemainingQuantity",
      "testRejectsWrongDomainsCanonicalityRolesAndReplay",
      "testClearingHouseAndTokenFailuresRollbackAtomically",
      "testCloseTokenFailureRollsBackOrderBookAndHouse",
      "testReduceOnlyCloseOnlyAndNoSingleFillReversal",
      "testFifoMultiLotPnlAndConservativeMarginRemainder",
      "testRejectsWrongHistoricalCounterpartyBeforeAccounting",
      "testRejectsOneSidedNinthLotCaps",
      "testEightLotCapNinthAtomicityAndBoundedHeadRemoval",
      "testLiveRingWrapPreservesFifoAcrossSlotBoundary",
      "testExactMarginsAndOneShortTakerFeeAtAllLeverages",
      "testMakerShortTakerLongFeeAndOddTwoXMargin",
      "testImmutableConstructorWiring",
      "testAggregateCloseIncludesZeroReleaseDustTail",
      "testDustNotionalRoundsUpAndInsufficientProceedsRollback",
    ],
  },
  {
    source: "test/FuturesOracle.t.sol",
    contract: "FuturesOracleTest",
    tests: [
      "testStartsCloseOnlyAndBaselineDoesNotOpen",
      "testSafeReadIsZeroBeforeACompleteWindow",
      "testGuardianCanOnlyLowerDeviationAndForceClose",
    ],
  },
];

const selectedSuites = suiteFilter
  ? suites.filter((suite) => suite.contract === suiteFilter)
  : suites;
if (selectedSuites.length === 0) {
  throw new Error(`Unknown TEST_SUITE: ${suiteFilter}`);
}

for (const [suiteIndex, suite] of selectedSuites.entries()) {
  // Preserve the historical deployment nonce used by the early V4 vanity
  // fixture, then isolate every later suite so Ganache cannot accumulate a
  // stale transaction/RPC state across the long-running integration matrix.
  if (suiteIndex > 3) await resetLocalChain();
  const artifact = output.contracts[suite.source][suite.contract];
  if (suite.contract === "RiskEngineTest") {
    const riskArtifact =
      output.contracts["src/futures/RiskEngine.sol"].RiskEngine;
    const expectedSelectors = new Set([
      "0x0dea803f", // MAX_FUNDING_RATE_BPS()
      "0x1119b6fe", // pairedPnl(uint256,uint256,uint256)
      "0x1883118b", // orderFee(uint256,uint8)
      "0x1f67f799", // liquidationPenalty(uint256,int256)
      "0x2057bfa0", // TAKER_FEE_BPS()
      "0x249d39e9", // BPS()
      "0x28828131", // MAX_FUNDING_ELAPSED()
      "0x2ac2959b", // maintenanceMargin(uint256)
      "0x5838bff7", // MAINTENANCE_MARGIN_BPS()
      "0x6a146024", // WAD()
      "0x752057f6", // isLiquidatable(int256,uint256)
      "0x7fffb9ab", // fundingPayment(uint256,int256,uint256)
      "0x98032fd4", // initialMargin(uint256)
      "0xa7bd8e13", // INITIAL_MARGIN_BPS()
      "0xaa9a0912", // mulDiv(uint256,uint256,uint256)
      "0xfc54ddfb", // LIQUIDATION_PENALTY_BPS()
    ]);
    const exposedFunctions = riskArtifact.abi.filter(
      (item) => item.type === "function",
    );
    const actualSelectors = new Set(
      exposedFunctions.map((item) => toFunctionSelector(item)),
    );
    check(
      actualSelectors.size === expectedSelectors.size &&
        [...expectedSelectors].every((selector) =>
          actualSelectors.has(selector),
        ),
      "RiskEngine ABI exposes an undocumented selector",
    );
    check(
      exposedFunctions.every((item) =>
        ["pure", "view"].includes(item.stateMutability),
      ),
      "RiskEngine ABI exposes a state-changing function",
    );
    check(
      !riskArtifact.abi.some((item) =>
        ["fallback", "receive"].includes(item.type),
      ),
      "RiskEngine ABI exposes fallback or receive",
    );
    console.log("PASS RiskEngine ABI permission surface");
  }
  if (suite.contract === "ClearingHouseTest") {
    const clearingArtifact =
      output.contracts["src/futures/ClearingHouse.sol"].ClearingHouse;
    const expectedMutability = new Map(
      [
        ["collateral()", "view"],
        ["riskEngine()", "view"],
        ["orderBook()", "view"],
        ["safetyController()", "view"],
        ["revenueRecipient()", "view"],
        ["totalLiabilityCap()", "view"],
        ["accountEquityCap()", "view"],
        ["matchedOpenInterestCap()", "view"],
        ["available(address)", "view"],
        ["lockedMargin(address)", "view"],
        ["claimable(address)", "view"],
        ["liquidationReward(address)", "view"],
        ["totalAvailable()", "view"],
        ["totalLockedMargin()", "view"],
        ["totalClaimable()", "view"],
        ["totalLiquidationRewards()", "view"],
        ["insuranceBalance()", "view"],
        ["matchedOpenInterest()", "view"],
        ["totalLiabilities()", "view"],
        ["deposit(uint256)", "nonpayable"],
        ["withdraw(uint256)", "nonpayable"],
        ["moveClaimableToAvailable(uint256)", "nonpayable"],
        ["moveLiquidationRewardToAvailable(uint256)", "nonpayable"],
        ["withdrawClaimable(uint256)", "nonpayable"],
        ["withdrawLiquidationReward(uint256)", "nonpayable"],
        ["fundInsurance(uint256)", "nonpayable"],
        [
          "openMatchedPair((address,address,address,uint256,uint256,uint256,uint256))",
          "nonpayable",
        ],
        [
          "closeMatchedPair((address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256))",
          "nonpayable",
        ],
        ["allocateRoundingResidual(address,uint256)", "nonpayable"],
        [
          "allocateLiquidationPenalty(address,address,uint256,uint256)",
          "nonpayable",
        ],
        ["coverMatchedLossDeficit(address,uint256)", "nonpayable"],
        [
          "liquidateAndReplace((address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
          "nonpayable",
        ],
        ["lowerTotalLiabilityCap(uint256)", "nonpayable"],
        ["lowerAccountEquityCap(uint256)", "nonpayable"],
        ["lowerMatchedOpenInterestCap(uint256)", "nonpayable"],
      ].map(([signature, mutability]) => [
        toFunctionSelector(signature),
        mutability,
      ]),
    );
    const exposedFunctions = clearingArtifact.abi.filter(
      (item) => item.type === "function",
    );
    const actualMutability = new Map(
      exposedFunctions.map((item) => [
        toFunctionSelector(item),
        item.stateMutability,
      ]),
    );
    check(
      actualMutability.size === expectedMutability.size &&
        [...expectedMutability].every(
          ([selector, mutability]) =>
            actualMutability.get(selector) === mutability,
        ),
      "ClearingHouse ABI selector or mutability mismatch",
    );
    check(
      !clearingArtifact.abi.some((item) =>
        ["fallback", "receive"].includes(item.type),
      ),
      "ClearingHouse ABI exposes fallback or receive",
    );
    const runtimeBytes =
      clearingArtifact.evm.deployedBytecode.object.length / 2;
    check(runtimeBytes <= 24_576, "ClearingHouse exceeds EIP-170 runtime size");
    console.log(
      `PASS ClearingHouse ABI permission surface and runtime ${runtimeBytes} bytes`,
    );
  }
  if (suite.contract === "OrderBookTest") {
    const orderBookArtifact =
      output.contracts["src/futures/OrderBook.sol"].OrderBook;
    const orderTuple =
      "(address,uint8,uint128,uint128,uint8,uint64,uint64,bool,uint8)";
    const liquidationTuple =
      "(address,address,uint8,uint128,uint128,uint8,uint64,uint64)";
    const expectedMutability = new Map(
      [
        ["activeLotCount(address)", "view"],
        ["activeLotId(address,uint8)", "view"],
        [`cancel(${orderTuple})`, "nonpayable"],
        [`cancelLiquidationOrder(${liquidationTuple})`, "nonpayable"],
        ["cancelled(bytes32)", "view"],
        ["checkpointFunding(int256)", "nonpayable"],
        ["clearingHouse()", "view"],
        ["cumulativeFundingIndex()", "view"],
        ["domainSeparator()", "view"],
        ["filled(bytes32)", "view"],
        ["fundingUpdatedAt()", "view"],
        [`liquidate(uint64,${liquidationTuple},bytes)`, "nonpayable"],
        [`liquidationOrderHash(${liquidationTuple})`, "view"],
        ["liquidationNonceCancelled(address,uint64)", "view"],
        ["liquidationNonceUsed(address,uint64)", "view"],
        ["lotFundingCheckpoint(uint64)", "view"],
        ["lots(uint64)", "view"],
        ["marketStateProvider()", "view"],
        [
          `matchOrders(${orderTuple},bytes,${orderTuple},bytes,uint128)`,
          "nonpayable",
        ],
        ["netQuantity(address)", "view"],
        ["nextLotId()", "view"],
        [`orderHash(${orderTuple})`, "view"],
        ["riskEngine()", "view"],
        ["settleFunding(uint64)", "nonpayable"],
      ].map(([signature, mutability]) => [
        toFunctionSelector(signature),
        mutability,
      ]),
    );
    const exposedFunctions = orderBookArtifact.abi.filter(
      (item) => item.type === "function",
    );
    const actualMutability = new Map(
      exposedFunctions.map((item) => [
        toFunctionSelector(item),
        item.stateMutability,
      ]),
    );
    check(
      actualMutability.size === expectedMutability.size &&
        [...expectedMutability].every(
          ([selector, mutability]) =>
            actualMutability.get(selector) === mutability,
        ),
      "OrderBook ABI selector or mutability mismatch",
    );
    check(
      !orderBookArtifact.abi.some((item) =>
        ["fallback", "receive"].includes(item.type),
      ),
      "OrderBook ABI exposes fallback or receive",
    );
    const runtimeBytes =
      orderBookArtifact.evm.deployedBytecode.object.length / 2;
    check(runtimeBytes <= 24_576, "OrderBook exceeds EIP-170 runtime size");
    console.log(
      `PASS OrderBook ABI permission surface and runtime ${runtimeBytes} bytes`,
    );
  }
  if (suite.contract === "FuturesOracleTest") {
    const oracleArtifact =
      output.contracts["src/futures/FuturesOracle.sol"].FuturesOracle;
    const expectedMutability = new Map(
      [
        ["bnbUsdFeed()", "view"],
        ["bnbxIsToken0()", "view"],
        ["bnbxToken()", "view"],
        ["clearForcedClose()", "nonpayable"],
        ["forceCloseOnly()", "nonpayable"],
        ["forcedClose()", "view"],
        ["guardian()", "view"],
        ["lowerMaxDeviationBps(uint16)", "nonpayable"],
        ["marketState()", "view"],
        ["maxDeviationBps()", "view"],
        ["pair()", "view"],
        ["safeRead()", "view"],
        ["update()", "nonpayable"],
        ["wbnbToken()", "view"],
      ].map(([signature, mutability]) => [
        toFunctionSelector(signature),
        mutability,
      ]),
    );
    const exposedFunctions = oracleArtifact.abi.filter(
      (item) => item.type === "function",
    );
    const actualMutability = new Map(
      exposedFunctions.map((item) => [
        toFunctionSelector(item),
        item.stateMutability,
      ]),
    );
    check(
      actualMutability.size === expectedMutability.size &&
        [...expectedMutability].every(
          ([selector, mutability]) =>
            actualMutability.get(selector) === mutability,
        ),
      "FuturesOracle ABI selector or mutability mismatch",
    );
    check(
      !oracleArtifact.abi.some((item) =>
        ["fallback", "receive"].includes(item.type),
      ),
      "FuturesOracle ABI exposes fallback or receive",
    );
    const runtimeBytes = oracleArtifact.evm.deployedBytecode.object.length / 2;
    check(runtimeBytes <= 24_576, "FuturesOracle exceeds EIP-170 runtime size");
    console.log(
      `PASS FuturesOracle ABI permission surface and runtime ${runtimeBytes} bytes`,
    );
  }
  const deploymentHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    gas: 100_000_000n,
  });
  const deploymentReceipt = await publicClient.waitForTransactionReceipt({
    hash: deploymentHash,
  });
  const expectedAddress = deploymentReceipt.contractAddress;
  if (!expectedAddress)
    throw new Error(`${suite.contract} deployment has no address`);

  if (
    suite.contract.endsWith("IntegrationTest") ||
    suite.contract.startsWith("DividendTaxProcessing") ||
    suite.contract === "BNBXZeroTaxTemplateTest" ||
    suite.contract === "BNBXHolderRewardsTemplateTest" ||
    suite.contract === "BNBXLPRewardsTemplateTest"
  ) {
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
      gas: 100_000_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      let setupDetail = "";
      try {
        await publicClient.simulateContract({
          account,
          address: expectedAddress,
          abi: artifact.abi,
          functionName: "setUp",
        });
      } catch (error) {
        setupDetail = ` (${error.shortMessage ?? error.message})`;
      }
      throw new Error(
        `${suite.contract}.setUp failed${setupDetail}: ${JSON.stringify(
          receipt,
          (_, value) => (typeof value === "bigint" ? value.toString() : value),
        )}`,
      );
    }
  }

  if (suite.contract === "OrderBookTest") {
    await runInitialOrderBookTest(expectedAddress, artifact);
    continue;
  }

  if (suite.contract === "DividendFactoryIntegrationTest") {
    const salts = [];
    for (let kind = 0; kind < 3; kind += 1) {
      let foundSalt;
      for (let start = 1; start < 500_000; start += 10_000) {
        const result = await publicClient.readContract({
          address: expectedAddress,
          abi: artifact.abi,
          functionName: "findTestSalt",
          args: [kind, BigInt(start), 10_000n],
        });
        if (result[0]) {
          foundSalt = result[1];
          break;
        }
      }
      if (!foundSalt)
        throw new Error(`No test vanity salt found for kind ${kind}`);
      salts.push(foundSalt);
    }
    const saltHash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "setTestSalts",
      args: salts,
      gas: 1_000_000n,
    });
    const saltReceipt = await publicClient.waitForTransactionReceipt({
      hash: saltHash,
    });
    if (saltReceipt.status !== "success") {
      throw new Error("Failed to configure dividend test salts");
    }
  }

  if (suite.contract === "BNBXLPRewardsTemplateTest") {
    let foundSalt;
    for (let start = 1; start < 1_000_000; start += 10_000) {
      const result = await publicClient.readContract({
        address: expectedAddress,
        abi: artifact.abi,
        functionName: "findTestSalt",
        args: [BigInt(start), 10_000n],
      });
      if (result[0]) {
        foundSalt = result[1];
        break;
      }
    }
    if (!foundSalt) throw new Error("No LP Rewards vanity salt found");
    const hash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "setTestSalt",
      args: [foundSalt],
      gas: 1_000_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  if (suite.contract === "BNBXV4SecurityTest") {
    let foundSalt;
    for (let start = 0; start < 500_000; start += 10_000) {
      const result = await publicClient.readContract({
        address: expectedAddress,
        abi: artifact.abi,
        functionName: "findSecuritySalt",
        args: [BigInt(start), 10_000n],
      });
      if (result[0]) {
        foundSalt = result[1];
        break;
      }
    }
    if (!foundSalt) throw new Error("No V4 security vanity salt found");
    const saltHash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "setSecuritySalt",
      args: [foundSalt],
      gas: 150_000n,
    });
    const saltReceipt = await publicClient.waitForTransactionReceipt({
      hash: saltHash,
    });
    if (saltReceipt.status !== "success") {
      throw new Error("Failed to configure V4 security vanity salt");
    }
  }

  if (
    suite.contract === "FactoryIntegrationTest" ||
    suite.contract === "TradingIntegrationTest"
  ) {
    const requests =
      suite.contract === "TradingIntegrationTest"
        ? [[0, "Round Trip", "RT"]]
        : [
            [0, "Zhang San", "ZS"],
            [0, "No First Buy", "NFB"],
            [0, "One", "ONE"],
            [0, "Eighteen", "EIGHTEEN"],
            [0, "Below", "LOW"],
            [0, "Above", "HIGH"],
            [0, "Oversized", "BIG"],
            [0, "Protected", "SAFE"],
            [0, "Pair Safe", "PAIRSAFE"],
            [0, "Refund Safe", "REFUND"],
            [1, "Reject Fee", "NOFEE"],
            [2, "Protected", "LOCKED"],
            [0, "Finished", "DONE"],
          ];

    const tokenArtifact = output.contracts["src/BNBXTokenV3.sol"].BNBXTokenV3;
    const factoryAddresses = new Map();

    for (const [factoryKind, name, symbol] of requests) {
      let factoryAddress = factoryAddresses.get(factoryKind);
      if (!factoryAddress) {
        factoryAddress = await publicClient.readContract({
          address: expectedAddress,
          abi: artifact.abi,
          functionName: "testFactoryAddress",
          args: [factoryKind],
        });
        factoryAddresses.set(factoryKind, factoryAddress);
      }

      const initCode = encodeDeployData({
        abi: tokenArtifact.abi,
        bytecode: `0x${tokenArtifact.evm.bytecode.object}`,
        args: [name, symbol, factoryAddress],
      });
      const bytecodeHash = keccak256(initCode);
      let foundSalt;
      for (let candidate = 1n; candidate < 1_000_000n; candidate += 1n) {
        const salt = padHex(toHex(candidate), { size: 32 });
        const predicted = getContractAddress({
          bytecodeHash,
          from: factoryAddress,
          opcode: "CREATE2",
          salt,
        });
        if (predicted.toLowerCase().endsWith("1111")) {
          foundSalt = salt;
          break;
        }
      }
      if (!foundSalt) {
        throw new Error(`No test vanity salt found for ${name}/${symbol}`);
      }
      const validation = await publicClient.readContract({
        address: expectedAddress,
        abi: artifact.abi,
        functionName: "findTestSalt",
        args: [factoryKind, name, symbol, BigInt(foundSalt), 1n],
      });
      if (
        !validation[0] ||
        validation[1].toLowerCase() !== foundSalt.toLowerCase()
      ) {
        throw new Error(`Invalid offline vanity salt for ${name}/${symbol}`);
      }
      const saltHash = await walletClient.writeContract({
        address: expectedAddress,
        abi: artifact.abi,
        functionName: "setTestSalt",
        args: [name, symbol, foundSalt],
        gas: 1_000_000n,
      });
      const saltReceipt = await publicClient.waitForTransactionReceipt({
        hash: saltHash,
      });
      if (saltReceipt.status !== "success") {
        throw new Error(`Failed to configure test salt for ${name}/${symbol}`);
      }
    }
  }

  if (suite.contract === "BNBXZeroTaxTemplateTest") {
    const factoryAddress = await publicClient.readContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "testFactoryAddress",
    });
    const tokenArtifact =
      output.contracts["src/BNBXZeroTaxToken.sol"].BNBXZeroTaxToken;
    const initCode = encodeDeployData({
      abi: tokenArtifact.abi,
      bytecode: `0x${tokenArtifact.evm.bytecode.object}`,
      args: ["Clean Factory Token", "CLEAN", factoryAddress],
    });
    const bytecodeHash = keccak256(initCode);
    let foundSalt;
    for (let candidate = 1n; candidate < 1_000_000n; candidate += 1n) {
      const salt = padHex(toHex(candidate), { size: 32 });
      const predicted = getContractAddress({
        bytecodeHash,
        from: factoryAddress,
        opcode: "CREATE2",
        salt,
      });
      if (predicted.toLowerCase().endsWith("1111")) {
        foundSalt = salt;
        break;
      }
    }
    if (!foundSalt) throw new Error("No zero-tax test vanity salt found");
    const saltHash = await walletClient.writeContract({
      address: expectedAddress,
      abi: artifact.abi,
      functionName: "setTestSalt",
      args: [foundSalt],
      gas: 150_000n,
    });
    const saltReceipt = await publicClient.waitForTransactionReceipt({
      hash: saltHash,
    });
    if (saltReceipt.status !== "success") {
      throw new Error("Failed to configure zero-tax test vanity salt");
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
      gas: 100_000_000n,
      value:
        suite.contract === "FactoryIntegrationTest"
          ? parseEther("0")
          : undefined,
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
        }
      } catch {
        // Trace support varies by local EVM.
      }
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
        `${suite.contract}.${testName} failed (gasUsed=${gasUsed})${detail}${traceDetail}`,
      );
    }
    console.log(`PASS ${suite.contract}.${testName}`);
  }
  if (suite.contract === "FuturesOracleTest") {
    await runFuturesOracleProgressionTest();
    await runFuturesOracleMathAndWrapTests();
    await runFuturesOracleFreshnessAndRecoveryTests();
    await runFuturesOracleObservationMutationTests();
    await runFuturesOracleDeviationTests();
    await runFuturesOracleDependencyBoundsTests();
    await runFuturesOracleDependencySemanticTests();
    await runFuturesOracleConstructorTests();
    await runFuturesOracleOrderBookIntegrationTest();
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
const launchFactoryArtifact =
  output.contracts["src/BNBXFactory.sol"].BNBXFactory;
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
  const targetWei = parseEther(String(target));
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
    args: [
      {
        name: tokenName,
        symbol: tokenSymbol,
        graduationTargetBNB: target,
        metadataURI: "",
        vanitySalt,
      },
      {
        minTokensOut: eightHundredMillion,
        deadline: block.timestamp + 1_200n,
        refundRecipient: account,
      },
    ],
    value: parseEther("0.001") + grossBuy,
    gas: 100_000_000n,
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
        args: [
          {
            name: tokenName,
            symbol: tokenSymbol,
            graduationTargetBNB: target,
            metadataURI: "",
            vanitySalt,
          },
          {
            minTokensOut: eightHundredMillion,
            deadline: block.timestamp + 1_200n,
            refundRecipient: account,
          },
        ],
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
  const [state, principal, userTokens, pairTokens, burnedLP] =
    await Promise.all([
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
  check(
    userTokens === eightHundredMillion,
    `Target ${target}: curve allocation mismatch`,
  );
  check(
    pairTokens === twoHundredMillion,
    `Target ${target}: LP allocation mismatch`,
  );
  check(burnedLP > 0n, `Target ${target}: LP was not burned`);
  console.log(`PASS GraduationTarget.${target}BNB`);
}

await provider.disconnect();
