import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  stringToHex,
} from "viem";
import {
  assertFuturesTestnetManifest,
  compileFuturesTestnet,
  FUTURES_TESTNET_CHAIN_ID,
  parseFuturesTestnetConfig,
  sha256Bytecode,
} from "./futures-testnet-core.mjs";
import { validateFuturesOracleDependencies } from "./futures-testnet-preflight.mjs";

const root = resolve(import.meta.dirname, "..");
const config = parseFuturesTestnetConfig(process.env);
const { artifacts } = compileFuturesTestnet(root);
const manifest = assertFuturesTestnetManifest(
  JSON.parse(
    readFileSync(resolve(root, "deployments/bsc-testnet-futures.json"), "utf8"),
  ),
  artifacts,
);
const chain = defineChain({
  id: FUTURES_TESTNET_CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
if ((await client.getChainId()) !== FUTURES_TESTNET_CHAIN_ID)
  throw new Error("acceptance RPC is not chain 97");
await validateFuturesOracleDependencies(client, config);
const deployed = Object.fromEntries(
  manifest.entries.map((entry) => [entry.contract, entry]),
);
for (const entry of manifest.entries) {
  const [runtime, receipt, transaction] = await Promise.all([
    client.getBytecode({ address: entry.address }),
    client.getTransactionReceipt({ hash: entry.transactionHash }),
    client.getTransaction({ hash: entry.transactionHash }),
  ]);
  if (
    !runtime ||
    runtime === "0x" ||
    sha256Bytecode(runtime) !== entry.deployedRuntimeBytecodeHash ||
    (runtime.length - 2) / 2 !== entry.runtimeBytes ||
    entry.runtimeBytes > 24_576
  )
    throw new Error(`${entry.contract} runtimeBytecodeHash mismatch`);
  if (
    receipt.status !== "success" ||
    receipt.contractAddress?.toLowerCase() !== entry.address.toLowerCase() ||
    transaction.from.toLowerCase() !== manifest.deployer.toLowerCase() ||
    BigInt(transaction.nonce) !== BigInt(entry.nonce)
  )
    throw new Error(`${entry.contract} deployment transaction mismatch`);
}
const read = (contract, functionName) =>
  client.readContract({
    address: deployed[contract].address,
    abi: artifacts[contract].abi,
    functionName,
  });
const [
  collateral,
  clearingRisk,
  clearingOrderBook,
  clearingController,
  oraclePair,
  oracleFeed,
  oracleBnbx,
  oracleWbnb,
  oracleGuardian,
  controllerGuardian,
  controllerClearing,
  controllerOracle,
  orderClearing,
  orderRisk,
  marketStateProvider,
  domainSeparator,
] = await Promise.all([
  read("ClearingHouse", "collateral"),
  read("ClearingHouse", "riskEngine"),
  read("ClearingHouse", "orderBook"),
  read("ClearingHouse", "safetyController"),
  read("FuturesOracle", "pair"),
  read("FuturesOracle", "bnbUsdFeed"),
  read("FuturesOracle", "bnbxToken"),
  read("FuturesOracle", "wbnbToken"),
  read("FuturesOracle", "guardian"),
  read("SafetyController", "guardian"),
  read("SafetyController", "clearingHouse"),
  read("SafetyController", "oracle"),
  read("OrderBook", "clearingHouse"),
  read("OrderBook", "riskEngine"),
  read("OrderBook", "marketStateProvider"),
  read("OrderBook", "domainSeparator"),
]);
const [
  revenueRecipient,
  totalLiabilityCap,
  accountEquityCap,
  matchedOpenInterestCap,
] = await Promise.all([
  read("ClearingHouse", "revenueRecipient"),
  read("ClearingHouse", "totalLiabilityCap"),
  read("ClearingHouse", "accountEquityCap"),
  read("ClearingHouse", "matchedOpenInterestCap"),
]);
const equal = (actual, expected, label) => {
  if (`${actual}`.toLowerCase() !== `${expected}`.toLowerCase())
    throw new Error(`${label} dependency mismatch`);
};
equal(collateral, config.testUsdt, "collateral");
equal(clearingRisk, deployed.RiskEngine.address, "clearing risk");
equal(clearingOrderBook, deployed.OrderBook.address, "clearing order book");
equal(
  clearingController,
  deployed.SafetyController.address,
  "clearing controller",
);
equal(oraclePair, config.pair, "oracle pair");
equal(oracleFeed, config.bnbUsdFeed, "oracle feed");
equal(oracleBnbx, config.testBnbx, "oracle Test BNBX");
equal(oracleWbnb, config.wbnb, "oracle WBNB");
equal(oracleGuardian, deployed.SafetyController.address, "oracle guardian");
equal(controllerGuardian, config.guardian, "controller guardian");
equal(
  controllerClearing,
  deployed.ClearingHouse.address,
  "controller clearing",
);
equal(controllerOracle, deployed.FuturesOracle.address, "controller oracle");
equal(orderClearing, deployed.ClearingHouse.address, "order clearing");
equal(orderRisk, deployed.RiskEngine.address, "order risk");
equal(marketStateProvider, deployed.FuturesOracle.address, "order oracle");
equal(revenueRecipient, config.revenueRecipient, "revenue recipient");
if (
  totalLiabilityCap !== BigInt(config.totalLiabilityCap) ||
  accountEquityCap !== BigInt(config.accountEquityCap) ||
  matchedOpenInterestCap !== BigInt(config.matchedOpenInterestCap)
)
  throw new Error("clearing caps mismatch");
const domainTypeHash = keccak256(
  stringToHex(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  ),
);
const expectedDomainSeparator = keccak256(
  encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
    ],
    [
      domainTypeHash,
      keccak256(stringToHex("BNBX Futures")),
      keccak256(stringToHex("1")),
      BigInt(FUTURES_TESTNET_CHAIN_ID),
      deployed.OrderBook.address,
    ],
  ),
);
equal(domainSeparator, expectedDomainSeparator, "EIP-712 domain separator");
console.log(
  JSON.stringify(
    {
      status: "PASS",
      chainId: FUTURES_TESTNET_CHAIN_ID,
      contracts: manifest.entries.map(
        ({ contract, address, runtimeBytes }) => ({
          contract,
          address,
          runtimeBytes,
        }),
      ),
      domainSeparator,
      testAssets: { testBnbx: config.testBnbx, testUsdt: config.testUsdt },
    },
    null,
    2,
  ),
);
