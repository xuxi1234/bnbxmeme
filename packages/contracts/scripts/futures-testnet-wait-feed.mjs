import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, http } from "viem";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL?.trim();
const feed = process.env.FUTURES_TEST_BNB_USD_FEED?.trim();
if (!rpcUrl || !/^https:\/\//i.test(rpcUrl)) {
  throw new Error("BSC_TESTNET_RPC_URL must be an HTTPS URL");
}
if (!feed || !/^0x[0-9a-fA-F]{40}$/.test(feed)) {
  throw new Error("FUTURES_TEST_BNB_USD_FEED must be an address");
}

const maximumWaitSeconds = Number(
  process.env.FUTURES_FEED_WAIT_SECONDS ?? "5400",
);
if (!Number.isSafeInteger(maximumWaitSeconds) || maximumWaitSeconds < 1) {
  throw new Error("FUTURES_FEED_WAIT_SECONDS must be a positive integer");
}

const client = createPublicClient({ transport: http(rpcUrl) });
const abi = [
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
const deadline = Date.now() + maximumWaitSeconds * 1_000;

for (;;) {
  const [chainId, block, round] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockTag: "latest" }),
    client.readContract({
      address: feed,
      abi,
      functionName: "latestRoundData",
    }),
  ]);
  if (chainId !== 97) throw new Error("RPC is not BSC Testnet chain 97");
  const updatedAt = round[3];
  const age =
    updatedAt > block.timestamp ? undefined : block.timestamp - updatedAt;
  console.log(
    JSON.stringify({
      chainId,
      blockNumber: block.number.toString(),
      feedUpdatedAt: updatedAt.toString(),
      ageSeconds: age?.toString() ?? "future",
    }),
  );
  if (age !== undefined && age <= 30n) break;
  if (Date.now() >= deadline) {
    throw new Error("BNB/USD test feed did not refresh before the deadline");
  }
  await delay(15_000);
}

console.log("BNB/USD test feed is fresh; continuing immediately");
