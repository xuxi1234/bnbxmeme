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

  return [
    ...new Set(candidates.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

function configuredLogRpcUrls() {
  const candidates = [
    process.env.BSC_LOG_RPC_URL,
    process.env.ALCHEMY_BSC_RPC_URL,
    process.env.BSC_MAINNET_RPC_URL,
    ...(process.env.BSC_MAINNET_RPC_URLS?.split(",") ?? []),
  ];

  return [
    ...new Set(candidates.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

function rpcTransports(urls: string[]) {
  return [
    ...urls.map((url) =>
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
  ];
}

function freshStateRpcTransports() {
  const urls = [
    "https://bsc-dataseed.binance.org",
    "https://bsc.drpc.org",
    "https://bsc-rpc.publicnode.com",
    ...configuredRpcUrls(),
  ];
  return [...new Set(urls)].map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 1,
      batch: { batchSize: 50, wait: 10 },
    }),
  );
}

export const serverPublicClient = createPublicClient({
  chain: bsc,
  transport: fallback(rpcTransports(configuredRpcUrls()), { rank: false }),
});

// Catalog reads need the newest Factory counters and token state. A configured
// archive provider can return a successful but lagging response, which prevents
// viem's failure-based fallback from advancing to another transport.
export const serverFreshStateClient = createPublicClient({
  chain: bsc,
  transport: fallback(freshStateRpcTransports(), { rank: false }),
});

// Historical log scans must prefer the archive-capable endpoint. General RPCs
// remain fallbacks for current-state reads and environments without a dedicated
// log provider.
export const serverLogClient = createPublicClient({
  chain: bsc,
  transport: fallback(rpcTransports(configuredLogRpcUrls()), { rank: false }),
});
