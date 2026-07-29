import { NextRequest, NextResponse } from "next/server";
import {
  formatEther,
  isAddress,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { serverPublicClient as client } from "@/lib/server-chain";

export const dynamic = "force-dynamic";

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
const CACHE_MAX_AGE_MS = 10_000;
const LP_BURN_ADDRESS = "0x000000000000000000000000000000000000dead";

type MarketSnapshot = {
  source: "curve" | "pancake";
  pricePerMillionBnb: number | null;
  volume24hBnb: number | null;
  priceChange24h: number | null;
  liquidityBnb: number | null;
  buys24h: number | null;
  sells24h: number | null;
  graduatedAt: number | null;
};

type ChainDataPayload = {
  trades: Array<Record<string, unknown>>;
  holders: Array<{ address: string; balance: string }>;
  holderCount?: number;
  holdersLimited?: boolean;
  market?: MarketSnapshot;
  bnbUsd: number;
  refreshedAt?: string;
  latestBlock?: string;
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
  if (!supabaseUrl || !supabaseSecret) return null;
  const query = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  query.searchParams.set("chain_id", "eq.56");
  query.searchParams.set("curve_address", `eq.${curveAddress.toLowerCase()}`);
  query.searchParams.set("select", "payload,refreshed_at");
  query.searchParams.set("limit", "1");
  const response = await fetch(query, {
    headers: cacheHeaders(),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    payload: ChainDataPayload;
    refreshed_at: string;
  }>;
  return rows[0] ?? null;
}

async function writeCachedChainData(
  curveAddress: string,
  tokenAddress: string | null,
  latestBlock: bigint,
  payload: ChainDataPayload,
) {
  if (!supabaseUrl || !supabaseSecret) return;
  const endpoint = new URL("/rest/v1/chain_data_cache", supabaseUrl);
  endpoint.searchParams.set("on_conflict", "chain_id,curve_address");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...cacheHeaders(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      chain_id: 56,
      curve_address: curveAddress.toLowerCase(),
      token_address: tokenAddress?.toLowerCase() ?? null,
      latest_block: latestBlock.toString(),
      payload,
      refreshed_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Chain cache write failed with status ${response.status}`);
  }
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
      ...(await client.getLogs({
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
      ...(await client.getLogs({
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
      ...(await client.getLogs({
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
      ...(await client.getLogs({
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
      ...(await client.getLogs({
        address,
        event: swapEvent,
        fromBlock: start,
        toBlock: end,
      })),
    );
  }
  return logs;
}

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string };
  priceNative?: string;
  txns?: { h24?: { buys?: number; sells?: number } };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  liquidity?: { quote?: number };
  pairCreatedAt?: number;
};

async function readDexScreenerPair(pairAddress: `0x${string}`) {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/pairs/bsc/${pairAddress}`,
    { next: { revalidate: 15 } },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json()) as { pairs?: DexScreenerPair[] };
  return (
    payload.pairs?.find(
      (pair) =>
        pair.chainId === "bsc" &&
        pair.dexId?.toLowerCase().includes("pancake") &&
        pair.pairAddress?.toLowerCase() === pairAddress.toLowerCase(),
    ) ?? null
  );
}

async function readPairSnapshot(
  pairAddress: `0x${string}`,
  tokenAddress: `0x${string}`,
) {
  const [token0, token1, reserves] = await Promise.all([
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "token0",
    }),
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "token1",
    }),
    client.readContract({
      address: pairAddress,
      abi: pairReadAbi,
      functionName: "getReserves",
    }),
  ]);
  const tokenIs0 = token0.toLowerCase() === tokenAddress.toLowerCase();
  const tokenIs1 = token1.toLowerCase() === tokenAddress.toLowerCase();
  if (!tokenIs0 && !tokenIs1) return null;
  const tokenReserve = tokenIs0 ? reserves[0] : reserves[1];
  const bnbReserve = tokenIs0 ? reserves[1] : reserves[0];
  const tokens = Number(formatEther(tokenReserve));
  const bnb = Number(formatEther(bnbReserve));
  if (tokens <= 0 || bnb <= 0) return null;
  return {
    token0,
    token1,
    tokenIs0,
    pricePerMillionBnb: (bnb / tokens) * 1_000_000,
    liquidityBnb: bnb * 2,
  };
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

export async function GET(request: NextRequest) {
  const curve = request.nextUrl.searchParams.get("curve");
  const token = request.nextUrl.searchParams.get("token");
  const pair = request.nextUrl.searchParams.get("pair");
  if (
    !curve ||
    !isAddress(curve) ||
    (token && !isAddress(token)) ||
    (pair && !isAddress(pair)) ||
    (pair && !token)
  ) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const curveAddress = curve as `0x${string}`;
  const tokenAddress = token as `0x${string}` | null;
  const pairAddress = pair as `0x${string}` | null;
  try {
    const cached = await readCachedChainData(curveAddress);
    if (
      cached &&
      Date.now() - new Date(cached.refreshed_at).getTime() < CACHE_MAX_AGE_MS &&
      (!pairAddress || cached.payload.market?.source === "pancake")
    ) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
          "X-BNBX-Chain-Cache": "HIT",
        },
      });
    }
    const latest = await client.getBlockNumber();
    const configured = process.env.NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK;
    const fromBlock =
      configured && /^\d+$/.test(configured)
        ? BigInt(configured)
        : latest > 100_000n
          ? latest - 100_000n
          : 0n;
    const [
      latestBlock,
      buys,
      sells,
      transfers,
      graduations,
      swaps,
      pairSnapshot,
      dexPair,
      bnbUsd,
    ] =
      await Promise.all([
        client.getBlock({ blockNumber: latest }),
        getBoughtLogs(curveAddress, fromBlock, latest),
        getSoldLogs(curveAddress, fromBlock, latest),
        tokenAddress
          ? getTransferLogs(tokenAddress, fromBlock, latest)
          : Promise.resolve([]),
        getGraduatedLogs(curveAddress, fromBlock, latest),
        pairAddress ? getSwapLogs(pairAddress, fromBlock, latest) : Promise.resolve([]),
        pairAddress && tokenAddress
          ? readPairSnapshot(pairAddress, tokenAddress).catch(() => null)
          : Promise.resolve(null),
        pairAddress ? readDexScreenerPair(pairAddress) : Promise.resolve(null),
        getBnbUsdPrice(),
      ]);
    const uniqueTradeBlocks = [
      ...new Set(
        [...buys, ...sells, ...swaps, ...graduations].map((log) =>
          log.blockNumber.toString(),
        ),
      ),
    ]
      .map(BigInt)
      .sort((a, b) => (a < b ? -1 : 1))
      .slice(-80);
    const exactBlocks = await Promise.all(
      uniqueTradeBlocks.map((blockNumber) =>
        client.getBlock({ blockNumber }).catch(() => null),
      ),
    );
    const exactTimestamps = new Map(
      exactBlocks.flatMap((block) =>
        block ? [[block.number.toString(), Number(block.timestamp)] as const] : [],
      ),
    );
    const tradeTimestamp = (blockNumber: bigint) =>
      exactTimestamps.get(blockNumber.toString()) ??
      (Number(latestBlock.timestamp) -
        Math.floor(Number(latest - blockNumber) * 0.45));
    const curveTrades = [
      ...buys.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "buy",
        source: "curve",
        account: log.args.buyer,
        bnb: (log.args.grossBNB ?? 0n).toString(),
        priceBNB: (log.args.netBNB ?? 0n).toString(),
        tokens: (log.args.tokensOut ?? 0n).toString(),
        timestamp: tradeTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
      ...sells.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "sell",
        source: "curve",
        account: log.args.seller,
        bnb: (log.args.netBNB ?? 0n).toString(),
        priceBNB: (log.args.grossBNB ?? 0n).toString(),
        tokens: (log.args.tokensIn ?? 0n).toString(),
        timestamp: tradeTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
    ];
    const pancakeTrades = pairSnapshot
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
          const tokens = isBuy ? tokenOut : tokenIn;
          return [{
            id: `${log.transactionHash}-${log.logIndex}`,
            side: isBuy ? "buy" : "sell",
            source: "pancake",
            account: log.args.to,
            bnb: bnb.toString(),
            priceBNB: bnb.toString(),
            tokens: tokens.toString(),
            timestamp: tradeTimestamp(log.blockNumber),
            blockNumber: log.blockNumber.toString(),
            transactionHash: log.transactionHash,
          }];
        })
      : [];
    const trades = [...curveTrades, ...pancakeTrades].sort((a, b) =>
      BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1,
    );
    const balances = new Map<string, bigint>();
    for (const log of transfers) {
      const value = log.args.value ?? 0n;
      if (log.args.from && log.args.from !== zeroAddress) {
        balances.set(
          log.args.from,
          (balances.get(log.args.from) ?? 0n) - value,
        );
      }
      if (log.args.to && log.args.to !== zeroAddress) {
        balances.set(log.args.to, (balances.get(log.args.to) ?? 0n) + value);
      }
    }
    const excludedHolders = new Set(
      [curveAddress, pairAddress, LP_BURN_ADDRESS, zeroAddress]
        .filter(Boolean)
        .map((address) => address!.toLowerCase()),
    );
    const allHolders = [...balances.entries()]
      .filter(
        ([address, balance]) =>
          balance > 0n && !excludedHolders.has(address.toLowerCase()),
      )
      .map(([address, balance]) => ({ address, balance: balance.toString() }))
      .sort((a, b) => (BigInt(a.balance) > BigInt(b.balance) ? -1 : 1));
    const holders = allHolders.slice(0, 50);
    const cutoff24h = Number(latestBlock.timestamp) - 86_400;
    const recentTrades = trades.filter((trade) => trade.timestamp >= cutoff24h);
    const latestTrade = recentTrades.at(-1) ?? trades.at(-1);
    const oldestTrade = recentTrades[0];
    const pricePerMillion = (trade: (typeof trades)[number] | undefined) => {
      if (!trade) return null;
      const tokens = Number(formatEther(BigInt(trade.tokens)));
      const bnb = Number(formatEther(BigInt(trade.priceBNB)));
      return tokens > 0 && bnb > 0 ? (bnb / tokens) * 1_000_000 : null;
    };
    const fallbackLatestPrice = pricePerMillion(latestTrade);
    const fallbackOldestPrice = pricePerMillion(oldestTrade);
    const fallbackChange =
      fallbackLatestPrice !== null &&
      fallbackOldestPrice !== null &&
      fallbackOldestPrice > 0
        ? ((fallbackLatestPrice - fallbackOldestPrice) / fallbackOldestPrice) *
          100
        : null;
    const dexVolumeUsd = Number(dexPair?.volume?.h24);
    const dexVolumeBnb =
      Number.isFinite(dexVolumeUsd) && dexVolumeUsd >= 0 && bnbUsd > 0
        ? dexVolumeUsd / bnbUsd
        : null;
    const graduatedAt = graduations.at(-1)
      ? tradeTimestamp(graduations.at(-1)!.blockNumber)
      : dexPair?.pairCreatedAt
        ? Math.floor(dexPair.pairCreatedAt / 1000)
        : null;
    const market: MarketSnapshot = pairAddress
      ? {
          source: "pancake",
          pricePerMillionBnb:
            pairSnapshot?.pricePerMillionBnb ?? fallbackLatestPrice,
          volume24hBnb:
            dexVolumeBnb ??
            recentTrades.reduce(
              (sum, trade) => sum + Number(formatEther(BigInt(trade.bnb))),
              0,
            ),
          priceChange24h: Number.isFinite(Number(dexPair?.priceChange?.h24))
            ? Number(dexPair?.priceChange?.h24)
            : fallbackChange,
          liquidityBnb: pairSnapshot?.liquidityBnb ?? null,
          buys24h:
            dexPair?.txns?.h24?.buys ??
            recentTrades.filter((trade) => trade.side === "buy").length,
          sells24h:
            dexPair?.txns?.h24?.sells ??
            recentTrades.filter((trade) => trade.side === "sell").length,
          graduatedAt,
        }
      : {
          source: "curve",
          pricePerMillionBnb: fallbackLatestPrice,
          volume24hBnb: recentTrades.reduce(
            (sum, trade) => sum + Number(formatEther(BigInt(trade.bnb))),
            0,
          ),
          priceChange24h: fallbackChange,
          liquidityBnb: null,
          buys24h: recentTrades.filter((trade) => trade.side === "buy").length,
          sells24h: recentTrades.filter((trade) => trade.side === "sell").length,
          graduatedAt,
        };
    const payload = {
      trades,
      holders,
      holderCount: allHolders.length,
      holdersLimited: allHolders.length > holders.length,
      market,
      bnbUsd,
      refreshedAt: new Date().toISOString(),
      latestBlock: latest.toString(),
    };
    await writeCachedChainData(
      curveAddress,
      tokenAddress,
      latest,
      payload,
    ).catch(() => undefined);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    });
  } catch {
    const cached = await readCachedChainData(curveAddress).catch(() => null);
    if (cached) {
      return NextResponse.json(cached.payload, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
          Warning: '110 - "Serving stale chain cache"',
          "X-BNBX-Chain-Cache": "STALE",
        },
      });
    }
    return NextResponse.json(
      // Do not expose provider URLs, request bodies, or upstream diagnostics
      // because a private RPC credential may be embedded in the configured URL.
      { error: "Chain data is temporarily unavailable" },
      { status: 502 },
    );
  }
}
