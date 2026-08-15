import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  hashTypedData,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const projectRoot = resolve(import.meta.dirname, "..");
const loadSource = (path) => readFileSync(resolve(projectRoot, path), "utf8");
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
      // Try the next candidate.
    }
  }
  return { error: `Import not found: ${importPath}` };
};

const input = {
  language: "Solidity",
  sources: {
    "test/FundingLiquidation.t.sol": {
      content: loadSource("test/FundingLiquidation.t.sol"),
    },
    "src/futures/FuturesOracle.sol": {
      content: loadSource("src/futures/FuturesOracle.sol"),
    },
    "src/futures/SafetyController.sol": {
      content: loadSource("src/futures/SafetyController.sol"),
    },
  },
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
const compileErrors = (output.errors ?? []).filter(
  ({ severity }) => severity === "error",
);
if (compileErrors.length > 0) {
  throw new Error(
    compileErrors.map(({ formattedMessage }) => formattedMessage).join("\n"),
  );
}

const chain = defineChain({
  id: 31_337,
  name: "BNBX Task 6",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const provider = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 6, defaultBalance: 1_000 },
  miner: { blockGasLimit: 120_000_000 },
  chain: {
    chainId: chain.id,
    allowUnlimitedContractSize: true,
    allowUnlimitedInitCodeSize: true,
  },
});
const accounts = await provider.request({ method: "eth_accounts", params: [] });
const initialAccounts = provider.getInitialAccounts();
const signers = accounts.map((address) =>
  privateKeyToAccount(initialAccounts[address.toLowerCase()].secretKey),
);
const publicClient = createPublicClient({ chain, transport: custom(provider) });
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain, transport: custom(provider) }),
);

const fixtureArtifact =
  output.contracts["test/FundingLiquidation.t.sol"].FundingLiquidationTest;
const collateralArtifact =
  output.contracts["test/futures/FuturesCollateralMock.sol"]
    .FuturesCollateralMock;
const oracleArtifact =
  output.contracts["test/FundingLiquidation.t.sol"].Task6OracleMock;
const clearingArtifact =
  output.contracts["src/futures/ClearingHouse.sol"].ClearingHouse;
const orderBookArtifact =
  output.contracts["src/futures/OrderBook.sol"].OrderBook;
const riskArtifact = output.contracts["src/futures/RiskEngine.sol"].RiskEngine;
const futuresOracleArtifact =
  output.contracts["src/futures/FuturesOracle.sol"].FuturesOracle;
const safetyControllerArtifact =
  output.contracts["src/futures/SafetyController.sol"].SafetyController;

const tx = async (
  wallet,
  address,
  abi,
  functionName,
  args = [],
  gas = 10_000_000n,
) => {
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args,
    gas,
  });
  return publicClient.waitForTransactionReceipt({ hash });
};
const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const expectRevert = async (operation, message) => {
  try {
    const receipt = await operation();
    check(receipt.status === "reverted", message);
  } catch (error) {
    if (
      /revert|reverted|execution/i.test(
        `${error.shortMessage ?? ""} ${error.message ?? ""} ${error.details ?? ""}`,
      )
    )
      return;
    throw error;
  }
};

const deploymentHash = await wallets[0].deployContract({
  abi: fixtureArtifact.abi,
  bytecode: `0x${fixtureArtifact.evm.bytecode.object}`,
  gas: 100_000_000n,
});
const deploymentReceipt = await publicClient.waitForTransactionReceipt({
  hash: deploymentHash,
});
check(
  deploymentReceipt.status === "success",
  "Task 6 fixture deployment failed",
);
const fixture = deploymentReceipt.contractAddress;
const setupReceipt = await tx(
  wallets[0],
  fixture,
  fixtureArtifact.abi,
  "setUp",
  [],
  100_000_000n,
);
check(setupReceipt.status === "success", "Task 6 fixture setup failed");

const [collateral, clearingHouse, orderBook, oracle, riskEngine] =
  await Promise.all(
    ["collateral", "clearingHouse", "orderBook", "oracle", "riskEngine"].map(
      (functionName) => read(fixture, fixtureArtifact.abi, functionName),
    ),
  );
const [
  marketStateOnlyProvider,
  shortReturnOracle,
  longReturnOracle,
  invalidEnumOracle,
] = await Promise.all(
  [
    "marketStateOnlyProvider",
    "shortReturnOracle",
    "longReturnOracle",
    "invalidEnumOracle",
  ].map((functionName) => read(fixture, fixtureArtifact.abi, functionName)),
);

// Mutation caught: accepting an immutable provider that cannot return one
// canonical five-word safe read leaves liquidation permanently unusable.
for (const [providerAddress, label] of [
  [accounts[5], "no-code provider"],
  [marketStateOnlyProvider, "market-state-only provider"],
  [shortReturnOracle, "short-return provider"],
  [longReturnOracle, "long-return provider"],
  [invalidEnumOracle, "invalid-enum provider"],
]) {
  const { result: rejected } = await publicClient.simulateContract({
    account: accounts[0],
    address: fixture,
    abi: fixtureArtifact.abi,
    functionName: "providerConstructionRejected",
    args: [providerAddress],
    gas: 100_000_000n,
  });
  check(rejected, `OrderBook accepted ${label}`);
}
const { result: validProviderRejected } = await publicClient.simulateContract({
  account: accounts[0],
  address: fixture,
  abi: fixtureArtifact.abi,
  functionName: "providerConstructionRejected",
  args: [oracle],
  gas: 100_000_000n,
});
check(!validProviderRejected, "OrderBook rejected canonical Oracle interface");
console.log(
  "PASS FundingLiquidationTest.constructorRequiresCanonicalOracleInterface",
);
const deposit = 1_000n * 10n ** 18n;
for (let index = 1; index <= 4; index += 1) {
  let receipt = await tx(
    wallets[0],
    collateral,
    collateralArtifact.abi,
    "mint",
    [accounts[index], 2n * deposit],
  );
  check(receipt.status === "success", `mint ${index} failed`);
  receipt = await tx(
    wallets[index],
    collateral,
    collateralArtifact.abi,
    "approve",
    [clearingHouse, 2n ** 256n - 1n],
  );
  check(receipt.status === "success", `approve ${index} failed`);
  receipt = await tx(
    wallets[index],
    clearingHouse,
    clearingArtifact.abi,
    "deposit",
    [deposit],
  );
  check(receipt.status === "success", `deposit ${index} failed`);
}

const task6FundingAbi = parseAbi([
  "function checkpointFunding(int256 rateBps)",
  "function settleFunding(uint64 lotId)",
  "function cumulativeFundingIndex() view returns (int256)",
  "function fundingUpdatedAt() view returns (uint64)",
  "function lotFundingCheckpoint(uint64 lotId) view returns (int256 index,uint64 updatedAt)",
]);

const orderTypes = {
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
    { name: "reduceOnly", type: "bool" },
    { name: "role", type: "uint8" },
  ],
};
const domain = {
  name: "BNBX Futures",
  version: "1",
  chainId: chain.id,
  verifyingContract: orderBook,
};
const signOrder = (order, signerIndex, signedDomain = domain) =>
  signers[signerIndex].signTypedData({
    domain: signedDomain,
    types: orderTypes,
    primaryType: "Order",
    message: order,
  });

let normalNonce = 1n;
let lastOpenReceipt;
const openLot = async ({
  targetSide = 0,
  quantity = 1n * 10n ** 18n,
  price = 100n * 10n ** 18n,
  targetLeverage = 3,
  survivorLeverage = 3,
} = {}) => {
  const survivorSide = targetSide === 0 ? 1 : 0;
  const maker = {
    trader: accounts[2],
    side: survivorSide,
    quantity,
    limitPrice: price,
    leverage: survivorLeverage,
    nonce: normalNonce++,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 0,
  };
  const taker = {
    trader: accounts[1],
    side: targetSide,
    quantity,
    limitPrice: price,
    leverage: targetLeverage,
    nonce: normalNonce++,
    deadline: 18_446_744_073_709_551_615n,
    reduceOnly: false,
    role: 1,
  };
  const receipt = await tx(
    wallets[0],
    orderBook,
    orderBookArtifact.abi,
    "matchOrders",
    [
      maker,
      await signOrder(maker, 2),
      taker,
      await signOrder(taker, 1),
      quantity,
    ],
  );
  check(receipt.status === "success", "normal paired-lot open failed");
  lastOpenReceipt = receipt;
  return read(orderBook, orderBookArtifact.abi, "activeLotId", [
    accounts[1],
    0,
  ]);
};

let snapshot = await provider.request({ method: "evm_snapshot", params: [] });
const reset = async () => {
  await provider.request({ method: "evm_revert", params: [snapshot] });
  snapshot = await provider.request({ method: "evm_snapshot", params: [] });
  normalNonce = 1n;
};
const mineAfter = async (seconds) => {
  await provider.request({ method: "evm_increaseTime", params: [seconds] });
  await provider.request({ method: "evm_mine", params: [] });
};

// Mutation caught: accepting a caller-supplied nonzero rate or using it to move equity.
const initialFundingTime = await read(
  orderBook,
  task6FundingAbi,
  "fundingUpdatedAt",
);
const fundingBucketsBefore = await Promise.all([
  read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
  read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
  read(clearingHouse, clearingArtifact.abi, "totalClaimable"),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
]);
await mineAfter(17 * 60 * 60 + 13);
let receipt = await tx(
  wallets[0],
  orderBook,
  task6FundingAbi,
  "checkpointFunding",
  [0n],
);
check(receipt.status === "success", "zero funding checkpoint reverted");
const checkpointBlock = await publicClient.getBlock({
  blockHash: receipt.blockHash,
});
const updatedFundingTime = await read(
  orderBook,
  task6FundingAbi,
  "fundingUpdatedAt",
);
check(
  updatedFundingTime === checkpointBlock.timestamp &&
    updatedFundingTime > initialFundingTime &&
    (await read(orderBook, task6FundingAbi, "cumulativeFundingIndex")) === 0n,
  "zero funding did not catch up the full elapsed interval at a zero index",
);
check(
  JSON.stringify(
    (
      await Promise.all([
        read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
        read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
        read(clearingHouse, clearingArtifact.abi, "totalClaimable"),
        read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
      ])
    ).map(String),
  ) === JSON.stringify(fundingBucketsBefore.map(String)),
  "zero funding moved custody buckets",
);
for (const rejectedRate of [1n, 30n, 31n, -1n, -30n, -31n]) {
  await expectRevert(
    () =>
      tx(wallets[0], orderBook, task6FundingAbi, "checkpointFunding", [
        rejectedRate,
      ]),
    `nonzero funding rate ${rejectedRate} was accepted`,
  );
}
check(
  (await read(orderBook, task6FundingAbi, "fundingUpdatedAt")) ===
    updatedFundingTime,
  "rejected nonzero rate advanced the funding checkpoint",
);
console.log(
  "PASS FundingLiquidationTest.zeroRateFullElapsedAndNonzeroRejection",
);

await reset();
// Mutation caught: a new/stale lot checkpoint moving backwards or a stale lot requiring a loop.
await mineAfter(123);
const fundingLotId = await openLot();
const firstLotCheckpoint = await read(
  orderBook,
  task6FundingAbi,
  "lotFundingCheckpoint",
  [fundingLotId],
);
const openBlock = await publicClient.getBlock({
  blockHash: lastOpenReceipt.blockHash,
});
check(
  firstLotCheckpoint[1] === openBlock.timestamp,
  "new lot inherited a stale funding interval retroactively",
);
await mineAfter(31 * 60 * 60 + 7);
receipt = await tx(wallets[0], orderBook, task6FundingAbi, "settleFunding", [
  fundingLotId,
]);
check(
  receipt.status === "success" && receipt.gasUsed < 300_000n,
  "stale lot settlement was not bounded",
);
const secondLotCheckpoint = await read(
  orderBook,
  task6FundingAbi,
  "lotFundingCheckpoint",
  [fundingLotId],
);
check(
  secondLotCheckpoint[0] === 0n &&
    secondLotCheckpoint[1] > firstLotCheckpoint[1] &&
    secondLotCheckpoint[1] ===
      (await read(orderBook, task6FundingAbi, "fundingUpdatedAt")),
  "per-lot funding checkpoint was not monotonic/current",
);
receipt = await tx(wallets[4], orderBook, task6FundingAbi, "settleFunding", [
  fundingLotId,
]);
check(
  receipt.status === "success",
  "already-current funding settlement froze the lot",
);
const thirdLotCheckpoint = await read(
  orderBook,
  task6FundingAbi,
  "lotFundingCheckpoint",
  [fundingLotId],
);
check(
  thirdLotCheckpoint[1] >= secondLotCheckpoint[1],
  "interleaved checkpoint regressed",
);
console.log("PASS FundingLiquidationTest.monotonicBoundedPerLotCheckpoint");

const liquidationTuple =
  "(address maker,address target,uint8 side,uint128 quantity,uint128 limitPrice,uint8 leverage,uint64 nonce,uint64 deadline)";
const liquidationAbi = parseAbi([
  `function liquidationOrderHash(${liquidationTuple} replacement) view returns (bytes32)`,
  `function cancelLiquidationOrder(${liquidationTuple} replacement)`,
  `function liquidate(uint64 lotId,${liquidationTuple} replacement,bytes signature)`,
  "function liquidationNonceUsed(address maker,uint64 nonce) view returns (bool)",
  "function liquidationNonceCancelled(address maker,uint64 nonce) view returns (bool)",
]);
const liquidationTypes = {
  LiquidationOrder: [
    { name: "maker", type: "address" },
    { name: "target", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
};
const replacementOrder = ({
  target = accounts[1],
  side = 0,
  quantity = 1n * 10n ** 18n,
  limitPrice = 75n * 10n ** 18n,
  leverage = 2,
  nonce = 1n,
  deadline = 18_446_744_073_709_551_615n,
} = {}) => ({
  maker: accounts[3],
  target,
  side,
  quantity,
  limitPrice,
  leverage,
  nonce,
  deadline,
});
const signReplacement = (replacement, signerIndex = 3, signedDomain = domain) =>
  signers[signerIndex].signTypedData({
    domain: signedDomain,
    types: liquidationTypes,
    primaryType: "LiquidationOrder",
    message: replacement,
  });
const setOracle = async (state, mark, updatedAt = undefined) => {
  const latest = await publicClient.getBlock();
  const receipt = await tx(wallets[0], oracle, oracleArtifact.abi, "setRead", [
    state,
    mark,
    updatedAt ?? latest.timestamp,
  ]);
  check(receipt.status === "success", "oracle fixture update failed");
};
const liquidate = async (lotId, replacement, signature) =>
  tx(wallets[0], orderBook, liquidationAbi, "liquidate", [
    lotId,
    replacement,
    signature,
  ]);
const fundInsurance = (amount) =>
  tx(wallets[4], clearingHouse, clearingArtifact.abi, "fundInsurance", [
    amount,
  ]);
const e18 = 10n ** 18n;

await reset();
// Mutations caught: settlement from aggregate available, fee/penalty before PnL,
// wrong 80/20 split, insurance-as-revenue, or cap spill to anyone but its owner.
let liquidationLotId = await openLot();
await setOracle(1, 75n * e18);
let replacement = replacementOrder();
let replacementSignature = await signReplacement(replacement);
receipt = await liquidate(liquidationLotId, replacement, replacementSignature);
check(
  receipt.status === "success",
  "valid positive-equity liquidation reverted",
);
const newLotId = await read(orderBook, orderBookArtifact.abi, "activeLotId", [
  accounts[2],
  0,
]);
const newLot = await read(orderBook, orderBookArtifact.abi, "lots", [newLotId]);
const positiveState = await Promise.all([
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "claimable", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "liquidationReward", [accounts[0]]),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
  read(collateral, collateralArtifact.abi, "balanceOf", [
    "0x000000000000000000000000000000000000bEEF",
  ]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[2]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[3]]),
]);
const positiveExpected = [
  972_500_000_000_000_000_000n,
  974_995_000_000_000_000_000n,
  962_500_000_000_000_000_000n,
  0n,
  25_005_000_000_000_000_000n,
  37_500_000_000_000_000_000n,
  25_000_000_000_000_000_000n,
  600_000_000_000_000_000n,
  150_000_000_000_000_000n,
  75_000_000_000_000_000_000n,
  1_750_000_000_000_000_000n,
  0n,
  -1n * e18,
  1n * e18,
];
check(
  positiveState.every((value, index) => value === positiveExpected[index]),
  `positive liquidation waterfall mismatch: ${positiveState.join(",")}`,
);
check(
  newLotId !== liquidationLotId &&
    newLot[1].toLowerCase() === accounts[3].toLowerCase() &&
    newLot[2].toLowerCase() === accounts[2].toLowerCase() &&
    newLot[3] === e18 &&
    newLot[4] === 75n * e18 &&
    (await read(orderBook, liquidationAbi, "liquidationNonceUsed", [
      accounts[3],
      1n,
    ])),
  "liquidation did not replace the complete old lot at the mark",
);
console.log(
  "PASS FundingLiquidationTest.positivePnlFeePenaltySplitAndOwnerCapSpill",
);

await reset();
// Mutations caught: charging a waived fee from insurance/unrelated available or
// taking a penalty before the target's remaining positive liquidation proceeds.
liquidationLotId = await openLot();
await setOracle(1, 66_700_000_000_000_000_000n);
replacement = replacementOrder({
  limitPrice: 66_700_000_000_000_000_000n,
  leverage: 3,
  nonce: 2n,
});
receipt = await liquidate(
  liquidationLotId,
  replacement,
  await signReplacement(replacement),
);
check(
  receipt.status === "success",
  "small-positive-proceeds liquidation reverted",
);
check(
  (await read(collateral, collateralArtifact.abi, "balanceOf", [
    "0x000000000000000000000000000000000000bEEF",
  ])) === 1_040_000_000_000_000_000n &&
    (await read(clearingHouse, clearingArtifact.abi, "insuranceBalance")) ===
      0n &&
    (await read(clearingHouse, clearingArtifact.abi, "liquidationReward", [
      accounts[0],
    ])) === 0n &&
    (await read(clearingHouse, clearingArtifact.abi, "available", [
      accounts[1],
    ])) === 965_660_000_000_000_000_000n,
  "unpaid close fee/penalty was not waived from only positive proceeds",
);
console.log(
  "PASS FundingLiquidationTest.partialFeeWaiverNeverUsesInsuranceOrAvailable",
);

await reset();
// Mutation caught: rounding the liquidator's 80% share up instead of down.
// One atomic-unit penalty must yield reward floor(1 * 4 / 5) = 0 and insurance 1.
liquidationLotId = await openLot({ price: 7n });
await setOracle(1, 6n);
replacement = replacementOrder({ limitPrice: 6n, leverage: 3, nonce: 21n });
receipt = await liquidate(
  liquidationLotId,
  replacement,
  await signReplacement(replacement),
);
check(receipt.status === "success", "one-unit penalty liquidation reverted");
const roundingState = await Promise.all([
  read(clearingHouse, clearingArtifact.abi, "liquidationReward", [accounts[0]]),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "claimable", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
  read(collateral, collateralArtifact.abi, "balanceOf", [
    "0x000000000000000000000000000000000000bEEF",
  ]),
]);
const roundingExpected = [
  0n,
  1n,
  deposit - 4n,
  0n,
  deposit - 3n,
  3n,
  1n,
  deposit - 3n,
  3n,
  6n,
  2n,
];
check(
  roundingState.every((value, index) => value === roundingExpected[index]),
  `one-unit reward rounding/accounting mismatch: ${roundingState.join(",")}`,
);
console.log("PASS FundingLiquidationTest.liquidatorRewardRoundsDown");

await reset();
// Mutations caught: insurance covering a non-deficit, underfunded insurance
// partially mutating state, or a reverted attempt consuming nonce/checkpoint/lot.
receipt = await fundInsurance(6_659_999_999_999_999_999n);
check(receipt.status === "success", "insurance fixture funding failed");
liquidationLotId = await openLot();
await setOracle(1, 60n * e18);
replacement = replacementOrder({
  limitPrice: 60n * e18,
  leverage: 3,
  nonce: 3n,
});
replacementSignature = await signReplacement(replacement);
const rollbackBefore = await Promise.all([
  read(orderBook, task6FundingAbi, "fundingUpdatedAt"),
  read(orderBook, orderBookArtifact.abi, "lots", [liquidationLotId]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
  read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
  read(collateral, collateralArtifact.abi, "balanceOf", [clearingHouse]),
]);
await mineAfter(31);
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "underfunded insurance accepted a real deficit",
);
const rollbackAfter = await Promise.all([
  read(orderBook, task6FundingAbi, "fundingUpdatedAt"),
  read(orderBook, orderBookArtifact.abi, "lots", [liquidationLotId]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
  read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
  read(collateral, collateralArtifact.abi, "balanceOf", [clearingHouse]),
]);
check(
  JSON.stringify(rollbackAfter, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ) ===
    JSON.stringify(rollbackBefore, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ) &&
    !(await read(orderBook, liquidationAbi, "liquidationNonceUsed", [
      accounts[3],
      3n,
    ])),
  "unsupported deficit did not roll back every side effect",
);
receipt = await fundInsurance(1n);
check(receipt.status === "success", "one-unit insurance top-up failed");
receipt = await liquidate(liquidationLotId, replacement, replacementSignature);
check(
  receipt.status === "success",
  "same authorization was not retryable after rollback",
);
check(
  (await read(clearingHouse, clearingArtifact.abi, "insuranceBalance")) ===
    0n &&
    (await read(clearingHouse, clearingArtifact.abi, "claimable", [
      accounts[2],
    ])) ===
      40n * e18 &&
    (await read(clearingHouse, clearingArtifact.abi, "available", [
      accounts[2],
    ])) === 979_996_000_000_000_000_000n &&
    (await read(clearingHouse, clearingArtifact.abi, "lockedMargin", [
      accounts[2],
    ])) === 20_004_000_000_000_000_000n,
  "real deficit support or survivor exact-lot ownership mismatch",
);
console.log("PASS FundingLiquidationTest.realDeficitInsuranceAndAtomicRetry");

await reset();
// Mutation caught: changing strict `<` eligibility to `<=` at maintenance plus fee.
// At entry 6 / mark 5 the 3-unit margin loses 1, so equity 2 is exactly
// ceil(20% * 5) + ceil(1% * 5) = 2. This reaches the strict comparator.
liquidationLotId = await openLot({ price: 6n });
await setOracle(1, 5n);
replacement = replacementOrder({ limitPrice: 5n, leverage: 3, nonce: 4n });
replacementSignature = await signReplacement(replacement);
const equalityState = () =>
  Promise.all([
    read(orderBook, task6FundingAbi, "fundingUpdatedAt"),
    read(orderBook, task6FundingAbi, "cumulativeFundingIndex"),
    read(orderBook, orderBookArtifact.abi, "nextLotId"),
    read(orderBook, orderBookArtifact.abi, "lots", [liquidationLotId]),
    read(orderBook, task6FundingAbi, "lotFundingCheckpoint", [
      liquidationLotId,
    ]),
    ...[accounts[1], accounts[2], accounts[3]].flatMap((account) => [
      read(orderBook, orderBookArtifact.abi, "netQuantity", [account]),
      read(orderBook, orderBookArtifact.abi, "activeLotCount", [account]),
      read(clearingHouse, clearingArtifact.abi, "available", [account]),
      read(clearingHouse, clearingArtifact.abi, "lockedMargin", [account]),
      read(clearingHouse, clearingArtifact.abi, "claimable", [account]),
      read(clearingHouse, clearingArtifact.abi, "liquidationReward", [account]),
    ]),
    read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
    read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
    read(clearingHouse, clearingArtifact.abi, "totalClaimable"),
    read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
    read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
    read(clearingHouse, clearingArtifact.abi, "totalLiabilities"),
    read(collateral, collateralArtifact.abi, "balanceOf", [clearingHouse]),
    read(collateral, collateralArtifact.abi, "balanceOf", [
      "0x000000000000000000000000000000000000bEEF",
    ]),
    read(orderBook, liquidationAbi, "liquidationNonceUsed", [accounts[3], 4n]),
  ]);
const equalityBefore = await equalityState();
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "maintenance-plus-fee equality was liquidated",
);
const equalityAfter = await equalityState();
check(
  JSON.stringify(equalityAfter, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ) ===
    JSON.stringify(equalityBefore, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  "equality rejection did not roll back the complete lot/custody/nonce state",
);
await setOracle(1, 4n);
receipt = await liquidate(liquidationLotId, replacement, replacementSignature);
check(
  receipt.status === "success",
  "one-unit-below equality was not liquidatable",
);
console.log("PASS FundingLiquidationTest.strictLiquidationEqualityBoundary");

await reset();
// Mutations caught: accepting CloseOnly/stale/zero oracle data, partial lots,
// expired/non-crossing/wrong-domain/wrong-signer authorization, or cancellation bypass.
liquidationLotId = await openLot();
replacement = replacementOrder({ nonce: 5n });
replacementSignature = await signReplacement(replacement);
await setOracle(0, 75n * e18);
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "CloseOnly oracle read liquidated a position",
);
let latestBlock = await publicClient.getBlock();
await setOracle(1, 75n * e18, latestBlock.timestamp - 301n);
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "stale Open oracle read liquidated a position",
);
await setOracle(1, 0n);
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "zero Oracle mark liquidated a position",
);
await setOracle(1, 75n * e18);
const partialReplacement = replacementOrder({ quantity: e18 / 2n, nonce: 6n });
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      partialReplacement,
      await signReplacement(partialReplacement),
    ),
  "partial-lot liquidation was accepted",
);
const nonCrossing = replacementOrder({ limitPrice: 75n * e18 - 1n, nonce: 7n });
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      nonCrossing,
      await signReplacement(nonCrossing),
    ),
  "replacement limit did not accept the oracle mark",
);
latestBlock = await publicClient.getBlock();
const expired = replacementOrder({
  nonce: 8n,
  deadline: latestBlock.timestamp - 1n,
});
await expectRevert(
  async () =>
    liquidate(liquidationLotId, expired, await signReplacement(expired)),
  "expired liquidation authorization was accepted",
);
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signReplacement(replacement, 4),
    ),
  "wrong replacement signer was accepted",
);
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signReplacement(replacement, 3, {
        ...domain,
        chainId: chain.id + 1,
      }),
    ),
  "wrong-chain liquidation authorization was accepted",
);
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signReplacement(replacement, 3, {
        ...domain,
        verifyingContract: clearingHouse,
      }),
    ),
  "wrong-contract liquidation authorization was accepted",
);
const ordinaryMakerAuthorization = {
  trader: replacement.maker,
  side: replacement.side,
  quantity: replacement.quantity,
  limitPrice: replacement.limitPrice,
  leverage: replacement.leverage,
  nonce: replacement.nonce,
  deadline: replacement.deadline,
  reduceOnly: false,
  role: 0,
};
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signOrder(ordinaryMakerAuthorization, 3),
    ),
  "ordinary Maker-role signature was reused for liquidation",
);
await expectRevert(
  () =>
    tx(wallets[4], orderBook, liquidationAbi, "cancelLiquidationOrder", [
      replacement,
    ]),
  "non-maker cancelled a liquidation authorization",
);
receipt = await tx(
  wallets[3],
  orderBook,
  liquidationAbi,
  "cancelLiquidationOrder",
  [replacement],
);
check(
  receipt.status === "success",
  "replacement maker could not cancel its nonce",
);
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "cancelled liquidation authorization was accepted",
);
check(
  await read(orderBook, liquidationAbi, "liquidationNonceCancelled", [
    accounts[3],
    5n,
  ]),
  "cancelled replacement nonce was not recorded",
);
console.log(
  "PASS FundingLiquidationTest.oracleAndLiquidationAuthenticationFailClosed",
);

await reset();
// Mutation caught: rejecting an Oracle read at the inclusive five-minute
// freshness boundary. The fixture sets the age and liquidates in one block.
liquidationLotId = await openLot();
replacement = replacementOrder({ nonce: 25n });
receipt = await tx(
  wallets[0],
  fixture,
  fixtureArtifact.abi,
  "liquidateAtOracleAge",
  [liquidationLotId, replacement, await signReplacement(replacement), 300],
  20_000_000n,
);
check(
  receipt.status === "success" &&
    (await read(orderBook, orderBookArtifact.abi, "activeLotCount", [
      accounts[1],
    ])) === 0,
  "exactly 300-second-old Oracle read was rejected",
);
console.log("PASS FundingLiquidationTest.oracleFreshnessExactBoundary");

await reset();
// Mutation caught: using any replacement balance other than its fresh available margin.
liquidationLotId = await openLot();
receipt = await tx(
  wallets[3],
  clearingHouse,
  clearingArtifact.abi,
  "withdraw",
  [950n * e18],
);
check(receipt.status === "success", "replacement withdrawal fixture failed");
await setOracle(1, 75n * e18);
replacement = replacementOrder({ leverage: 1, nonce: 9n });
const makerAvailableBefore = await read(
  clearingHouse,
  clearingArtifact.abi,
  "available",
  [accounts[3]],
);
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signReplacement(replacement),
    ),
  "replacement maker margin was subsidized",
);
check(
  (await read(clearingHouse, clearingArtifact.abi, "available", [
    accounts[3],
  ])) === makerAvailableBefore &&
    (await read(orderBook, orderBookArtifact.abi, "netQuantity", [
      accounts[1],
    ])) === e18,
  "replacement margin failure partially mutated custody or exposure",
);
console.log(
  "PASS FundingLiquidationTest.replacementMakerUsesFreshAvailableOnly",
);

await reset();
// Mutation caught: applying a long delta to the new maker in the short
// replacement branch. The rising mark remains below the immutable OI cap.
liquidationLotId = await openLot({ targetSide: 1 });
await setOracle(1, 120n * e18);
replacement = replacementOrder({
  side: 1,
  limitPrice: 120n * e18,
  leverage: 2,
  nonce: 22n,
});
receipt = await liquidate(
  liquidationLotId,
  replacement,
  await signReplacement(replacement),
);
check(receipt.status === "success", "valid short liquidation reverted");
const shortNewLotId = await read(
  orderBook,
  orderBookArtifact.abi,
  "activeLotId",
  [accounts[2], 0],
);
const shortNewLot = await read(orderBook, orderBookArtifact.abi, "lots", [
  shortNewLotId,
]);
const [shortNewCheckpoint, shortCurrentFundingTime] = await Promise.all([
  read(orderBook, task6FundingAbi, "lotFundingCheckpoint", [shortNewLotId]),
  read(orderBook, task6FundingAbi, "fundingUpdatedAt"),
]);
const shortState = await Promise.all([
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[2]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[3]]),
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[2]]),
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[3]]),
  read(orderBook, orderBookArtifact.abi, "activeLotId", [accounts[3], 0]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "claimable", [accounts[2]]),
  read(clearingHouse, clearingArtifact.abi, "available", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "lockedMargin", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
  read(clearingHouse, clearingArtifact.abi, "liquidationReward", [accounts[0]]),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(collateral, collateralArtifact.abi, "balanceOf", [
    "0x000000000000000000000000000000000000bEEF",
  ]),
]);
const shortExpected = [
  0n,
  e18,
  -e18,
  0,
  1,
  1,
  shortNewLotId,
  976_600_000_000_000_000_000n,
  0n,
  959_992_000_000_000_000_000n,
  40_008_000_000_000_000_000n,
  20n * e18,
  940n * e18,
  60n * e18,
  120n * e18,
  960_000_000_000_000_000n,
  240_000_000_000_000_000n,
  2_200_000_000_000_000_000n,
];
check(
  shortNewLotId !== liquidationLotId &&
    shortNewLot[1].toLowerCase() === accounts[2].toLowerCase() &&
    shortNewLot[2].toLowerCase() === accounts[3].toLowerCase() &&
    shortNewLot[3] === e18 &&
    shortNewLot[4] === 120n * e18 &&
    shortNewLot[5] === 40_008_000_000_000_000_000n &&
    shortNewLot[6] === 60n * e18 &&
    shortNewLot[7] === 120n * e18 &&
    shortNewCheckpoint[0] === 0n &&
    shortNewCheckpoint[1] === shortCurrentFundingTime &&
    shortState.every((value, index) => value === shortExpected[index]),
  `short replacement orientation/accounting mismatch: ${shortState.join(",")}`,
);
console.log("PASS FundingLiquidationTest.successfulShortReplacementAccounting");

await reset();
// Mutation caught: replacing bounded middle/tail removal with a FIFO-only pop.
// Liquidating the second and then third original lots must retain queue order.
const quarterQuantity = e18 / 4n;
await openLot({ quantity: quarterQuantity });
await openLot({ quantity: quarterQuantity });
await openLot({ quantity: quarterQuantity });
const originalQueue = await Promise.all(
  [0, 1, 2].map((index) =>
    read(orderBook, orderBookArtifact.abi, "activeLotId", [accounts[1], index]),
  ),
);
await setOracle(1, 75n * e18);
const middleReplacement = replacementOrder({
  quantity: quarterQuantity,
  nonce: 23n,
});
receipt = await liquidate(
  originalQueue[1],
  middleReplacement,
  await signReplacement(middleReplacement),
);
check(receipt.status === "success", "middle-lot liquidation reverted");
const firstReplacementId = await read(
  orderBook,
  orderBookArtifact.abi,
  "activeLotId",
  [accounts[3], 0],
);
const tailReplacement = replacementOrder({
  quantity: quarterQuantity,
  nonce: 24n,
});
receipt = await liquidate(
  originalQueue[2],
  tailReplacement,
  await signReplacement(tailReplacement),
);
check(receipt.status === "success", "tail-lot liquidation reverted");
const secondReplacementId = await read(
  orderBook,
  orderBookArtifact.abi,
  "activeLotId",
  [accounts[3], 1],
);
const [targetQueue, survivorQueue, replacementQueue] = await Promise.all([
  Promise.all(
    [0].map((index) =>
      read(orderBook, orderBookArtifact.abi, "activeLotId", [
        accounts[1],
        index,
      ]),
    ),
  ),
  Promise.all(
    [0, 1, 2].map((index) =>
      read(orderBook, orderBookArtifact.abi, "activeLotId", [
        accounts[2],
        index,
      ]),
    ),
  ),
  Promise.all(
    [0, 1].map((index) =>
      read(orderBook, orderBookArtifact.abi, "activeLotId", [
        accounts[3],
        index,
      ]),
    ),
  ),
]);
const removedLots = await Promise.all([
  read(orderBook, orderBookArtifact.abi, "lots", [originalQueue[1]]),
  read(orderBook, orderBookArtifact.abi, "lots", [originalQueue[2]]),
]);
const middleTailState = await Promise.all([
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[2]]),
  read(orderBook, orderBookArtifact.abi, "activeLotCount", [accounts[3]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[2]]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[3]]),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
]);
check(
  targetQueue[0] === originalQueue[0] &&
    survivorQueue[0] === originalQueue[0] &&
    survivorQueue[1] === firstReplacementId &&
    survivorQueue[2] === secondReplacementId &&
    replacementQueue[0] === firstReplacementId &&
    replacementQueue[1] === secondReplacementId &&
    removedLots[0][0] === 0n &&
    removedLots[1][0] === 0n &&
    middleTailState[0] === 1 &&
    middleTailState[1] === 3 &&
    middleTailState[2] === 2 &&
    middleTailState[3] === quarterQuantity &&
    middleTailState[4] === -(3n * quarterQuantity) &&
    middleTailState[5] === 2n * quarterQuantity &&
    middleTailState[6] === 62_500_000_000_000_000_000n,
  "middle/tail liquidation corrupted bounded active-lot queues",
);
console.log("PASS FundingLiquidationTest.middleAndTailLiquidationQueues");

await reset();
// Mutation caught: bypassing the replacement OI cap during a rising-mark short liquidation.
liquidationLotId = await openLot({ targetSide: 1 });
await setOracle(1, 160n * e18);
replacement = replacementOrder({
  side: 1,
  limitPrice: 160n * e18,
  leverage: 3,
  nonce: 10n,
});
await expectRevert(
  async () =>
    liquidate(
      liquidationLotId,
      replacement,
      await signReplacement(replacement),
    ),
  "replacement open interest exceeded the immutable cap",
);
check(
  (await read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest")) ===
    100n * e18,
  "OI-cap failure changed the old matched lot",
);
console.log("PASS FundingLiquidationTest.replacementOpenInterestCapIsAtomic");

await reset();
// Mutation caught: digest-only replay protection omitted after one complete liquidation.
const halfQuantity = e18 / 2n;
const replayLotOne = await openLot({ quantity: halfQuantity });
await openLot({ quantity: halfQuantity });
const replayLotTwo = await read(
  orderBook,
  orderBookArtifact.abi,
  "activeLotId",
  [accounts[1], 1],
);
await setOracle(1, 75n * e18);
replacement = replacementOrder({
  quantity: halfQuantity,
  limitPrice: 75n * e18,
  nonce: 11n,
});
replacementSignature = await signReplacement(replacement);
receipt = await liquidate(replayLotOne, replacement, replacementSignature);
check(receipt.status === "success", "first nonce use failed");
await expectRevert(
  () => liquidate(replayLotTwo, replacement, replacementSignature),
  "replacement nonce replay liquidated a second matching lot",
);
check(
  (await read(orderBook, orderBookArtifact.abi, "lots", [replayLotTwo]))[3] ===
    halfQuantity,
  "replay failure changed the second lot",
);
console.log("PASS FundingLiquidationTest.nonceReplayCannotSelectAnotherLot");

await reset();
// Mutation caught: committing lot/nonce/liability state before an exact fee transfer.
liquidationLotId = await openLot();
await setOracle(1, 75n * e18);
replacement = replacementOrder({ nonce: 12n });
replacementSignature = await signReplacement(replacement);
const feeRollbackBefore = await Promise.all([
  read(orderBook, orderBookArtifact.abi, "lots", [liquidationLotId]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
  read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
]);
receipt = await tx(
  wallets[0],
  collateral,
  collateralArtifact.abi,
  "setTransferMode",
  [1],
);
check(receipt.status === "success", "fee failure fixture mode failed");
await expectRevert(
  () => liquidate(liquidationLotId, replacement, replacementSignature),
  "failed exact fee transfer committed liquidation",
);
const feeRollbackAfter = await Promise.all([
  read(orderBook, orderBookArtifact.abi, "lots", [liquidationLotId]),
  read(orderBook, orderBookArtifact.abi, "netQuantity", [accounts[1]]),
  read(clearingHouse, clearingArtifact.abi, "totalAvailable"),
  read(clearingHouse, clearingArtifact.abi, "totalLockedMargin"),
  read(clearingHouse, clearingArtifact.abi, "insuranceBalance"),
  read(clearingHouse, clearingArtifact.abi, "matchedOpenInterest"),
]);
check(
  JSON.stringify(feeRollbackAfter, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ) ===
    JSON.stringify(feeRollbackBefore, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ) &&
    !(await read(orderBook, liquidationAbi, "liquidationNonceUsed", [
      accounts[3],
      12n,
    ])),
  "fee transfer failure left a partial liquidation side effect",
);
console.log(
  "PASS FundingLiquidationTest.feeTransferFailureRollsBackAtomically",
);

const exactAbiGate = (artifact, expected, label) => {
  const actual = new Map(
    artifact.abi
      .filter(({ type }) => type === "function")
      .map((item) => [toFunctionSelector(item), item.stateMutability]),
  );
  check(
    actual.size === expected.size &&
      [...expected].every(
        ([selector, mutability]) => actual.get(selector) === mutability,
      ),
    `${label} exact ABI selector/mutability gate failed`,
  );
  check(
    !artifact.abi.some(({ type }) => type === "fallback" || type === "receive"),
    `${label} exposed fallback or receive`,
  );
};
const selectorMap = (entries) =>
  new Map(
    entries.map(([signature, mutability]) => [
      toFunctionSelector(signature),
      mutability,
    ]),
  );
const orderTuple =
  "(address,uint8,uint128,uint128,uint8,uint64,uint64,bool,uint8)";
const liquidationCanonicalTuple =
  "(address,address,uint8,uint128,uint128,uint8,uint64,uint64)";
exactAbiGate(
  orderBookArtifact,
  selectorMap([
    ["activeLotCount(address)", "view"],
    ["activeLotId(address,uint8)", "view"],
    [`cancel(${orderTuple})`, "nonpayable"],
    [`cancelLiquidationOrder(${liquidationCanonicalTuple})`, "nonpayable"],
    ["cancelled(bytes32)", "view"],
    ["checkpointFunding(int256)", "nonpayable"],
    ["clearingHouse()", "view"],
    ["cumulativeFundingIndex()", "view"],
    ["domainSeparator()", "view"],
    ["filled(bytes32)", "view"],
    ["fundingUpdatedAt()", "view"],
    [`liquidate(uint64,${liquidationCanonicalTuple},bytes)`, "nonpayable"],
    [`liquidationOrderHash(${liquidationCanonicalTuple})`, "view"],
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
  ]),
  "OrderBook",
);
exactAbiGate(
  clearingArtifact,
  selectorMap([
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
  ]),
  "ClearingHouse",
);
exactAbiGate(
  riskArtifact,
  selectorMap([
    ["BPS()", "view"],
    ["INITIAL_MARGIN_BPS()", "view"],
    ["LIQUIDATION_PENALTY_BPS()", "view"],
    ["MAINTENANCE_MARGIN_BPS()", "view"],
    ["MAX_FUNDING_ELAPSED()", "view"],
    ["MAX_FUNDING_RATE_BPS()", "view"],
    ["TAKER_FEE_BPS()", "view"],
    ["WAD()", "view"],
    ["fundingPayment(uint256,int256,uint256)", "pure"],
    ["initialMargin(uint256)", "pure"],
    ["isLiquidatable(int256,uint256)", "pure"],
    ["liquidationPenalty(uint256,int256)", "pure"],
    ["maintenanceMargin(uint256)", "pure"],
    ["mulDiv(uint256,uint256,uint256)", "pure"],
    ["orderFee(uint256,uint8)", "pure"],
    ["pairedPnl(uint256,uint256,uint256)", "pure"],
  ]),
  "RiskEngine",
);
exactAbiGate(
  futuresOracleArtifact,
  selectorMap([
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
  ]),
  "FuturesOracle",
);
exactAbiGate(
  safetyControllerArtifact,
  selectorMap([
    ["clearingHouse()", "view"],
    ["executeReopen()", "nonpayable"],
    ["forceCloseOnly()", "nonpayable"],
    ["guardian()", "view"],
    ["lowerAccountEquityCap(uint256)", "nonpayable"],
    ["lowerMatchedOpenInterestCap(uint256)", "nonpayable"],
    ["lowerMaxDeviationBps(uint16)", "nonpayable"],
    ["lowerTotalLiabilityCap(uint256)", "nonpayable"],
    ["oracle()", "view"],
    ["queueReopen()", "nonpayable"],
    ["queuedReopenEpoch()", "view"],
    ["reopenExecutableAt()", "view"],
    ["safetyEpoch()", "view"],
  ]),
  "SafetyController",
);

const expectedFuturesSources = [
  "ClearingHouse.sol",
  "FuturesOracle.sol",
  "FuturesTypes.sol",
  "OrderBook.sol",
  "RiskEngine.sol",
  "SafetyController.sol",
];
const enumerateRelativeFiles = (absoluteDirectory, prefix = "") =>
  readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? enumerateRelativeFiles(
          resolve(absoluteDirectory, entry.name),
          relativePath,
        )
      : entry.isFile()
        ? [relativePath]
        : [];
  });
const actualFuturesSources = enumerateRelativeFiles(
  resolve(projectRoot, "src/futures"),
).sort();
check(
  JSON.stringify(actualFuturesSources) ===
    JSON.stringify(expectedFuturesSources),
  `Futures source manifest mismatch: ${actualFuturesSources.join(",")}`,
);
const expectedArtifactManifest = {
  "src/futures/ClearingHouse.sol": ["ClearingHouse"],
  "src/futures/FuturesOracle.sol": ["FuturesOracle"],
  "src/futures/FuturesTypes.sol": ["FuturesTypes"],
  "src/futures/OrderBook.sol": [
    "IFuturesOracleRead",
    "IMarketStateProvider",
    "OrderBook",
  ],
  "src/futures/RiskEngine.sol": ["RiskEngine"],
  "src/futures/SafetyController.sol": ["SafetyController"],
};
const actualArtifactManifest = Object.fromEntries(
  Object.entries(output.contracts)
    .filter(([source]) => source.startsWith("src/futures/"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, artifacts]) => [source, Object.keys(artifacts).sort()]),
);
check(
  JSON.stringify(actualArtifactManifest) ===
    JSON.stringify(expectedArtifactManifest),
  `Futures compiler artifact manifest mismatch: ${JSON.stringify(actualArtifactManifest)}`,
);
const orderRuntime = orderBookArtifact.evm.deployedBytecode.object;
const clearingRuntime = clearingArtifact.evm.deployedBytecode.object;
const riskRuntime = riskArtifact.evm.deployedBytecode.object;
const oracleRuntime = futuresOracleArtifact.evm.deployedBytecode.object;
const safetyControllerRuntime =
  safetyControllerArtifact.evm.deployedBytecode.object;
const orderRuntimeBytes = orderRuntime.length / 2;
const clearingRuntimeBytes = clearingRuntime.length / 2;
const riskRuntimeBytes = riskRuntime.length / 2;
const oracleRuntimeBytes = oracleRuntime.length / 2;
const safetyControllerRuntimeBytes = safetyControllerRuntime.length / 2;
for (const [runtimeBytes, label] of [
  [orderRuntimeBytes, "OrderBook"],
  [clearingRuntimeBytes, "ClearingHouse"],
  [riskRuntimeBytes, "RiskEngine"],
  [oracleRuntimeBytes, "FuturesOracle"],
  [safetyControllerRuntimeBytes, "SafetyController"],
]) {
  check(runtimeBytes <= 24_576, `${label} exceeds EIP-170 runtime size`);
}

const decodeIdentifier = (hex) => Buffer.from(hex, "hex").toString("utf8");
const forbiddenContractIdentifiers = [
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
const forbiddenArgumentShapes = [
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
const forbiddenSelectors = new Set(
  forbiddenContractIdentifiers.flatMap((name) =>
    forbiddenArgumentShapes.map((shape) =>
      toFunctionSelector(`${name}${shape}`),
    ),
  ),
);
const productionArtifacts = Object.entries(actualArtifactManifest).flatMap(
  ([source, names]) =>
    names.map((name) => ({
      label: name,
      source,
      artifact: output.contracts[source][name],
    })),
);
for (const { artifact, label } of productionArtifacts) {
  const functions = artifact.abi.filter(({ type }) => type === "function");
  check(
    !functions.some(({ name }) => forbiddenContractIdentifiers.includes(name)),
    `${label} ABI exposed a prohibited authority or deleveraging function`,
  );
  check(
    !artifact.abi.some(({ type }) => type === "fallback" || type === "receive"),
    `${label} artifact exposed fallback or receive`,
  );
  const runtime = artifact.evm.deployedBytecode.object;
  for (const selector of forbiddenSelectors) {
    check(
      !runtime.includes(`63${selector.slice(2)}`),
      `${label} runtime contains prohibited selector ${selector}`,
    );
  }
}
for (const [address, label] of [
  [orderBook, "OrderBook"],
  [clearingHouse, "ClearingHouse"],
  [riskEngine, "RiskEngine"],
]) {
  for (const selector of forbiddenSelectors) {
    await expectRevert(async () => {
      await publicClient.call({
        account: accounts[0],
        to: address,
        data: `${selector}${"00".repeat(96)}`,
      });
      return { status: "success" };
    }, `${label} executed prohibited selector ${selector}`);
  }
  await expectRevert(async () => {
    await publicClient.call({ account: accounts[0], to: address, data: "0x" });
    return { status: "success" };
  }, `${label} accepted empty calldata`);
}

const repositoryRoot = resolve(projectRoot, "../..");
const scannedExtensions = new Set([
  ".sol",
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
]);
const ignoredSurfaceDirectories = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "out",
]);
const repositorySurfaceFiles = [];
const collectSurfaceFiles = (relativeDirectory) => {
  for (const entry of readdirSync(resolve(repositoryRoot, relativeDirectory), {
    withFileTypes: true,
  })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!ignoredSurfaceDirectories.has(entry.name)) {
        collectSurfaceFiles(relativePath);
      }
    } else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      repositorySurfaceFiles.push(relativePath);
    }
  }
};
for (const root of [
  "packages/contracts/src/futures",
  "packages/contracts/scripts",
  "packages/contracts/deployments",
  "packages/chain-config",
  "apps/web",
]) {
  collectSurfaceFiles(root);
}
repositorySurfaceFiles.push("packages/contracts/package.json");
repositorySurfaceFiles.sort();

const identifierTokens = (contents) =>
  contents.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
const shortForbiddenStem = forbiddenContractIdentifiers[0].toLowerCase();
const longForbiddenStem = forbiddenContractIdentifiers[1]
  .slice(4)
  .toLowerCase();
const prohibitedRepositoryIdentifier = (identifier) => {
  const normalized = identifier.toLowerCase();
  return (
    normalized === shortForbiddenStem ||
    normalized.startsWith(shortForbiddenStem) ||
    normalized.endsWith(shortForbiddenStem) ||
    normalized.includes(longForbiddenStem)
  );
};
const repositoryContents = new Map(
  repositorySurfaceFiles.map((relativePath) => [
    relativePath,
    readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
  ]),
);
for (const [relativePath, contents] of repositoryContents) {
  const identifier = identifierTokens(contents).find(
    prohibitedRepositoryIdentifier,
  );
  check(
    identifier === undefined,
    `${relativePath} contains prohibited Futures identifier ${identifier}`,
  );
}

const deploymentFilePattern =
  /(deploy|deployment|artifact|manifest|abi|bytecode)/i;
const futuresStem = decodeIdentifier("66757475726573").toLowerCase();
const currentDeploymentManifest = repositorySurfaceFiles.filter(
  (relativePath) =>
    deploymentFilePattern.test(basename(relativePath)) &&
    identifierTokens(repositoryContents.get(relativePath)).some((identifier) =>
      identifier.toLowerCase().includes(futuresStem),
    ),
);
const contractPackage = JSON.parse(
  repositoryContents.get("packages/contracts/package.json"),
);
for (const [scriptName, command] of Object.entries(contractPackage.scripts)) {
  if (
    /(build|deploy|export|manifest|artifact)/i.test(scriptName) &&
    /src\/futures\/|Futures(?:Oracle|Types)/.test(command)
  ) {
    currentDeploymentManifest.push(
      `packages/contracts/package.json#${scriptName}`,
    );
  }
}
const approvedDeploymentSurface = [
  "packages/contracts/scripts/futures-deployment.test.mjs",
];
check(
  JSON.stringify(currentDeploymentManifest.sort()) ===
    JSON.stringify(approvedDeploymentSurface),
  `Phase-1 Futures deployment manifest changed: ${currentDeploymentManifest.join(",")}`,
);
console.log(
  `PASS FundingLiquidationTest.exactAbiRuntimeAndForbiddenSelectors (${orderRuntimeBytes} / ${clearingRuntimeBytes} / ${riskRuntimeBytes} / ${oracleRuntimeBytes} / ${safetyControllerRuntimeBytes} bytes; ${actualFuturesSources.length} sources; ${productionArtifacts.length} artifacts; ${repositorySurfaceFiles.length} repository inputs)`,
);
