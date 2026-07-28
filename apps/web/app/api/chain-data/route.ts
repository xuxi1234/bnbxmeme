import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  fallback,
  http,
  isAddress,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { bsc } from "viem/chains";

export const dynamic = "force-dynamic";

const configuredRpc =
  process.env.BSC_MAINNET_RPC_URL ?? process.env.BSC_LOG_RPC_URL;
const client = createPublicClient({
  chain: bsc,
  transport: fallback(
    [
      ...(configuredRpc
        ? [http(configuredRpc, { timeout: 20_000, retryCount: 2 })]
        : []),
      http("https://bsc-rpc.publicnode.com", { timeout: 12_000 }),
      http("https://bsc.drpc.org", { timeout: 12_000 }),
      http("https://bsc-dataseed.binance.org", {
        timeout: 12_000,
      }),
    ],
    { rank: false },
  ),
});
const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, uint256 grossBNB, uint256 feeBNB, uint256 netBNB, uint256 tokensOut, uint256 refundBNB)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, uint256 tokensIn, uint256 grossBNB, uint256 feeBNB, uint256 netBNB)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const LOG_BLOCK_RANGE = 10_000n;
const CACHE_MAX_AGE_MS = 10_000;

type ChainDataPayload = {
  trades: Array<Record<string, unknown>>;
  holders: Array<{ address: string; balance: string }>;
  bnbUsd: number;
};

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
  if (!curve || !isAddress(curve) || (token && !isAddress(token))) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const curveAddress = curve as `0x${string}`;
  const tokenAddress = token as `0x${string}` | null;
  try {
    const cached = await readCachedChainData(curveAddress);
    if (
      cached &&
      Date.now() - new Date(cached.refreshed_at).getTime() < CACHE_MAX_AGE_MS
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
    const [latestBlock, buys, sells, transfers, bnbUsd] =
      await Promise.all([
        client.getBlock({ blockNumber: latest }),
        getBoughtLogs(curveAddress, fromBlock, latest),
        getSoldLogs(curveAddress, fromBlock, latest),
        tokenAddress
          ? getTransferLogs(tokenAddress, fromBlock, latest)
          : Promise.resolve([]),
        getBnbUsdPrice(),
      ]);
    // Approximate older trade timestamps from the latest canonical block.
    // This avoids one RPC call per trade on rate-limited public endpoints.
    const estimatedTimestamp = (blockNumber: bigint) =>
      Number(latestBlock.timestamp) -
      Math.floor(Number(latest - blockNumber) * 0.45);
    const trades = [
      ...buys.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "buy",
        account: log.args.buyer,
        bnb: (log.args.grossBNB ?? 0n).toString(),
        priceBNB: (log.args.netBNB ?? 0n).toString(),
        tokens: (log.args.tokensOut ?? 0n).toString(),
        timestamp: estimatedTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
      ...sells.map((log) => ({
        id: `${log.transactionHash}-${log.logIndex}`,
        side: "sell",
        account: log.args.seller,
        bnb: (log.args.netBNB ?? 0n).toString(),
        priceBNB: (log.args.grossBNB ?? 0n).toString(),
        tokens: (log.args.tokensIn ?? 0n).toString(),
        timestamp: estimatedTimestamp(log.blockNumber),
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
      })),
    ];
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
    const holders = [...balances.entries()]
      .filter(([, balance]) => balance > 0n)
      .map(([address, balance]) => ({ address, balance: balance.toString() }))
      .sort((a, b) => (BigInt(a.balance) > BigInt(b.balance) ? -1 : 1))
      .slice(0, 50);
    const payload = { trades, holders, bnbUsd };
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
