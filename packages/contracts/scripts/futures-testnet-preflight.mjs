import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  compileFuturesTestnet,
  FUTURES_TESTNET_CHAIN_ID,
  parseFuturesTestnetConfig,
} from "./futures-testnet-core.mjs";

const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
];
const pairAbi = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
  {
    type: "function",
    name: "price0CumulativeLast",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "price1CumulativeLast",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];
const feedAbi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint80" },
      { type: "int256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint80" },
    ],
  },
];

export async function validateFuturesOracleDependencies(client, config) {
  const block = await client.getBlock({ blockTag: "latest" });
  const [
    usdtDecimals,
    bnbxDecimals,
    wbnbDecimals,
    token0,
    token1,
    reserves,
    price0Cumulative,
    price1Cumulative,
    feedDecimals,
    round,
  ] = await Promise.all([
    client.readContract({
      address: config.testUsdt,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: config.testBnbx,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: config.wbnb,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    client.readContract({
      address: config.pair,
      abi: pairAbi,
      functionName: "token0",
    }),
    client.readContract({
      address: config.pair,
      abi: pairAbi,
      functionName: "token1",
    }),
    client.readContract({
      address: config.pair,
      abi: pairAbi,
      functionName: "getReserves",
    }),
    client.readContract({
      address: config.pair,
      abi: pairAbi,
      functionName: "price0CumulativeLast",
    }),
    client.readContract({
      address: config.pair,
      abi: pairAbi,
      functionName: "price1CumulativeLast",
    }),
    client.readContract({
      address: config.bnbUsdFeed,
      abi: feedAbi,
      functionName: "decimals",
    }),
    client.readContract({
      address: config.bnbUsdFeed,
      abi: feedAbi,
      functionName: "latestRoundData",
    }),
  ]);
  if (usdtDecimals !== 18 || bnbxDecimals !== 18 || wbnbDecimals !== 18)
    throw new Error("test assets must use 18 decimals");
  const tokens = new Set([token0.toLowerCase(), token1.toLowerCase()]);
  if (
    tokens.size !== 2 ||
    !tokens.has(config.testBnbx.toLowerCase()) ||
    !tokens.has(config.wbnb.toLowerCase())
  )
    throw new Error("test pair is not the explicit Test BNBX/WBNB pair");
  if (
    reserves[0] === 0n ||
    reserves[1] === 0n ||
    typeof price0Cumulative !== "bigint" ||
    typeof price1Cumulative !== "bigint"
  )
    throw new Error("test pair has invalid reserves or cumulative prices");
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  if (
    feedDecimals > 18 ||
    roundId === 0n ||
    answer <= 0n ||
    answeredInRound < roundId ||
    startedAt === 0n ||
    startedAt > updatedAt ||
    updatedAt > block.timestamp ||
    block.timestamp - updatedAt > 300n
  )
    throw new Error("BNB/USD test feed is invalid or stale");
  return { blockNumber: block.number, feedUpdatedAt: updatedAt };
}

export async function runFuturesTestnetPreflight(environment = process.env) {
  const root = resolve(import.meta.dirname, "..");
  const config = parseFuturesTestnetConfig(environment, {
    requireSecrets: true,
  });
  const account = privateKeyToAccount(config.privateKey);
  const chain = defineChain({
    id: FUTURES_TESTNET_CHAIN_ID,
    name: "BNB Smart Chain Testnet",
    nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const dryRun = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "futures-build.mjs")],
    { cwd: root, env: environment, encoding: "utf8" },
  );
  if (dryRun.status !== 0)
    throw new Error(dryRun.stderr || dryRun.stdout || "local dry-run failed");
  const compiled = compileFuturesTestnet(root);
  if ((await client.getChainId()) !== FUTURES_TESTNET_CHAIN_ID)
    throw new Error("RPC is not BSC Testnet chain 97");
  const balance = await client.getBalance({ address: account.address });
  if (balance < 50_000_000_000_000_000n)
    throw new Error("deployer requires at least 0.05 Test BNB");
  for (const [label, address] of Object.entries({
    testUsdt: config.testUsdt,
    testBnbx: config.testBnbx,
    wbnb: config.wbnb,
    pair: config.pair,
    bnbUsdFeed: config.bnbUsdFeed,
  })) {
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") throw new Error(`${label} has no testnet code`);
  }
  const oracleDependencies = await validateFuturesOracleDependencies(
    client,
    config,
  );
  return {
    account,
    balance,
    chain,
    client,
    compiled,
    config,
    oracleDependencies,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await runFuturesTestnetPreflight();
  console.log(
    JSON.stringify(
      {
        status: "READY",
        chainId: FUTURES_TESTNET_CHAIN_ID,
        deployer: result.account.address,
        balanceWei: result.balance.toString(),
        assetsValidated: true,
        oracleDependencies: {
          blockNumber: result.oracleDependencies.blockNumber.toString(),
          feedUpdatedAt: result.oracleDependencies.feedUpdatedAt.toString(),
        },
        localDryRun: true,
        sourceCompilerReady: true,
      },
      null,
      2,
    ),
  );
}
