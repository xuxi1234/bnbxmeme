import { NextRequest, NextResponse } from "next/server";
import { formatEther, isAddress, parseAbiItem, zeroAddress } from "viem";
import {
  CHAIN_INDEX_VERSION,
  applyTransferDeltas,
  canServeStaleIndex,
  exactCheckpointFilter,
  indexCoversCheckpoint,
  isCompatibleIndexState,
  isExpectedWrappedPair,
  materializeHolders,
  mergeIndexedTrades,
  pricePerMillionBnb,
  resolveOfficialMarketPair,
  resolveEffectiveScanCheckpoint,
  resolveSwapAccount,
  resolveScanWindow,
  summarizeTrades,
  verifiedReservePrice,
  type ChainIndexIdentity,
  type ChainIndexState,
  type IndexedTrade,
  type IndexedTokenTransfer,
} from "@/lib/chain-data-core";
import {
  MAX_CHAIN_DATA_BACKFILL_BLOCKS,
  classifyCacheTimestamp,
  normalizeChainDataMode,
  type ChainDataMode,
} from "@/lib/chain-data-cost-policy";
import {
  buildClaimedRefreshTimestamp,
  buildRefreshLeaseFilters,
  canAttemptRefreshLease,
} from "@/lib/chain-data-refresh-lease";
import { officialFactoryAddresses } from "@/lib/deployments";
import { resolveFactoryDeploymentBlock } from "@/lib/factory-deployment-blocks";
import {
  serverLogClient as logClient,
  serverPublicClient as client,
} from "@/lib/server-chain";
import { createInFlightRequestCoalescer } from "@/lib/server-request-coalescing";
import { validateTokenProject } from "@/lib/token-project-server";
import { findContractCreationBlock } from "@/lib/token-creation-block";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, uint256 grossBNB, uint256 feeBNB, uint256 netBNB, uint256 tokensOut, uint256 refundBNB)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, uint256 tokensIn, uint256 grossBNB, uint256 feeBNB, uint256 netBNB)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const graduatedEvent = parseAbiItem(
  "event Graduated(address indexed pair, uint256 bnbLiquidity, uint256 tokenLiquidity)",
);
const swapEvent = parseAbiItem(
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);
const LOG_BLOCK_RANGE = 10_000n;
const LP_BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const coalesceChainDataRequest =
  createInFlightRequestCoalescer<NextResponse>();

type MarketSnapshot = {
  source: "curve" | "pancake";
  priceSource: "reserve";
  pricePerMillionBnb: number | null;
  volume24hBnb: number | null;
  priceChange24h: number | null;
  liquidityBnb: number | null;
  buys24h: number | null;
  sells24h: number | null;
  graduatedAt: number | null;
};

type ChainDataPayload = {
  trades: IndexedTrade[];
  holders: Array<{ address: string; balance: string }>;
  holderCount?: number;
  holdersLimited?: boolean;
  holderSupply?: string;
  top10ConcentrationPct?: number | null;
  market?: MarketSnapshot;
  bnbUsd: number;
  refreshedAt?: string;
  latestBlock?: string;
  index?: {
    version: typeof CHAIN_INDEX_VERSION;
    status: "backfilling" | "complete";
    deploymentBlock: string;
    latestBlock: string;
    chainHead: string;
  };
  _index?: ChainIndexState;
};

type ChainDataCacheRow = {
  payload: ChainDataPayload;
  refreshed_at: string;
  latest_block: number | string;
};

const pairReadAbi = [
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
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
] as const;

const curveReserveReadAbi = [
  {
    type: "function",
    name: "virtualBNBReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "virtualTokenReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "liquidityPair",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "wbnb",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function cacheHeaders() {
  const headers: Record<string, string> = {
    apikey: supabaseSecret!,
    "Content-Type": "application/json",
  };
  // Legacy service-role keys are JWTs and may be used as a bearer token.
  // Supabase's newer sb_secret_* keys authenticate through apikey only.
  if (supabaseSecret?.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${supabaseSecret}`;
  }
  return headers;
}

async function readCachedChainData(curveAddress: string) {
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("Chain cache is not configured");
  }
  const query = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  query.searchParams.set("chain_id", "eq.56");
  query.searchParams.set("curve_address", `eq.${curveAddress.toLowerCase()}`);
  query.searchParams.set("select", "payload,refreshed_at,latest_block");
  query.searchParams.set("limit", "1");
  const response = await fetch(query, {
    headers: cacheHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Chain cache read failed with status ${response.status}`);
  }
  const rows = (await response.json()) as ChainDataCacheRow[];
  return rows[0] ?? null;
}

async function writeCachedChainData(
  curveAddress: string,
  tokenAddress: string | null,
  latestBlock: bigint,
  payload: ChainDataPayload,
  expectedLatestBlock: string,
  expectedRefreshedAt: string,
) {
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error("Chain cache is not configured");
  }
  const endpoint = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  const row = {
    chain_id: 56,
    curve_address: curveAddress.toLowerCase(),
    token_address: tokenAddress?.toLowerCase() ?? null,
    latest_block: latestBlock.toString(),
    payload,
    refreshed_at: new Date().toISOString(),
  };

  // The final write owns both the scanned checkpoint and the exact lease.
  // This prevents an expired worker from overwriting a newer refresh.
  endpoint.searchParams.set("chain_id", "eq.56");
  endpoint.searchParams.set(
    "curve_address",
    `eq.${curveAddress.toLowerCase()}`,
  );
  endpoint.searchParams.set(
    "latest_block",
    exactCheckpointFilter(expectedLatestBlock),
  );
  endpoint.searchParams.set("refreshed_at", `eq.${expectedRefreshedAt}`);
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      ...cacheHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    throw new Error(`Chain cache write failed with status ${response.status}`);
  }
  const updated = (await response.json()) as unknown[];
  return updated.length > 0;
}

async function claimExistingRefreshLease(
  curveAddress: string,
  cached: ChainDataCacheRow,
) {
  if (!supabaseUrl || !supabaseSecret) return null;
  if (!canAttemptRefreshLease(cached.refreshed_at)) return null;
  const claimedRefreshedAt = buildClaimedRefreshTimestamp();
  const endpoint = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  endpoint.searchParams.set("chain_id", "eq.56");
  endpoint.searchParams.set(
    "curve_address",
    `eq.${curveAddress.toLowerCase()}`,
  );
  const filters = buildRefreshLeaseFilters({
    latestBlock: String(cached.latest_block),
    refreshedAt: cached.refreshed_at,
  });
  endpoint.searchParams.set("latest_block", filters.latest_block);
  endpoint.searchParams.set("refreshed_at", filters.refreshed_at);
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { ...cacheHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ refreshed_at: claimedRefreshedAt }),
  });
  if (!response.ok) {
    throw new Error(`Chain cache lease failed with status ${response.status}`);
  }
  const claimed = (await response.json()) as unknown[];
  return claimed.length > 0 ? claimedRefreshedAt : null;
}

async function createColdRefreshLease(
  curveAddress: string,
  tokenAddress: string,
  latestBlock: bigint,
) {
  if (!supabaseUrl || !supabaseSecret) return null;
  const claimedRefreshedAt = buildClaimedRefreshTimestamp();
  const endpoint = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "chain_id,curve_address");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...cacheHeaders(),
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify({
      chain_id: 56,
      curve_address: curveAddress.toLowerCase(),
      token_address: tokenAddress.toLowerCase(),
      latest_block: latestBlock.toString(),
      payload: { trades: [], holders: [], bnbUsd: 0 },
      refreshed_at: claimedRefreshedAt,
    }),
  });
  if (!response.ok) {
    throw new Error(`Chain cache lease insert failed with status ${response.status}`);
  }
  const inserted = (await response.json()) as unknown[];
  return inserted.length > 0 ? claimedRefreshedAt : null;
}

async function getBoughtLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    const end =
      start + LOG_BLOCK_RANGE - 1n < toBlock
        ? start + LOG_BLOCK_RANGE - 1n
        : toBlock;
    logs.push(
      ...(await logClient.getLogs({
        address,
        event: boughtEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

async function getSoldLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    const end =
      start + LOG_BLOCK_RANGE - 1n < toBlock
        ? start + LOG_BLOCK_RANGE - 1n
        : toBlock;
    logs.push(
      ...(await logClient.getLogs({
        address,
        event: soldEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

async function getTransferLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    const end =
      start + LOG_BLOCK_RANGE - 1n < toBlock
        ? start + LOG_BLOCK_RANGE - 1n
        : toBlock;
    logs.push(
      ...(await logClient.getLogs({
        address,
        event: transferEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

async function getGraduatedLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    const end =
      start + LOG_BLOCK_RANGE - 1n < toBlock
        ? start + LOG_BLOCK_RANGE - 1n
        : toBlock;
    logs.push(
      ...(await logClient.getLogs({
        address,
        event: graduatedEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

async function getSwapLogs(
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    const end =
      start + LOG_BLOCK_RANGE - 1n < toBlock
        ? start + LOG_BLOCK_RANGE - 1n
        : toBlock;
    logs.push(
      ...(await logClient.getLogs({
        address,
        event: swapEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

async function readPairSnapshot(
  pairAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
  wrappedNativeAddress: `0x${string}`,
  blockNumber: bigint,
) {
  const [token0, token1, reserves] = await Promise.all([
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "token0",
      blockNumber,
    }),
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "token1",
      blockNumber,
    }),
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "getReserves",
      blockNumber,
    }),
  ]);
  if (
    !isExpectedWrappedPair({
      token0,
      token1,
      token: tokenAddress,
      wrappedNative: wrappedNativeAddress,
    })
  ) {
    return null;
  }
  const tokenIs0 = token0.toLowerCase() === tokenAddress.toLowerCase();
  const tokenReserve = tokenIs0 ? reserves[0] : reserves[1];
  const bnbReserve = tokenIs0 ? reserves[1] : reserves[0];
  const bnb = Number(formatEther(bnbReserve));
  const currentPrice = pricePerMillionBnb(bnbReserve, tokenReserve);
  if (currentPrice === null || bnb <= 0) return null;
  return {
    token0,
    token1,
    tokenIs0,
    pricePerMillionBnb: currentPrice,
    liquidityBnb: bnb * 2,
  };
}

async function readCurveMarketConfig(curveAddress: `0x${string}`) {
  const [state, liquidityPair, wrappedNative] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: curveAddress,
        abi: curveReserveReadAbi,
        functionName: "state",
      },
      {
        address: curveAddress,
        abi: curveReserveReadAbi,
        functionName: "liquidityPair",
      },
      {
        address: curveAddress,
        abi: curveReserveReadAbi,
        functionName: "wbnb",
      },
    ],
  });
  return { state, liquidityPair, wrappedNative };
}

async function readCurvePrice(
  curveAddress: `0x${string}`,
  blockNumber: bigint,
) {
  const [bnbReserve, tokenReserve] = await Promise.all([
    client.readContract({
      address: curveAddress,
      abi: curveReserveReadAbi,
      functionName: "virtualBNBReserve",
      blockNumber,
    }),
    client.readContract({
      address: curveAddress,
      abi: curveReserveReadAbi,
      functionName: "virtualTokenReserve",
      blockNumber,
    }),
  ]);
  return pricePerMillionBnb(bnbReserve, tokenReserve);
}

async function getBnbUsdPrice() {
  const [binance, coinGecko] = await Promise.all([
    fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
      next: { revalidate: 60 },
    }).catch(() => null),
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd",
      { next: { revalidate: 60 } },
    ).catch(() => null),
  ]);
  if (binance?.ok) {
    const data = (await binance.json()) as { price?: string };
    const price = Number(data.price);
    if (Number.isFinite(price) && price > 0) return price;
  }
  if (coinGecko?.ok) {
    const data = (await coinGecko.json()) as {
      binancecoin?: { usd?: number };
    };
    const price = Number(data.binancecoin?.usd);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return 0;
}

function publicPayload(payload: ChainDataPayload, chainHead: bigint) {
  const { _index: state, ...visible } = payload;
  const safeVisible = visible.market
    ? {
        ...visible,
        market: {
          ...visible.market,
          pricePerMillionBnb: verifiedReservePrice(visible.market),
        },
      }
    : visible;
  if (!state) return safeVisible;
  return {
    ...safeVisible,
    index: {
      version: CHAIN_INDEX_VERSION,
      status: state.complete ? ("complete" as const) : ("backfilling" as const),
      deploymentBlock: state.deploymentBlock,
      latestBlock: state.latestBlock,
      chainHead: chainHead.toString(),
    },
  };
}

function backfillResponse(
  payload: ChainDataPayload,
  state: ChainIndexState,
  chainHead: bigint,
) {
  return {
    ...publicPayload(payload, chainHead),
    code: "CHAIN_INDEX_BACKFILLING",
    index: {
      version: CHAIN_INDEX_VERSION,
      status: "backfilling" as const,
      deploymentBlock: state.deploymentBlock,
      latestBlock: state.latestBlock,
      chainHead: chainHead.toString(),
    },
  };
}

function compatibleCachedIndex(
  cached: ChainDataCacheRow | null,
  curve: `0x${string}`,
  token: `0x${string}`,
  pair: `0x${string}` | null,
) {
  if (!cached) return null;
  for (const factory of officialFactoryAddresses) {
    const deploymentBlock = resolveFactoryDeploymentBlock(factory);
    if (deploymentBlock === null) continue;
    const identity: ChainIndexIdentity = {
      factory,
      token,
      curve,
      pair,
      deploymentBlock: deploymentBlock.toString(),
    };
    if (isCompatibleIndexState(cached.payload._index, identity)) {
      return cached.payload._index;
    }
  }
  return null;
}

function chainCacheUnavailable() {
  return NextResponse.json(
    {
      code: "CHAIN_CACHE_UNAVAILABLE",
      error: "Cached chain data is temporarily unavailable",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function serveCachedChainData(
  cached: ChainDataCacheRow,
  cachedIndex: ChainIndexState,
) {
  const timestampState = classifyCacheTimestamp(cached.refreshed_at);
  if (!cachedIndex.complete) {
    if (!cached.payload.market) return chainCacheUnavailable();
    return NextResponse.json(
      backfillResponse(
        cached.payload,
        cachedIndex,
        BigInt(cachedIndex.latestBlock),
      ),
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "60",
          "X-BNBX-Chain-Cache":
            timestampState === "fresh" ? "HIT" : "STALE",
          "X-BNBX-Chain-Index": "BACKFILLING",
        },
      },
    );
  }
  return NextResponse.json(
    publicPayload(cached.payload, BigInt(cachedIndex.latestBlock)),
    {
      headers: {
        "Cache-Control":
          timestampState === "fresh"
            ? "public, s-maxage=60, stale-while-revalidate=300"
            : "public, s-maxage=30, stale-while-revalidate=300",
        ...(timestampState === "fresh"
          ? {}
          : { Warning: '110 - "Serving stale chain cache"' }),
        "X-BNBX-Chain-Cache":
          timestampState === "fresh" ? "HIT" : "STALE",
        "X-BNBX-Chain-Index": "COMPLETE",
      },
    },
  );
}

async function handleChainDataRequest(
  request: NextRequest,
  mode: ChainDataMode,
) {
  const curve = request.nextUrl.searchParams.get("curve");
  const token = request.nextUrl.searchParams.get("token");
  const pair = request.nextUrl.searchParams.get("pair");
  if (
    !curve ||
    !isAddress(curve) ||
    !token ||
    !isAddress(token) ||
    (pair && !isAddress(pair))
  ) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!supabaseUrl || !supabaseSecret) return chainCacheUnavailable();
  const requestedCurve = curve as `0x${string}`;
  const requestedToken = token as `0x${string}`;
  const requestedPair = pair as `0x${string}` | null;
  let cached: ChainDataCacheRow | null;
  try {
    cached = await readCachedChainData(requestedCurve);
  } catch {
    return chainCacheUnavailable();
  }
  let cachedIndex = compatibleCachedIndex(
    cached,
    requestedCurve,
    requestedToken,
    requestedPair,
  );

  if (mode === "cache") {
    return cached && cachedIndex
      ? serveCachedChainData(cached, cachedIndex)
      : chainCacheUnavailable();
  }

  if (
    cached &&
    cachedIndex?.complete &&
    cached.payload.market?.priceSource === "reserve" &&
    classifyCacheTimestamp(cached.refreshed_at) === "fresh"
  ) {
    return serveCachedChainData(cached, cachedIndex);
  }

  let claimedRefreshedAt: string | null = null;
  let claimedLatestBlock: string | null = null;
  if (cached && cachedIndex) {
    try {
      claimedRefreshedAt = await claimExistingRefreshLease(
        requestedCurve,
        cached,
      );
    } catch {
      return serveCachedChainData(cached, cachedIndex);
    }
    if (!claimedRefreshedAt) {
      const concurrent = await readCachedChainData(requestedCurve).catch(
        () => cached,
      );
      const concurrentIndex = compatibleCachedIndex(
        concurrent,
        requestedCurve,
        requestedToken,
        requestedPair,
      );
      return concurrent && concurrentIndex
        ? serveCachedChainData(concurrent, concurrentIndex)
        : chainCacheUnavailable();
    }
    claimedLatestBlock = String(cached.latest_block);
  }

  const project = await validateTokenProject(token);
  if (project.status === "not_found") {
    return NextResponse.json(
      {
        code: "PROJECT_NOT_FOUND",
        error: "Token is not registered by an official BNBX Factory",
      },
      { status: 404 },
    );
  }
  if (project.status === "unavailable") {
    return NextResponse.json(
      {
        code: "PROJECT_VALIDATION_UNAVAILABLE",
        error: "BNB Chain project validation is temporarily unavailable",
      },
      { status: 503 },
    );
  }
  if (project.curve.toLowerCase() !== curve.toLowerCase()) {
    return NextResponse.json(
      {
        code: "PROJECT_CURVE_MISMATCH",
        error: "Curve does not belong to this BNBX project",
      },
      { status: 404 },
    );
  }

  const curveAddress = project.curve;
  const tokenAddress = project.token;
  let curveMarketConfig: Awaited<ReturnType<typeof readCurveMarketConfig>>;
  try {
    curveMarketConfig = await readCurveMarketConfig(curveAddress);
  } catch {
    return NextResponse.json(
      {
        code: "PROJECT_MARKET_CONFIG_UNAVAILABLE",
        error: "BNB Chain market configuration is temporarily unavailable",
      },
      { status: 503 },
    );
  }
  const pairResolution = resolveOfficialMarketPair({
    state: curveMarketConfig.state,
    officialPair: curveMarketConfig.liquidityPair,
    requestedPair,
  });
  if (pairResolution.status === "mismatch") {
    return NextResponse.json(
      {
        code: "PROJECT_PAIR_MISMATCH",
        error: "Pair does not match the active BNBX project market",
      },
      { status: 404 },
    );
  }
  if (pairResolution.status === "unavailable") {
    return NextResponse.json(
      {
        code: "PROJECT_MARKET_CONFIG_UNAVAILABLE",
        error: "BNB Chain market configuration is temporarily unavailable",
      },
      { status: 503 },
    );
  }
  const pairAddress = pairResolution.pair;
  const deploymentBlock = resolveFactoryDeploymentBlock(project.factory);
  if (deploymentBlock === null) {
    return NextResponse.json(
      {
        code: "FACTORY_DEPLOYMENT_BLOCK_UNKNOWN",
        error: "Chain data is temporarily unavailable",
      },
      { status: 503 },
    );
  }

  const identity: ChainIndexIdentity = {
    factory: project.factory,
    token: tokenAddress,
    curve: curveAddress,
    pair: pairAddress,
    deploymentBlock: deploymentBlock.toString(),
  };
  cachedIndex =
    cached && isCompatibleIndexState(cached.payload._index, identity)
      ? cached.payload._index
      : null;

  if (!claimedRefreshedAt || !claimedLatestBlock) {
    try {
      if (cached) {
        claimedRefreshedAt = await claimExistingRefreshLease(
          curveAddress,
          cached,
        );
        claimedLatestBlock = claimedRefreshedAt
          ? String(cached.latest_block)
          : null;
      } else {
        const initialCheckpoint = deploymentBlock - 1n;
        claimedRefreshedAt = await createColdRefreshLease(
          curveAddress,
          tokenAddress,
          initialCheckpoint,
        );
        claimedLatestBlock = claimedRefreshedAt
          ? initialCheckpoint.toString()
          : null;
      }
    } catch {
      claimedRefreshedAt = null;
      claimedLatestBlock = null;
    }
    if (!claimedRefreshedAt || !claimedLatestBlock) {
      const concurrent = await readCachedChainData(curveAddress).catch(
        () => null,
      );
      const concurrentIndex = compatibleCachedIndex(
        concurrent,
        curveAddress,
        tokenAddress,
        pairAddress,
      );
      return concurrent && concurrentIndex
        ? serveCachedChainData(concurrent, concurrentIndex)
        : chainCacheUnavailable();
    }
  }

  try {
    const latest = await client.getBlockNumber();
    if (cachedIndex && BigInt(cachedIndex.latestBlock) > latest) {
      if (cachedIndex.complete) {
        return NextResponse.json(
          publicPayload(cached!.payload, BigInt(cachedIndex.latestBlock)),
          {
            headers: {
              "Cache-Control":
                "public, s-maxage=30, stale-while-revalidate=300",
              Warning: '110 - "Serving stale chain cache"',
              "X-BNBX-Chain-Cache": "STALE",
              "X-BNBX-Chain-Index": "COMPLETE",
            },
          },
        );
      }
      throw new Error("RPC chain head is behind the index checkpoint");
    }

    const scanStartBlock = cachedIndex?.scanStartBlock
      ? BigInt(cachedIndex.scanStartBlock)
      : await findContractCreationBlock({
          client,
          address: tokenAddress,
          lowerBound: deploymentBlock,
          upperBound: latest,
        });
    if (scanStartBlock === null) {
      throw new Error("Token contract creation block was not found");
    }
    const cachedCheckpoint = cachedIndex
      ? BigInt(cachedIndex.latestBlock)
      : null;
    const checkpointBlock = resolveEffectiveScanCheckpoint({
      cachedCheckpoint,
      scanStartBlock,
      hasIndexedHistory: Boolean(
        cachedIndex &&
          (cached!.payload.trades.length > 0 ||
            Object.keys(cachedIndex.holderBalances).length > 0 ||
            cachedIndex.graduatedAt !== null),
      ),
    });
    const scanWindow = resolveScanWindow({
      deploymentBlock: scanStartBlock,
      checkpointBlock,
      chainHead: latest,
      maxBlocks: MAX_CHAIN_DATA_BACKFILL_BLOCKS,
    });
    const scanPromise = scanWindow.shouldScan
      ? Promise.all([
          getBoughtLogs(curveAddress, scanWindow.fromBlock, scanWindow.toBlock),
          getSoldLogs(curveAddress, scanWindow.fromBlock, scanWindow.toBlock),
          getTransferLogs(
            tokenAddress,
            scanWindow.fromBlock,
            scanWindow.toBlock,
          ),
          getGraduatedLogs(
            curveAddress,
            scanWindow.fromBlock,
            scanWindow.toBlock,
          ),
          pairAddress
            ? getSwapLogs(pairAddress, scanWindow.fromBlock, scanWindow.toBlock)
            : Promise.resolve([] as Awaited<ReturnType<typeof getSwapLogs>>),
        ] as const)
      : Promise.resolve([
          [] as Awaited<ReturnType<typeof getBoughtLogs>>,
          [] as Awaited<ReturnType<typeof getSoldLogs>>,
          [] as Awaited<ReturnType<typeof getTransferLogs>>,
          [] as Awaited<ReturnType<typeof getGraduatedLogs>>,
          [] as Awaited<ReturnType<typeof getSwapLogs>>,
        ] as const);
    const [latestBlock, scanResults, pairSnapshot, curvePrice, bnbUsd] =
      await Promise.all([
        client.getBlock({ blockNumber: latest }),
        scanPromise,
        pairAddress
          ? readPairSnapshot(
              pairAddress,
              tokenAddress,
              curveMarketConfig.wrappedNative,
              latest,
            ).then((snapshot) => {
              if (!snapshot) {
                throw new Error(
                  "Official Pair does not match token and wrapped native asset",
                );
              }
              return snapshot;
            })
          : Promise.resolve(null),
        pairAddress
          ? Promise.resolve(null)
          : readCurvePrice(curveAddress, latest).catch(() => null),
        getBnbUsdPrice(),
      ]);
    const [buys, sells, transfers, graduations, swaps] = scanResults;
    const indexedTransfers: IndexedTokenTransfer[] = transfers.map((log) => ({
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      from:
        log.args.from &&
        log.args.from.toLowerCase() !== zeroAddress.toLowerCase()
          ? log.args.from
          : null,
      to:
        log.args.to && log.args.to.toLowerCase() !== zeroAddress.toLowerCase()
          ? log.args.to
          : null,
      value: (log.args.value ?? 0n).toString(),
    }));
    const transfersByTransaction = new Map<string, IndexedTokenTransfer[]>();
    for (const transfer of indexedTransfers) {
      const transactionHash = transfer.transactionHash.toLowerCase();
      const transactionTransfers = transfersByTransaction.get(transactionHash);
      if (transactionTransfers) transactionTransfers.push(transfer);
      else transfersByTransaction.set(transactionHash, [transfer]);
    }

    const uniqueTradeBlocks = [
      ...new Set(
        [...buys, ...sells, ...swaps, ...graduations].map((log) =>
          log.blockNumber.toString(),
        ),
      ),
    ]
      .map(BigInt)
      .sort((left, right) => (left < right ? -1 : 1))
      .slice(-80);
    const exactBlocks = await Promise.all(
      uniqueTradeBlocks.map((blockNumber) =>
        logClient.getBlock({ blockNumber }).catch(() => null),
      ),
    );
    const exactTimestamps = new Map(
      exactBlocks.flatMap((block) =>
        block
          ? [[block.number.toString(), Number(block.timestamp)] as const]
          : [],
      ),
    );
    const tradeTimestamp = (blockNumber: bigint) =>
      exactTimestamps.get(blockNumber.toString()) ??
      Number(latestBlock.timestamp) -
        Math.floor(Number(latest - blockNumber) * 0.45);
    const curveTrades: IndexedTrade[] = [
      ...buys.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "buy" as const,
        source: "curve" as const,
        account: log.args.buyer ?? zeroAddress,
        bnb: (log.args.grossBNB ?? 0n).toString(),
        priceBNB: (log.args.netBNB ?? 0n).toString(),
        tokens: (log.args.tokensOut ?? 0n).toString(),
        timestamp: tradeTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
      ...sells.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "sell" as const,
        source: "curve" as const,
        account: log.args.seller ?? zeroAddress,
        bnb: (log.args.netBNB ?? 0n).toString(),
        priceBNB: (log.args.grossBNB ?? 0n).toString(),
        tokens: (log.args.tokensIn ?? 0n).toString(),
        timestamp: tradeTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
    ];
    const pancakeTrades: IndexedTrade[] = pairSnapshot
      ? swaps.flatMap((log) => {
          const tokenIn = pairSnapshot.tokenIs0
            ? (log.args.amount0In ?? 0n)
            : (log.args.amount1In ?? 0n);
          const tokenOut = pairSnapshot.tokenIs0
            ? (log.args.amount0Out ?? 0n)
            : (log.args.amount1Out ?? 0n);
          const bnbIn = pairSnapshot.tokenIs0
            ? (log.args.amount1In ?? 0n)
            : (log.args.amount0In ?? 0n);
          const bnbOut = pairSnapshot.tokenIs0
            ? (log.args.amount1Out ?? 0n)
            : (log.args.amount0Out ?? 0n);
          const isBuy = bnbIn > 0n && tokenOut > 0n;
          const isSell = tokenIn > 0n && bnbOut > 0n;
          if (!isBuy && !isSell) return [];
          const bnb = isBuy ? bnbIn : bnbOut;
          const tokensOutOrIn = isBuy ? tokenOut : tokenIn;
          const side = isBuy ? ("buy" as const) : ("sell" as const);
          return [
            {
              id: `${log.transactionHash}-${log.logIndex}`,
              side,
              source: "pancake" as const,
              account:
                resolveSwapAccount({
                  transactionHash: log.transactionHash,
                  swapLogIndex: log.logIndex,
                  side,
                  pair: pairAddress!,
                  tokenAmount: tokensOutOrIn.toString(),
                  fallbackRecipient: log.args.to,
                  transfers:
                    transfersByTransaction.get(
                      log.transactionHash.toLowerCase(),
                    ) ?? [],
                }) ?? zeroAddress,
              bnb: bnb.toString(),
              priceBNB: bnb.toString(),
              tokens: tokensOutOrIn.toString(),
              timestamp: tradeTimestamp(log.blockNumber),
              blockNumber: log.blockNumber.toString(),
              transactionHash: log.transactionHash,
            },
          ];
        })
      : [];
    const trades = mergeIndexedTrades(
      cachedIndex ? cached!.payload.trades : [],
      [...curveTrades, ...pancakeTrades],
    );
    const holderBalances = applyTransferDeltas(
      cachedIndex ? cachedIndex.holderBalances : {},
      indexedTransfers,
    );
    const holderSnapshot = materializeHolders(holderBalances, [
      curveAddress,
      pairAddress,
      LP_BURN_ADDRESS,
      zeroAddress,
    ]);
    const graduatedAt =
      graduations.length > 0
        ? tradeTimestamp(graduations.at(-1)!.blockNumber)
        : (cachedIndex?.graduatedAt ?? null);
    const cutoff24h = Number(latestBlock.timestamp) - 86_400;
    const curveSummary = summarizeTrades(trades, "curve", cutoff24h);
    const pancakeSummary = summarizeTrades(trades, "pancake", cutoff24h);
    const market: MarketSnapshot = pairAddress
      ? {
          source: "pancake",
          priceSource: "reserve",
          pricePerMillionBnb:
            pairSnapshot?.pricePerMillionBnb ??
            pancakeSummary.latestPricePerMillionBnb,
          volume24hBnb: pancakeSummary.volume24hBnb,
          priceChange24h: pancakeSummary.priceChange24h,
          liquidityBnb: pairSnapshot?.liquidityBnb ?? null,
          buys24h: pancakeSummary.buys24h,
          sells24h: pancakeSummary.sells24h,
          graduatedAt,
        }
      : {
          source: "curve",
          priceSource: "reserve",
          pricePerMillionBnb:
            curvePrice ??
            (cached?.payload.market?.source === "curve"
              ? verifiedReservePrice(cached.payload.market)
              : null),
          volume24hBnb: curveSummary.volume24hBnb,
          priceChange24h: curveSummary.priceChange24h,
          liquidityBnb: null,
          buys24h: curveSummary.buys24h,
          sells24h: curveSummary.sells24h,
          graduatedAt,
        };
    const checkpoint = scanWindow.shouldScan
      ? scanWindow.toBlock
      : (checkpointBlock ?? latest);
    const indexState: ChainIndexState = {
      version: CHAIN_INDEX_VERSION,
      complete: scanWindow.complete,
      factory: project.factory,
      token: tokenAddress,
      curve: curveAddress,
      pair: pairAddress,
      deploymentBlock: deploymentBlock.toString(),
      scanStartBlock: scanStartBlock.toString(),
      latestBlock: checkpoint.toString(),
      holderBalances,
      graduatedAt,
    };
    const payload: ChainDataPayload = {
      trades,
      ...holderSnapshot,
      market,
      bnbUsd: bnbUsd > 0 ? bnbUsd : (cached?.payload.bnbUsd ?? 0),
      refreshedAt: new Date().toISOString(),
      latestBlock: checkpoint.toString(),
      _index: indexState,
    };
    const cacheWriteWon = await writeCachedChainData(
      curveAddress,
      tokenAddress,
      checkpoint,
      payload,
      claimedLatestBlock,
      claimedRefreshedAt,
    );
    if (!cacheWriteWon) {
      const concurrent = await readCachedChainData(curveAddress);
      const concurrentIndex =
        concurrent &&
        isCompatibleIndexState(concurrent.payload._index, identity)
          ? concurrent.payload._index
          : null;
      if (
        !concurrent ||
        !concurrentIndex ||
        !indexCoversCheckpoint(concurrentIndex, checkpoint)
      ) {
        throw new Error("Concurrent chain cache checkpoint is not usable");
      }
      if (!concurrentIndex.complete) {
        const concurrentMarket = concurrent.payload.market;
        if (!concurrentMarket) {
          throw new Error("Concurrent chain cache market data is missing");
        }
        return NextResponse.json(
          backfillResponse(
            concurrent.payload,
            concurrentIndex,
            latest,
          ),
          {
            status: 202,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "60",
              "X-BNBX-Chain-Cache": "CONCURRENT",
              "X-BNBX-Chain-Index": "BACKFILLING",
            },
          },
        );
      }
      return NextResponse.json(publicPayload(concurrent.payload, latest), {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
          "X-BNBX-Chain-Cache": "CONCURRENT",
          "X-BNBX-Chain-Index": "COMPLETE",
        },
      });
    }

    if (!indexState.complete) {
      return NextResponse.json(
        backfillResponse(payload, indexState, latest),
        {
          status: 202,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60",
            "X-BNBX-Chain-Index": "BACKFILLING",
          },
        },
      );
    }
    return NextResponse.json(publicPayload(payload, latest), {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        "X-BNBX-Chain-Index": "COMPLETE",
      },
    });
  } catch {
    // Re-read after a failed scan because a concurrent request may have
    // completed a newer checkpoint while this request was running.
    cached = await readCachedChainData(curveAddress).catch(() => cached);
    cachedIndex =
      cached && isCompatibleIndexState(cached.payload._index, identity)
        ? cached.payload._index
        : null;
    if (cached && canServeStaleIndex(cachedIndex)) {
      return NextResponse.json(
        publicPayload(cached.payload, BigInt(cachedIndex!.latestBlock)),
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
            Warning: '110 - "Serving stale chain cache"',
            "X-BNBX-Chain-Cache": "STALE",
            "X-BNBX-Chain-Index": "COMPLETE",
          },
        },
      );
    }
    return NextResponse.json(
      // Do not expose provider URLs, request bodies, or upstream diagnostics
      // because a private RPC credential may be embedded in the configured URL.
      {
        code: cachedIndex
          ? "CHAIN_INDEX_BACKFILL_UNAVAILABLE"
          : "CHAIN_DATA_UNAVAILABLE",
        error: "Chain data is temporarily unavailable",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  let mode: ChainDataMode;
  try {
    mode = normalizeChainDataMode(request.nextUrl.searchParams.get("mode"));
  } catch {
    return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
  }
  const curve = request.nextUrl.searchParams.get("curve");
  const token = request.nextUrl.searchParams.get("token");
  const pair = request.nextUrl.searchParams.get("pair");
  if (
    !curve ||
    !isAddress(curve) ||
    !token ||
    !isAddress(token) ||
    (pair && !isAddress(pair))
  ) {
    return handleChainDataRequest(request, mode);
  }

  const key = [curve, token, pair ?? ""]
    .map((address) => address.toLowerCase())
    .join(":");
  const response = await coalesceChainDataRequest(key, () =>
    handleChainDataRequest(request, mode),
  );
  return response.clone();
}
