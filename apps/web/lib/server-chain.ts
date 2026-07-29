import "server-only";

import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";

function configuredRpcUrls() {
  const candidates = [
    process.env.BSC_MAINNET_RPC_URL,
    process.env.BSC_LOG_RPC_URL,
    process.env.ALCHEMY_BSC_RPC_URL,
    ...(process.env.BSC_MAINNET_RPC_URLS?.split(",") ?? []),
  ];

  return [...new Set(candidates.map((value) => value?.trim()).filter(Boolean))] as string[];
}

export const serverPublicClient = createPublicClient({
  chain: bsc,
  transport: fallback(
    [
      ...configuredRpcUrls().map((url) =>
        http(url, {
          timeout: 20_000,
          retryCount: 2,
          batch: { batchSize: 50, wait: 10 },
        }),
      ),
      http("https://bsc-rpc.publicnode.com", {
        timeout: 12_000,
        retryCount: 1,
        batch: { batchSize: 50, wait: 10 },
      }),
      http("https://bsc.drpc.org", {
        timeout: 12_000,
        retryCount: 1,
        batch: { batchSize: 50, wait: 10 },
      }),
      http("https://bsc-dataseed.binance.org", {
        timeout: 12_000,
        retryCount: 1,
        batch: { batchSize: 50, wait: 10 },
      }),
    ],
    { rank: false },
  ),
});
