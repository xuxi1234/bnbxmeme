import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
  getContractAddress,
  parseAbi,
  toFunctionSelector,
} from "viem";

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
    "src/futures/SafetyController.sol": {
      content: loadSource("src/futures/SafetyController.sol"),
    },
    "test/FuturesOracle.t.sol": {
      content: loadSource("test/FuturesOracle.t.sol"),
    },
    "test/futures/SafetyControllerProbe.sol": {
      content: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract SafetyControllerProbe {
    uint256 public touches;
    function touch() external payable { touches += 1; }
}
contract OracleGuardianProbe {
    enum Mode { Correct, Wrong, HighBits, Short, Overlong }
    address private immutable _target;
    Mode public mode;

    constructor(address target_) { _target = target_; }
    function setMode(Mode mode_) external { mode = mode_; }
    function oracle() external view {
        Mode current = mode;
        address target = _target;
        assembly ("memory-safe") {
            let word := target
            let size := 32
            switch current
            case 1 { word := 0xdead }
            case 2 { word := or(word, shl(200, 1)) }
            case 3 { size := 31 }
            case 4 { size := 64 }
            mstore(0, word)
            mstore(32, 0xfeed)
            return(0, size)
        }
    }
    function invoke(address target, bytes calldata data) external {
        (bool success, bytes memory returnData) = target.call(data);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returnData, 32), mload(returnData))
            }
        }
    }
}
contract BindingClearingProbe {
    address public immutable safetyController;
    constructor(address safetyController_) { safetyController = safetyController_; }
}
contract BindingOracleProbe {
    address public immutable guardian;
    bool public immutable failClear;
    uint256 public clearAttempts;

    constructor(address guardian_, bool failClear_) {
        guardian = guardian_;
        failClear = failClear_;
    }
    function clearForcedClose() external {
        if (msg.sender != guardian) revert();
        clearAttempts += 1;
        if (failClear) revert();
    }
}
contract CombinedBindingProbe {
    address public immutable safetyController;
    address public immutable guardian;
    constructor(address controller_) {
        safetyController = controller_;
        guardian = controller_;
    }
}`,
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "storageLayout",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
        ],
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
  name: "BNBX Task 7",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
});
const provider = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 4, defaultBalance: 1_000 },
  miner: { blockGasLimit: 120_000_000 },
  chain: { chainId: chain.id },
});
const accounts = await provider.request({ method: "eth_accounts", params: [] });
const publicClient = createPublicClient({ chain, transport: custom(provider) });
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain, transport: custom(provider) }),
);

const artifact = (source, name) => output.contracts[source][name];
const deploy = async (contractArtifact, args = []) => {
  const hash = await wallets[0].deployContract({
    abi: contractArtifact.abi,
    bytecode: `0x${contractArtifact.evm.bytecode.object}`,
    args,
    gas: 100_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("Task 7 dependency deployment failed");
  }
  return receipt.contractAddress;
};
const tx = async (wallet, address, abi, functionName, args = []) => {
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args,
    gas: 10_000_000n,
  });
  return publicClient.waitForTransactionReceipt({ hash });
};
const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sameAddress = (left, right) => left.toLowerCase() === right.toLowerCase();
const expectRevert = async (operation, message) => {
  try {
    const failedReceipt = await operation();
    check(failedReceipt.status === "reverted", message);
  } catch (error) {
    if (
      /revert|reverted|execution/i.test(
        `${error.shortMessage ?? ""} ${error.message ?? ""}`,
      )
    ) {
      return;
    }
    throw error;
  }
};

const tokenArtifact = artifact("test/FuturesOracle.t.sol", "OracleTokenMock");
const pairArtifact = artifact("test/FuturesOracle.t.sol", "OraclePairMock");
const feedArtifact = artifact("test/FuturesOracle.t.sol", "OracleFeedMock");
const oracleArtifact = artifact(
  "src/futures/FuturesOracle.sol",
  "FuturesOracle",
);
const oracleStorageLayout = oracleArtifact.storageLayout;
const requiredOracleStorageLabels = [
  "maxDeviationBps",
  "forcedClose",
  "_observations",
  "_observationHead",
  "_observationCount",
  "_accepted",
  "_acceptanceFault",
  "_rebuilding",
];
check(
  requiredOracleStorageLabels.every((label) =>
    oracleStorageLayout.storage.some((entry) => entry.label === label),
  ),
  "compiler storage layout omitted required Oracle mutable state",
);
const oracleStorageSlots = [
  ...new Set(
    oracleStorageLayout.storage.flatMap((entry) => {
      const firstSlot = BigInt(entry.slot);
      const byteLength = BigInt(
        oracleStorageLayout.types[entry.type].numberOfBytes,
      );
      const slotCount = (byteLength + 31n) / 32n;
      return Array.from(
        { length: Number(slotCount) },
        (_, index) => firstSlot + BigInt(index),
      );
    }),
  ),
].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
const forcedCloseLayout = oracleStorageLayout.storage.find(
  ({ label }) => label === "forcedClose",
);
const forcedCloseBitMask =
  ((1n <<
    (8n *
      BigInt(
        oracleStorageLayout.types[forcedCloseLayout.type].numberOfBytes,
      ))) -
    1n) <<
  (8n * BigInt(forcedCloseLayout.offset));
const snapshotOracleStorage = async (oracleAddress) =>
  Promise.all(
    oracleStorageSlots.map(async (slot) => {
      const word = await provider.request({
        method: "eth_getStorageAt",
        params: [oracleAddress, `0x${slot.toString(16)}`, "latest"],
      });
      return [slot, BigInt(word === "0x" ? "0x0" : word)];
    }),
  );
const checkOnlyForcedCloseChanged = (before, after) => {
  const afterBySlot = new Map(after);
  for (const [slot, beforeWord] of before) {
    const afterWord = afterBySlot.get(slot);
    if (slot === BigInt(forcedCloseLayout.slot)) {
      check(
        (beforeWord & ~forcedCloseBitMask) ===
          (afterWord & ~forcedCloseBitMask),
        "Oracle unlatch changed packed mutable storage beyond forcedClose",
      );
    } else {
      check(
        beforeWord === afterWord,
        `Oracle unlatch changed compiler-layout storage slot ${slot}`,
      );
    }
  }
};
const token0 = await deploy(tokenArtifact);
const token1 = await deploy(tokenArtifact);
const pair = await deploy(pairArtifact, [token0, token1]);
const feed = await deploy(feedArtifact);
const oracle = await deploy(oracleArtifact, [
  pair,
  feed,
  token0,
  token1,
  accounts[0],
]);

let receipt;
// Mutations caught: address-only authorization or a missing code/backreference
// check lets an EOA configured as guardian mutate Oracle safety state directly.
for (const [functionName, args] of [
  ["forceCloseOnly", []],
  ["lowerMaxDeviationBps", [500]],
  ["clearForcedClose", []],
]) {
  await expectRevert(
    () => tx(wallets[0], oracle, oracleArtifact.abi, functionName, args),
    `EOA-configured guardian executed Oracle.${functionName}`,
  );
}
check(
  !(await read(oracle, oracleArtifact.abi, "forcedClose")) &&
    (await read(oracle, oracleArtifact.abi, "maxDeviationBps")) === 1_000,
  "EOA-configured Oracle rejection changed safety state",
);
console.log("PASS SafetyControllerTest.oracleRejectsEoaConfiguredGuardian");

const collateralArtifact = artifact(
  "test/futures/FuturesCollateralMock.sol",
  "FuturesCollateralMock",
);
const riskArtifact = artifact("src/futures/RiskEngine.sol", "RiskEngine");
const clearingArtifact = artifact(
  "src/futures/ClearingHouse.sol",
  "ClearingHouse",
);
const orderBookArtifact = artifact("src/futures/OrderBook.sol", "OrderBook");
const controllerArtifact = artifact(
  "src/futures/SafetyController.sol",
  "SafetyController",
);
const probeArtifact = artifact(
  "test/futures/SafetyControllerProbe.sol",
  "SafetyControllerProbe",
);
const guardianProbeArtifact = artifact(
  "test/futures/SafetyControllerProbe.sol",
  "OracleGuardianProbe",
);
const bindingClearingArtifact = artifact(
  "test/futures/SafetyControllerProbe.sol",
  "BindingClearingProbe",
);
const bindingOracleArtifact = artifact(
  "test/futures/SafetyControllerProbe.sol",
  "BindingOracleProbe",
);
const combinedBindingArtifact = artifact(
  "test/futures/SafetyControllerProbe.sol",
  "CombinedBindingProbe",
);

const malformedOracleNonce = BigInt(
  await publicClient.getTransactionCount({ address: accounts[0] }),
);
const predictedMalformedOracle = getContractAddress({
  from: accounts[0],
  nonce: malformedOracleNonce,
});
const predictedGuardianProbe = getContractAddress({
  from: accounts[0],
  nonce: malformedOracleNonce + 1n,
});
const malformedOracle = await deploy(oracleArtifact, [
  pair,
  feed,
  token0,
  token1,
  predictedGuardianProbe,
]);
const guardianProbe = await deploy(guardianProbeArtifact, [malformedOracle]);
check(
  sameAddress(malformedOracle, predictedMalformedOracle) &&
    sameAddress(guardianProbe, predictedGuardianProbe),
  "Oracle guardian-probe prediction mismatch",
);
const forceData = encodeFunctionData({
  abi: oracleArtifact.abi,
  functionName: "forceCloseOnly",
});
const clearData = encodeFunctionData({
  abi: oracleArtifact.abi,
  functionName: "clearForcedClose",
});
for (const [mode, label] of [
  [1, "wrong backreference"],
  [2, "non-canonical high bits"],
  [3, "short return"],
  [4, "overlong return"],
]) {
  receipt = await tx(
    wallets[0],
    guardianProbe,
    guardianProbeArtifact.abi,
    "setMode",
    [0],
  );
  check(receipt.status === "success", `correct-mode setup failed for ${label}`);
  receipt = await tx(
    wallets[0],
    guardianProbe,
    guardianProbeArtifact.abi,
    "invoke",
    [malformedOracle, forceData],
  );
  check(receipt.status === "success", `wired force setup failed for ${label}`);
  check(
    await read(malformedOracle, oracleArtifact.abi, "forcedClose"),
    `wired force did not latch before ${label}`,
  );
  const deviationBeforeRejectedClear = await read(
    malformedOracle,
    oracleArtifact.abi,
    "maxDeviationBps",
  );
  receipt = await tx(
    wallets[0],
    guardianProbe,
    guardianProbeArtifact.abi,
    "setMode",
    [mode],
  );
  check(receipt.status === "success", `mode setup failed for ${label}`);
  await expectRevert(
    () =>
      tx(wallets[0], guardianProbe, guardianProbeArtifact.abi, "invoke", [
        malformedOracle,
        clearData,
      ]),
    `Oracle accepted ${label} controller response`,
  );
  check(
    (await read(malformedOracle, oracleArtifact.abi, "forcedClose")) &&
      (await read(malformedOracle, oracleArtifact.abi, "maxDeviationBps")) ===
        deviationBeforeRejectedClear,
    `${label} rejection changed Oracle state`,
  );
  receipt = await tx(
    wallets[0],
    guardianProbe,
    guardianProbeArtifact.abi,
    "setMode",
    [0],
  );
  check(
    receipt.status === "success",
    `correct-mode restore failed for ${label}`,
  );
  receipt = await tx(
    wallets[0],
    guardianProbe,
    guardianProbeArtifact.abi,
    "invoke",
    [malformedOracle, clearData],
  );
  check(
    receipt.status === "success",
    `wired clear restore failed for ${label}`,
  );
}
console.log(
  "PASS SafetyControllerTest.oracleRequiresCanonicalControllerBackreference",
);

const collateral = await deploy(collateralArtifact);
const riskEngine = await deploy(riskArtifact);
receipt = await tx(wallets[0], pair, pairArtifact.abi, "setReserves", [
  100n * 10n ** 18n,
  1n * 10n ** 18n,
]);
check(receipt.status === "success", "pair reserve configuration failed");
receipt = await tx(wallets[0], feed, feedArtifact.abi, "setFreshAnswer", [
  60_000_000_000n,
]);
check(receipt.status === "success", "feed configuration failed");

const deploymentNonce = BigInt(
  await publicClient.getTransactionCount({ address: accounts[0] }),
);
const predictedClearingHouse = getContractAddress({
  from: accounts[0],
  nonce: deploymentNonce,
});
const predictedSystemOracle = getContractAddress({
  from: accounts[0],
  nonce: deploymentNonce + 1n,
});
const predictedController = getContractAddress({
  from: accounts[0],
  nonce: deploymentNonce + 2n,
});
const predictedOrderBook = getContractAddress({
  from: accounts[0],
  nonce: deploymentNonce + 3n,
});

const TOTAL_CAP = 1_000_000n * 10n ** 18n;
const ACCOUNT_CAP = 10_000n * 10n ** 18n;
const OPEN_INTEREST_CAP = 1_000_000n * 10n ** 18n;
const clearingHouse = await deploy(clearingArtifact, [
  collateral,
  riskEngine,
  predictedOrderBook,
  predictedController,
  accounts[3],
  TOTAL_CAP,
  ACCOUNT_CAP,
  OPEN_INTEREST_CAP,
]);
const systemOracle = await deploy(oracleArtifact, [
  pair,
  feed,
  token0,
  token1,
  predictedController,
]);
const controller = await deploy(controllerArtifact, [
  accounts[1],
  clearingHouse,
  systemOracle,
]);
const orderBook = await deploy(orderBookArtifact, [
  clearingHouse,
  riskEngine,
  systemOracle,
]);
check(
  clearingHouse.toLowerCase() === predictedClearingHouse.toLowerCase() &&
    systemOracle.toLowerCase() === predictedSystemOracle.toLowerCase() &&
    controller.toLowerCase() === predictedController.toLowerCase() &&
    orderBook.toLowerCase() === predictedOrderBook.toLowerCase(),
  "deterministic cyclic deployment addresses diverged",
);
check(
  sameAddress(
    await read(clearingHouse, clearingArtifact.abi, "safetyController"),
    controller,
  ),
  "ClearingHouse immutable controller wiring mismatch",
);
check(
  sameAddress(
    await read(systemOracle, oracleArtifact.abi, "guardian"),
    controller,
  ),
  "Oracle immutable controller wiring mismatch",
);
check(
  sameAddress(
    await read(controller, controllerArtifact.abi, "guardian"),
    accounts[1],
  ),
  "SafetyController immutable human guardian mismatch",
);
check(
  sameAddress(
    await read(controller, controllerArtifact.abi, "clearingHouse"),
    clearingHouse,
  ),
  "SafetyController immutable ClearingHouse mismatch",
);
check(
  sameAddress(
    await read(controller, controllerArtifact.abi, "oracle"),
    systemOracle,
  ),
  "SafetyController immutable Oracle mismatch",
);
console.log("PASS SafetyControllerTest.deterministicImmutableCyclicWiring");

const deployAttempt = async (contractArtifact, args) => {
  try {
    const hash = await wallets[0].deployContract({
      abi: contractArtifact.abi,
      bytecode: `0x${contractArtifact.evm.bytecode.object}`,
      args,
      gas: 100_000_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    if (/revert|reverted|execution/i.test(`${error.message ?? ""}`)) {
      return { status: "reverted" };
    }
    throw error;
  }
};
for (const [args, label] of [
  [
    ["0x0000000000000000000000000000000000000000", clearingHouse, systemOracle],
    "zero guardian",
  ],
  [[accounts[1], accounts[2], systemOracle], "no-code ClearingHouse"],
  [[accounts[1], clearingHouse, accounts[2]], "no-code Oracle"],
  [[accounts[1], clearingHouse, systemOracle], "mismatched backreferences"],
]) {
  const failedDeployment = await deployAttempt(controllerArtifact, args);
  check(
    failedDeployment.status === "reverted",
    `SafetyController constructor accepted ${label}`,
  );
}
console.log("PASS SafetyControllerTest.constructorRejectsUnsafeBindings");

const deployBindingController = async ({
  guardianKind = "human",
  wrongClearing = false,
  wrongOracle = false,
  aliasedDependencies = false,
} = {}) => {
  const nonce = BigInt(
    await publicClient.getTransactionCount({ address: accounts[0] }),
  );
  if (aliasedDependencies) {
    const predictedDependency = getContractAddress({
      from: accounts[0],
      nonce,
    });
    const predictedBoundController = getContractAddress({
      from: accounts[0],
      nonce: nonce + 1n,
    });
    const dependency = await deploy(combinedBindingArtifact, [
      predictedBoundController,
    ]);
    check(
      sameAddress(dependency, predictedDependency),
      "combined dependency prediction mismatch",
    );
    return deployAttempt(controllerArtifact, [
      accounts[1],
      dependency,
      dependency,
    ]);
  }

  const predictedClearing = getContractAddress({
    from: accounts[0],
    nonce,
  });
  const predictedOracle = getContractAddress({
    from: accounts[0],
    nonce: nonce + 1n,
  });
  const predictedBoundController = getContractAddress({
    from: accounts[0],
    nonce: nonce + 2n,
  });
  const clearing = await deploy(bindingClearingArtifact, [
    wrongClearing ? accounts[2] : predictedBoundController,
  ]);
  const oracleDependency = await deploy(bindingOracleArtifact, [
    wrongOracle ? accounts[2] : predictedBoundController,
    false,
  ]);
  check(
    sameAddress(clearing, predictedClearing) &&
      sameAddress(oracleDependency, predictedOracle),
    "binding fixture prediction mismatch",
  );
  const guardian =
    guardianKind === "self"
      ? predictedBoundController
      : guardianKind === "clearing"
        ? clearing
        : guardianKind === "oracle"
          ? oracleDependency
          : accounts[1];
  return deployAttempt(controllerArtifact, [
    guardian,
    clearing,
    oracleDependency,
  ]);
};

for (const [options, label] of [
  [{ guardianKind: "self" }, "predicted self guardian"],
  [{ guardianKind: "clearing" }, "guardian/ClearingHouse alias"],
  [{ guardianKind: "oracle" }, "guardian/Oracle alias"],
  [{ aliasedDependencies: true }, "ClearingHouse/Oracle alias"],
  [{ wrongClearing: true }, "only ClearingHouse backreference mismatch"],
  [{ wrongOracle: true }, "only Oracle backreference mismatch"],
]) {
  const result = await deployBindingController(options);
  check(result.status === "reverted", `SafetyController accepted ${label}`);
}
console.log(
  "PASS SafetyControllerTest.constructorRejectsSelfAliasesAndIndependentMismatches",
);

const mineAfter = async (seconds) => {
  await provider.request({ method: "evm_increaseTime", params: [seconds] });
  await provider.request({ method: "evm_mine", params: [] });
};
const setTimestamp = async (timestamp) => {
  await provider.request({
    method: "evm_setTime",
    params: [Number(timestamp * 1_000n)],
  });
  await provider.request({ method: "evm_mine", params: [] });
  const block = await publicClient.getBlock();
  check(
    block.timestamp === timestamp,
    `unable to set exact Task 7 timestamp: ${block.timestamp}/${timestamp}`,
  );
};

const dependencyFailureSnapshot = await provider.request({
  method: "evm_snapshot",
  params: [],
});
const failingNonce = BigInt(
  await publicClient.getTransactionCount({ address: accounts[0] }),
);
const predictedFailingClearing = getContractAddress({
  from: accounts[0],
  nonce: failingNonce,
});
const predictedFailingOracle = getContractAddress({
  from: accounts[0],
  nonce: failingNonce + 1n,
});
const predictedFailingController = getContractAddress({
  from: accounts[0],
  nonce: failingNonce + 2n,
});
const failingClearing = await deploy(bindingClearingArtifact, [
  predictedFailingController,
]);
const failingOracle = await deploy(bindingOracleArtifact, [
  predictedFailingController,
  true,
]);
const failingController = await deploy(controllerArtifact, [
  accounts[1],
  failingClearing,
  failingOracle,
]);
check(
  sameAddress(failingClearing, predictedFailingClearing) &&
    sameAddress(failingOracle, predictedFailingOracle) &&
    sameAddress(failingController, predictedFailingController),
  "failing dependency fixture prediction mismatch",
);
receipt = await tx(
  wallets[1],
  failingController,
  controllerArtifact.abi,
  "queueReopen",
);
check(receipt.status === "success", "failing dependency queue setup failed");
const failingQueueEpoch = await read(
  failingController,
  controllerArtifact.abi,
  "queuedReopenEpoch",
);
const failingQueueTime = await read(
  failingController,
  controllerArtifact.abi,
  "reopenExecutableAt",
);
const failingSafetyEpoch = await read(
  failingController,
  controllerArtifact.abi,
  "safetyEpoch",
);
await setTimestamp(failingQueueTime);
await expectRevert(
  () =>
    tx(wallets[3], failingController, controllerArtifact.abi, "executeReopen"),
  "SafetyController swallowed downstream Oracle unlatch failure",
);
check(
  (await read(
    failingController,
    controllerArtifact.abi,
    "queuedReopenEpoch",
  )) === failingQueueEpoch &&
    (await read(
      failingController,
      controllerArtifact.abi,
      "reopenExecutableAt",
    )) === failingQueueTime &&
    (await read(failingController, controllerArtifact.abi, "safetyEpoch")) ===
      failingSafetyEpoch &&
    sameAddress(
      await read(failingController, controllerArtifact.abi, "guardian"),
      accounts[1],
    ) &&
    sameAddress(
      await read(failingController, controllerArtifact.abi, "clearingHouse"),
      failingClearing,
    ) &&
    sameAddress(
      await read(failingController, controllerArtifact.abi, "oracle"),
      failingOracle,
    ) &&
    (await read(failingOracle, bindingOracleArtifact.abi, "clearAttempts")) ===
      0n,
  "downstream Oracle failure left partial controller/dependency state",
);
check(
  await provider.request({
    method: "evm_revert",
    params: [dependencyFailureSnapshot],
  }),
  "failed to restore dependency-failure fixture snapshot",
);
console.log("PASS SafetyControllerTest.downstreamOracleFailureIsFullyAtomic");

const freshFeed = () =>
  tx(wallets[0], feed, feedArtifact.abi, "setFreshAnswer", [60_000_000_000n]);
const oracleUpdate = () =>
  tx(wallets[0], systemOracle, oracleArtifact.abi, "update");

receipt = await freshFeed();
check(receipt.status === "success", "initial feed refresh failed");
receipt = await oracleUpdate();
check(receipt.status === "success", "initial Oracle baseline failed");
for (let index = 0; index < 6; index += 1) {
  await mineAfter(300);
  receipt = await freshFeed();
  check(receipt.status === "success", `Oracle feed refresh ${index} failed`);
  receipt = await oracleUpdate();
  check(receipt.status === "success", `Oracle update ${index} failed`);
}
let oracleRead = await read(systemOracle, oracleArtifact.abi, "safeRead");
check(
  oracleRead[0] === 1 && oracleRead[1] === 5_999_999_999_999_999_400n,
  `ordinary Oracle window did not open at the hand-derived fixed-point mark: ${oracleRead}`,
);

const userDeposit = 100n * 10n ** 18n;
const insuranceFunding = 50n * 10n ** 18n;
receipt = await tx(wallets[0], collateral, collateralArtifact.abi, "mint", [
  accounts[2],
  userDeposit + insuranceFunding,
]);
check(receipt.status === "success", "collateral mint failed");
receipt = await tx(wallets[2], collateral, collateralArtifact.abi, "approve", [
  clearingHouse,
  userDeposit + insuranceFunding,
]);
check(receipt.status === "success", "collateral approval failed");
receipt = await tx(wallets[2], clearingHouse, clearingArtifact.abi, "deposit", [
  userDeposit,
]);
check(receipt.status === "success", "user collateral deposit failed");
receipt = await tx(
  wallets[2],
  clearingHouse,
  clearingArtifact.abi,
  "fundInsurance",
  [insuranceFunding],
);
check(receipt.status === "success", "insurance funding failed");
check(
  (await read(clearingHouse, clearingArtifact.abi, "totalLiabilities")) ===
    userDeposit + insuranceFunding,
  "funded liabilities mismatch",
);
check(
  (await read(collateral, collateralArtifact.abi, "balanceOf", [
    clearingHouse,
  ])) ===
    userDeposit + insuranceFunding,
  "funded ClearingHouse is not solvent",
);

let baseSnapshot = await provider.request({
  method: "evm_snapshot",
  params: [],
});
const reset = async () => {
  await provider.request({ method: "evm_revert", params: [baseSnapshot] });
  baseSnapshot = await provider.request({ method: "evm_snapshot", params: [] });
};
const auditControllerTrace = async (transactionReceipt, label, targets) => {
  const trace = await provider.request({
    method: "debug_traceTransaction",
    params: [
      transactionReceipt.transactionHash,
      { disableMemory: true, disableStorage: true },
    ],
  });
  const calls = [];
  for (const log of trace.structLogs) {
    check(
      log.op !== "CALLCODE" && log.op !== "DELEGATECALL",
      `${label} executed forbidden ${log.op}`,
    );
    if (log.op !== "CALL") continue;
    const destinationWord = BigInt(`0x${log.stack.at(-2)}`);
    const value = BigInt(`0x${log.stack.at(-3)}`);
    const destination = `0x${destinationWord
      .toString(16)
      .slice(-40)
      .padStart(40, "0")}`;
    check(value === 0n, `${label} executed CALL with nonzero value ${value}`);
    check(
      targets.some((target) => sameAddress(target, destination)),
      `${label} executed CALL to arbitrary target ${destination}`,
    );
    calls.push(destination);
  }
  check(
    calls.length === targets.length,
    `${label} executed ${calls.length} CALLs instead of ${targets.length}`,
  );
};

// Mutations caught: removing guardian checks from any typed safety entry point,
// or changing a failed operation before reverting, lets an outsider mutate the
// epoch, queue, Oracle latch/deviation, or ClearingHouse limits.
const guardianOnlyCalls = [
  ["forceCloseOnly", [], "forcedClose", false],
  [
    "lowerTotalLiabilityCap",
    [900_000n * 10n ** 18n],
    "totalLiabilityCap",
    TOTAL_CAP,
  ],
  [
    "lowerAccountEquityCap",
    [9_000n * 10n ** 18n],
    "accountEquityCap",
    ACCOUNT_CAP,
  ],
  [
    "lowerMatchedOpenInterestCap",
    [900_000n * 10n ** 18n],
    "matchedOpenInterestCap",
    OPEN_INTEREST_CAP,
  ],
  ["lowerMaxDeviationBps", [500], "maxDeviationBps", 1_000],
  ["queueReopen", [], "reopenExecutableAt", 0n],
];
for (const [
  functionName,
  args,
  stateName,
  literalBefore,
] of guardianOnlyCalls) {
  await reset();
  await expectRevert(
    () =>
      tx(wallets[2], controller, controllerArtifact.abi, functionName, args),
    `outsider executed ${functionName}`,
  );
  check(
    (await read(controller, controllerArtifact.abi, "safetyEpoch")) === 0n,
    `${functionName} failure changed the safety epoch`,
  );
  const stateTarget =
    stateName === "forcedClose" || stateName === "maxDeviationBps"
      ? systemOracle
      : stateName === "reopenExecutableAt"
        ? controller
        : clearingHouse;
  const stateAbi =
    stateTarget === systemOracle
      ? oracleArtifact.abi
      : stateTarget === controller
        ? controllerArtifact.abi
        : clearingArtifact.abi;
  check(
    (await read(stateTarget, stateAbi, stateName)) === literalBefore,
    `${functionName} failure changed ${stateName}`,
  );
}
console.log("PASS SafetyControllerTest.guardianOnlyFailuresAreAtomic");

await reset();
receipt = await tx(
  wallets[1],
  controller,
  controllerArtifact.abi,
  "queueReopen",
);
check(receipt.status === "success", "guardian could not queue reopen");
const failedQueueEpoch = await read(
  controller,
  controllerArtifact.abi,
  "queuedReopenEpoch",
);
const failedQueueTime = await read(
  controller,
  controllerArtifact.abi,
  "reopenExecutableAt",
);
for (const [functionName, args] of [
  ["lowerTotalLiabilityCap", [TOTAL_CAP]],
  ["lowerAccountEquityCap", [ACCOUNT_CAP]],
  ["lowerMatchedOpenInterestCap", [OPEN_INTEREST_CAP]],
  ["lowerMaxDeviationBps", [1_000]],
]) {
  await expectRevert(
    () =>
      tx(wallets[1], controller, controllerArtifact.abi, functionName, args),
    `invalid ${functionName} succeeded`,
  );
  check(
    (await read(controller, controllerArtifact.abi, "safetyEpoch")) === 0n &&
      (await read(controller, controllerArtifact.abi, "queuedReopenEpoch")) ===
        failedQueueEpoch &&
      (await read(controller, controllerArtifact.abi, "reopenExecutableAt")) ===
        failedQueueTime,
    `failed ${functionName} changed epoch or queue state`,
  );
}
console.log("PASS SafetyControllerTest.failedReductionsPreserveEpochAndQueue");

// Mutations caught: omitting an epoch increment from any successful immediate
// safety action lets an older (including mature) reopen undo newer safety.
const invalidatingCalls = [
  ["forceCloseOnly", [], "forcedClose", true],
  [
    "lowerTotalLiabilityCap",
    [900_000n * 10n ** 18n],
    "totalLiabilityCap",
    900_000n * 10n ** 18n,
  ],
  [
    "lowerAccountEquityCap",
    [9_000n * 10n ** 18n],
    "accountEquityCap",
    9_000n * 10n ** 18n,
  ],
  [
    "lowerMatchedOpenInterestCap",
    [900_000n * 10n ** 18n],
    "matchedOpenInterestCap",
    900_000n * 10n ** 18n,
  ],
  ["lowerMaxDeviationBps", [500], "maxDeviationBps", 500],
];
for (const [functionName, args, stateName, literalAfter] of invalidatingCalls) {
  await reset();
  receipt = await tx(
    wallets[1],
    controller,
    controllerArtifact.abi,
    "queueReopen",
  );
  check(receipt.status === "success", `queue before ${functionName} failed`);
  const matureAt = await read(
    controller,
    controllerArtifact.abi,
    "reopenExecutableAt",
  );
  await setTimestamp(matureAt);
  receipt = await tx(
    wallets[1],
    controller,
    controllerArtifact.abi,
    functionName,
    args,
  );
  check(receipt.status === "success", `${functionName} failed`);
  await auditControllerTrace(
    receipt,
    functionName,
    stateName === "totalLiabilityCap" ||
      stateName === "accountEquityCap" ||
      stateName === "matchedOpenInterestCap"
      ? [clearingHouse]
      : [systemOracle],
  );
  check(
    (await read(controller, controllerArtifact.abi, "safetyEpoch")) === 1n &&
      (await read(controller, controllerArtifact.abi, "queuedReopenEpoch")) ===
        0n,
    `${functionName} did not invalidate the mature epoch-zero queue`,
  );
  const stateTarget =
    stateName === "forcedClose" || stateName === "maxDeviationBps"
      ? systemOracle
      : clearingHouse;
  const stateAbi =
    stateTarget === systemOracle ? oracleArtifact.abi : clearingArtifact.abi;
  check(
    (await read(stateTarget, stateAbi, stateName)) === literalAfter,
    `${functionName} did not produce its literal module effect`,
  );
  await expectRevert(
    () => tx(wallets[3], controller, controllerArtifact.abi, "executeReopen"),
    `old mature queue executed after ${functionName}`,
  );
  check(
    (await read(controller, controllerArtifact.abi, "safetyEpoch")) === 1n,
    `failed stale execution changed epoch after ${functionName}`,
  );
}
console.log(
  "PASS SafetyControllerTest.everyImmediateActionInvalidatesMatureQueues",
);

await reset();
receipt = await tx(
  wallets[1],
  controller,
  controllerArtifact.abi,
  "queueReopen",
);
check(receipt.status === "success", "first reopen queue failed");
await auditControllerTrace(receipt, "queueReopen", []);
const firstExecution = await read(
  controller,
  controllerArtifact.abi,
  "reopenExecutableAt",
);
await mineAfter(3_600);
receipt = await tx(
  wallets[1],
  controller,
  controllerArtifact.abi,
  "queueReopen",
);
check(receipt.status === "success", "same-epoch requeue failed");
const secondExecution = await read(
  controller,
  controllerArtifact.abi,
  "reopenExecutableAt",
);
const requeueBlock = await publicClient.getBlock({
  blockNumber: receipt.blockNumber,
});
check(
  secondExecution === requeueBlock.timestamp + 172_800n &&
    secondExecution > firstExecution &&
    (await read(controller, controllerArtifact.abi, "queuedReopenEpoch")) ===
      0n,
  "requeue did not replace the current-epoch queue with an exact 48h delay",
);
console.log("PASS SafetyControllerTest.requeueReplacesWithExactDelay");

// Mutations caught: <= instead of < at the delay boundary blocks equality;
// missing time checks executes early; guardian-only execution strands recovery.
await reset();
receipt = await tx(
  wallets[1],
  controller,
  controllerArtifact.abi,
  "forceCloseOnly",
);
check(receipt.status === "success", "guardian force-close failed");
receipt = await oracleUpdate();
check(receipt.status === "success", "forced Oracle cleanup update failed");
receipt = await tx(
  wallets[1],
  controller,
  controllerArtifact.abi,
  "queueReopen",
);
check(receipt.status === "success", "guardian recovery queue failed");
const executeAt = await read(
  controller,
  controllerArtifact.abi,
  "reopenExecutableAt",
);
await setTimestamp(executeAt - 1n);
await expectRevert(
  () => tx(wallets[3], controller, controllerArtifact.abi, "executeReopen"),
  "permissionless reopen executed one second early",
);
check(
  (await read(systemOracle, oracleArtifact.abi, "forcedClose")) &&
    (await read(controller, controllerArtifact.abi, "reopenExecutableAt")) ===
      executeAt,
  "early execution was not atomic",
);
await setTimestamp(executeAt);
const oracleStorageBeforeUnlatch = await snapshotOracleStorage(systemOracle);
receipt = await tx(
  wallets[3],
  controller,
  controllerArtifact.abi,
  "executeReopen",
);
check(receipt.status === "success", "permissionless equality execution failed");
await auditControllerTrace(receipt, "executeReopen", [systemOracle]);
const oracleStorageAfterUnlatch = await snapshotOracleStorage(systemOracle);
checkOnlyForcedCloseChanged(
  oracleStorageBeforeUnlatch,
  oracleStorageAfterUnlatch,
);
check(
  !(await read(systemOracle, oracleArtifact.abi, "forcedClose")) &&
    (await read(controller, controllerArtifact.abi, "queuedReopenEpoch")) ===
      0n &&
    (await read(controller, controllerArtifact.abi, "reopenExecutableAt")) ===
      0n &&
    (await read(controller, controllerArtifact.abi, "safetyEpoch")) === 1n,
  "valid execution did not only clear the latch and consumed queue",
);
oracleRead = await read(systemOracle, oracleArtifact.abi, "safeRead");
check(
  oracleRead[0] === 0 && oracleRead.slice(1).every((value) => value === 0n),
  "unlatch synthesized an Open price instead of remaining CloseOnly",
);
console.log("PASS SafetyControllerTest.permissionlessExactBoundaryUnlatchOnly");

// Mutation caught: an unlatch that bypasses the ordinary 30-minute/freshness/
// deviation pipeline opens before seven independent five-minute observations.
receipt = await freshFeed();
check(receipt.status === "success", "recovery baseline feed refresh failed");
receipt = await oracleUpdate();
check(receipt.status === "success", "recovery baseline update failed");
for (let index = 1; index <= 6; index += 1) {
  await mineAfter(300);
  receipt = await freshFeed();
  check(receipt.status === "success", `recovery feed refresh ${index} failed`);
  receipt = await oracleUpdate();
  check(receipt.status === "success", `recovery update ${index} failed`);
  oracleRead = await read(systemOracle, oracleArtifact.abi, "safeRead");
  check(
    oracleRead[0] === (index === 6 ? 1 : 0),
    `Oracle recovery state at ${index * 5} minutes was ${oracleRead[0]}`,
  );
}
receipt = await tx(wallets[0], feed, feedArtifact.abi, "setFreshAnswer", [
  120_000_000_000n,
]);
check(receipt.status === "success", "deviant feed update failed");
oracleRead = await read(systemOracle, oracleArtifact.abi, "safeRead");
check(oracleRead[0] === 0, "unlatch bypassed live deviation CloseOnly");
receipt = await freshFeed();
check(receipt.status === "success", "feed restoration failed");
oracleRead = await read(systemOracle, oracleArtifact.abi, "safeRead");
check(oracleRead[0] === 1, "ordinary valid feed could not restore Open");
console.log("PASS SafetyControllerTest.unlatchPreservesOrdinaryOracleRecovery");

await reset();
for (const walletIndex of [0, 1, 2, 3]) {
  for (const functionName of [
    "forceCloseOnly",
    "clearForcedClose",
    "lowerMaxDeviationBps",
  ]) {
    const args = functionName === "lowerMaxDeviationBps" ? [500] : [];
    await expectRevert(
      () =>
        tx(
          wallets[walletIndex],
          systemOracle,
          oracleArtifact.abi,
          functionName,
          args,
        ),
      `EOA ${walletIndex} directly executed Oracle.${functionName}`,
    );
  }
}
for (const functionName of [
  "lowerTotalLiabilityCap",
  "lowerAccountEquityCap",
  "lowerMatchedOpenInterestCap",
]) {
  await expectRevert(
    () =>
      tx(wallets[1], clearingHouse, clearingArtifact.abi, functionName, [1]),
    `human guardian directly executed ClearingHouse.${functionName}`,
  );
}
check(
  !(await read(systemOracle, oracleArtifact.abi, "forcedClose")) &&
    (await read(systemOracle, oracleArtifact.abi, "maxDeviationBps")) ===
      1_000 &&
    (await read(clearingHouse, clearingArtifact.abi, "totalLiabilityCap")) ===
      TOTAL_CAP,
  "direct dependency permission failures changed state",
);
console.log("PASS SafetyControllerTest.dependenciesAreControllerOnly");

await reset();
const userBalanceBefore = await read(
  collateral,
  collateralArtifact.abi,
  "balanceOf",
  [accounts[2]],
);
receipt = await tx(
  wallets[2],
  clearingHouse,
  clearingArtifact.abi,
  "withdraw",
  [10n * 10n ** 18n],
);
check(receipt.status === "success", "user withdrawal route failed");
check(
  (await read(collateral, collateralArtifact.abi, "balanceOf", [
    accounts[2],
  ])) ===
    userBalanceBefore + 10n * 10n ** 18n &&
    (await read(clearingHouse, clearingArtifact.abi, "available", [
      accounts[2],
    ])) ===
      90n * 10n ** 18n,
  "user withdrawal did not produce its real collateral effect",
);
check(
  (await read(clearingHouse, clearingArtifact.abi, "totalLiabilities")) ===
    (await read(collateral, collateralArtifact.abi, "balanceOf", [
      clearingHouse,
    ])),
  "ClearingHouse lost continuous solvency after withdrawal",
);
console.log("PASS SafetyControllerTest.userWithdrawalRemainsOwnedAndSolvent");

const canonicalType = (inputParameter) => {
  if (!inputParameter.type.startsWith("tuple")) return inputParameter.type;
  const suffix = inputParameter.type.slice("tuple".length);
  return `(${inputParameter.components.map(canonicalType).join(",")})${suffix}`;
};
const selectorMap = (entries) =>
  new Map(
    entries.map(([signature, mutability]) => [
      toFunctionSelector(signature),
      mutability,
    ]),
  );
const artifactSelectors = (contractArtifact) =>
  new Map(
    contractArtifact.abi
      .filter(({ type }) => type === "function")
      .map((entry) => [
        toFunctionSelector(
          `${entry.name}(${entry.inputs.map(canonicalType).join(",")})`,
        ),
        entry.stateMutability,
      ]),
  );
const exactAbiGate = (contractArtifact, expected, label) => {
  const actual = artifactSelectors(contractArtifact);
  check(
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
    `${label} exact canonical selector/mutability gate failed: ${JSON.stringify([...actual].sort())}`,
  );
  check(
    !contractArtifact.abi.some(
      ({ type }) => type === "fallback" || type === "receive",
    ),
    `${label} exposed fallback or receive`,
  );
};
const openTuple = "(address,address,address,uint256,uint256,uint256,uint256)";
const closeTuple =
  "(address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256)";
const liquidateTuple =
  "(address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256)";
exactAbiGate(
  controllerArtifact,
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
exactAbiGate(
  oracleArtifact,
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
  clearingArtifact,
  selectorMap([
    ["accountEquityCap()", "view"],
    [
      "allocateLiquidationPenalty(address,address,uint256,uint256)",
      "nonpayable",
    ],
    ["allocateRoundingResidual(address,uint256)", "nonpayable"],
    ["available(address)", "view"],
    ["claimable(address)", "view"],
    [`closeMatchedPair(${closeTuple})`, "nonpayable"],
    ["collateral()", "view"],
    ["coverMatchedLossDeficit(address,uint256)", "nonpayable"],
    ["deposit(uint256)", "nonpayable"],
    ["fundInsurance(uint256)", "nonpayable"],
    ["insuranceBalance()", "view"],
    [`liquidateAndReplace(${liquidateTuple})`, "nonpayable"],
    ["liquidationReward(address)", "view"],
    ["lockedMargin(address)", "view"],
    ["lowerAccountEquityCap(uint256)", "nonpayable"],
    ["lowerMatchedOpenInterestCap(uint256)", "nonpayable"],
    ["lowerTotalLiabilityCap(uint256)", "nonpayable"],
    ["matchedOpenInterest()", "view"],
    ["matchedOpenInterestCap()", "view"],
    ["moveClaimableToAvailable(uint256)", "nonpayable"],
    ["moveLiquidationRewardToAvailable(uint256)", "nonpayable"],
    [`openMatchedPair(${openTuple})`, "nonpayable"],
    ["orderBook()", "view"],
    ["revenueRecipient()", "view"],
    ["riskEngine()", "view"],
    ["safetyController()", "view"],
    ["totalAvailable()", "view"],
    ["totalClaimable()", "view"],
    ["totalLiabilities()", "view"],
    ["totalLiabilityCap()", "view"],
    ["totalLiquidationRewards()", "view"],
    ["totalLockedMargin()", "view"],
    ["withdraw(uint256)", "nonpayable"],
    ["withdrawClaimable(uint256)", "nonpayable"],
    ["withdrawLiquidationReward(uint256)", "nonpayable"],
  ]),
  "ClearingHouse",
);

const runtimeOpcodeCounts = (hex) => {
  const bytes = Buffer.from(hex, "hex");
  const counts = new Map();
  for (let index = 0; index < bytes.length; index += 1) {
    const opcode = bytes[index];
    counts.set(opcode, (counts.get(opcode) ?? 0) + 1);
    if (opcode >= 0x60 && opcode <= 0x7f) index += opcode - 0x5f;
  }
  return counts;
};
for (const [contractArtifact, label] of [
  [controllerArtifact, "SafetyController"],
  [oracleArtifact, "FuturesOracle"],
  [clearingArtifact, "ClearingHouse"],
]) {
  const runtime = contractArtifact.evm.deployedBytecode.object;
  const runtimeBytes = runtime.length / 2;
  const opcodes = runtimeOpcodeCounts(runtime);
  check(runtimeBytes <= 24_576, `${label} exceeds EIP-170: ${runtimeBytes}`);
  check((opcodes.get(0xf2) ?? 0) === 0, `${label} contains CALLCODE`);
  check((opcodes.get(0xf4) ?? 0) === 0, `${label} contains DELEGATECALL`);
}
check(
  (runtimeOpcodeCounts(controllerArtifact.evm.deployedBytecode.object).get(
    0xf1,
  ) ?? 0) > 0,
  "SafetyController lacks the fixed dependency CALLs exercised by its typed API",
);

await reset();
const probe = await deploy(probeArtifact);
const touchData = encodeFunctionData({
  abi: probeArtifact.abi,
  functionName: "touch",
});
const forbiddenCalls = [
  ["execute(address,uint256,bytes)", [probe, 0n, touchData]],
  ["execute(address,bytes)", [probe, touchData]],
  ["multicall(bytes[])", [[touchData]]],
  ["call(address,uint256,bytes)", [probe, 0n, touchData]],
  ["delegatecall(address,bytes)", [probe, touchData]],
  ["upgradeTo(address)", [probe]],
  ["upgradeToAndCall(address,bytes)", [probe, touchData]],
  ["setGuardian(address)", [accounts[2]]],
  ["transferOwnership(address)", [accounts[2]]],
  ["renounceOwnership()", []],
  ["setFeeBps(uint16)", [1]],
  ["setMaxLeverage(uint8)", [100]],
  ["setPrice(uint256)", [1n]],
  ["withdraw(uint256)", [1n]],
  ["withdraw(address,uint256)", [accounts[2], 1n]],
  ["withdrawInsurance(address,uint256)", [accounts[2], 1n]],
  ["withdrawRevenue(address,uint256)", [accounts[2], 1n]],
  ["sweep(address,address,uint256)", [collateral, accounts[2], 1n]],
];
for (const [signature, args] of forbiddenCalls) {
  const forbiddenAbi = parseAbi([`function ${signature}`]);
  const functionName = signature.slice(0, signature.indexOf("("));
  const data = encodeFunctionData({ abi: forbiddenAbi, functionName, args });
  await expectRevert(async () => {
    const hash = await wallets[1].sendTransaction({
      to: controller,
      data,
      gas: 10_000_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }, `SafetyController accepted forbidden runtime call ${signature}`);
}
for (const [data, value, label] of [
  ["0xdeadbeef", 0n, "fallback"],
  ["0x", 1n, "receive"],
]) {
  await expectRevert(async () => {
    const hash = await wallets[1].sendTransaction({
      to: controller,
      data,
      value,
      gas: 10_000_000n,
    });
    return publicClient.waitForTransactionReceipt({ hash });
  }, `SafetyController exposed ${label}`);
}
check(
  (await read(probe, probeArtifact.abi, "touches")) === 0n &&
    (await publicClient.getBalance({ address: controller })) === 0n,
  "forbidden forwarding/value path produced a real effect",
);
const absentDeleveragingNames = ["61646c", "6175746f44656c65766572616765"].map(
  (hex) => Buffer.from(hex, "hex").toString("utf8"),
);
for (const contractArtifact of [
  controllerArtifact,
  oracleArtifact,
  clearingArtifact,
]) {
  const signatures = [...artifactSelectors(contractArtifact).keys()];
  for (const forbiddenName of [
    ...absentDeleveragingNames,
    "execute",
    "multicall",
    "upgradeTo",
    "transferOwnership",
    "withdrawInsurance",
    "withdrawRevenue",
  ]) {
    const forbiddenSelector = toFunctionSelector(`${forbiddenName}()`);
    check(
      !signatures.includes(forbiddenSelector),
      `forbidden selector ${forbiddenName}() exposed`,
    );
  }
}
console.log("PASS SafetyControllerTest.exactAbiRuntimePermissionAndSizeAudit");

const controllerRuntimeBytes =
  controllerArtifact.evm.deployedBytecode.object.length / 2;
const clearingRuntimeBytes =
  clearingArtifact.evm.deployedBytecode.object.length / 2;
const oracleRuntimeBytes =
  oracleArtifact.evm.deployedBytecode.object.length / 2;
console.log(
  `PASS SafetyControllerTest.runtimeSizes SafetyController=${controllerRuntimeBytes} ClearingHouse=${clearingRuntimeBytes} FuturesOracle=${oracleRuntimeBytes}`,
);
