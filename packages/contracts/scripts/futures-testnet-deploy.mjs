import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertFuturesTestnetManifest,
  buildFuturesDeploymentPlan,
  compileFuturesTestnet,
  encodeConstructorArgs,
  FUTURES_COMPILER_SETTINGS,
  FUTURES_TESTNET_CHAIN_ID,
  parseFuturesTestnetConfig,
  sha256Bytecode,
} from "./futures-testnet-core.mjs";
import { runFuturesTestnetPreflight } from "./futures-testnet-preflight.mjs";

const root = resolve(import.meta.dirname, "..");
await runFuturesTestnetPreflight(process.env);
const config = parseFuturesTestnetConfig(process.env, { requireSecrets: true });
const account = privateKeyToAccount(config.privateKey);
const chain = defineChain({
  id: FUTURES_TESTNET_CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});
const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});
if ((await publicClient.getChainId()) !== FUTURES_TESTNET_CHAIN_ID)
  throw new Error("refusing non-testnet deployment");
const startingNonce = BigInt(
  await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  }),
);
const plan = buildFuturesDeploymentPlan(account.address, startingNonce);
const byName = Object.fromEntries(plan.map((entry) => [entry.contract, entry]));
const { artifacts, compiler } = compileFuturesTestnet(root);
const constructorArgs = {
  RiskEngine: [],
  ClearingHouse: [
    config.testUsdt,
    byName.RiskEngine.address,
    byName.OrderBook.address,
    byName.SafetyController.address,
    config.revenueRecipient,
    BigInt(config.totalLiabilityCap),
    BigInt(config.accountEquityCap),
    BigInt(config.matchedOpenInterestCap),
  ],
  FuturesOracle: [
    config.pair,
    config.bnbUsdFeed,
    config.testBnbx,
    config.wbnb,
    byName.SafetyController.address,
  ],
  SafetyController: [
    config.guardian,
    byName.ClearingHouse.address,
    byName.FuturesOracle.address,
  ],
  OrderBook: [
    byName.ClearingHouse.address,
    byName.RiskEngine.address,
    byName.FuturesOracle.address,
  ],
};
const normalize = (value) =>
  typeof value === "bigint" ? value.toString() : value;
const entries = [];
for (const planned of plan) {
  const artifact = artifacts[planned.contract];
  const args = constructorArgs[planned.contract];
  const gas = await publicClient.estimateContractGas({
    account,
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
  });
  const transactionHash = await walletClient.deployContract({
    account,
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
    gas: (gas * 12n) / 10n,
    nonce: Number(planned.nonce),
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 2,
  });
  if (
    receipt.status !== "success" ||
    receipt.contractAddress?.toLowerCase() !== planned.address.toLowerCase()
  )
    throw new Error(`${planned.contract} deterministic address mismatch`);
  const deployed = await publicClient.getBytecode({ address: planned.address });
  if (!deployed || deployed === "0x")
    throw new Error(`${planned.contract} deployed without runtime code`);
  const runtimeBytes = (deployed.length - 2) / 2;
  if (runtimeBytes > 24_576)
    throw new Error(`${planned.contract} exceeds EIP-170`);
  entries.push({
    contract: planned.contract,
    source: planned.source,
    address: planned.address,
    nonce: planned.nonce.toString(),
    transactionHash,
    constructorArgs: args.map(normalize),
    constructorArgsEncoded: encodeConstructorArgs(artifact, args),
    runtimeBytes,
    runtimeBytecodeHash: artifact.runtimeBytecodeHash,
    deployedRuntimeBytecodeHash: sha256Bytecode(deployed),
  });
}
const manifest = {
  schema: "bnbx-futures-testnet-deployment/v1",
  chainId: FUTURES_TESTNET_CHAIN_ID,
  deployedAt: new Date().toISOString(),
  deployer: account.address,
  assets: {
    testUsdt: config.testUsdt,
    testBnbx: config.testBnbx,
    wbnb: config.wbnb,
    pair: config.pair,
    bnbUsdFeed: config.bnbUsdFeed,
  },
  roles: {
    guardian: config.guardian,
    revenueRecipient: config.revenueRecipient,
  },
  caps: {
    totalLiability: config.totalLiabilityCap,
    accountEquity: config.accountEquityCap,
    matchedOpenInterest: config.matchedOpenInterestCap,
  },
  compiler,
  settings: FUTURES_COMPILER_SETTINGS,
  entries,
};
assertFuturesTestnetManifest(manifest, artifacts);
const directory = resolve(root, "deployments");
mkdirSync(directory, { recursive: true });
const target = resolve(directory, "bsc-testnet-futures.json");
const staging = `${target}.${createHash("sha256").update(manifest.deployedAt).digest("hex").slice(0, 12)}.tmp`;
writeFileSync(staging, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx",
});
renameSync(staging, target);
console.log(JSON.stringify(manifest, null, 2));
