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
      http("https://bsc-rpc.publicnode.com", { timeout: 12_000 }),
      http("https://bsc.drpc.org", { timeout: 12_000 }),
      ...(configuredRpc
        ? [http(configuredRpc, { timeout: 12_000 })]
        : []),
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

export async function GET(request: NextRequest) {
  const curve = request.nextUrl.searchParams.get("curve");
  const token = request.nextUrl.searchParams.get("token");
  if (!curve || !isAddress(curve) || (token && !isAddress(token))) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const curveAddress = curve as `0x${string}`;
  const tokenAddress = token as `0x${string}` | null;
  try {
    const latest = await client.getBlockNumber();
    const configured = process.env.NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK;
    const fromBlock =
      configured && /^\d+$/.test(configured)
        ? BigInt(configured)
        : latest > 100_000n
          ? latest - 100_000n
          : 0n;
    const [latestBlock, buys, sells, transfers, priceResponse] = await Promise.all([
      client.getBlock({ blockNumber: latest }),
      client.getLogs({ address: curveAddress, event: boughtEvent, fromBlock, toBlock: latest }),
      client.getLogs({ address: curveAddress, event: soldEvent, fromBlock, toBlock: latest }),
      tokenAddress
        ? client.getLogs({ address: tokenAddress, event: transferEvent, fromBlock, toBlock: latest })
        : Promise.resolve([]),
      fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
        next: { revalidate: 60 },
      }).catch(() => null),
    ]);
    const priceData = priceResponse?.ok
      ? await priceResponse.json() as { price?: string }
      : null;
    const bnbUsd = Number(priceData?.price ?? 0);
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
        balances.set(log.args.from, (balances.get(log.args.from) ?? 0n) - value);
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
    return NextResponse.json(
      { trades, holders, bnbUsd },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "RPC error" },
      { status: 502 },
    );
  }
}
