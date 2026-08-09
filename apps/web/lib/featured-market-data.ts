type DexPair = {
  chainId?: string;
  dexId?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  url?: string;
};

export type FeaturedMarketData = {
  priceUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  priceChange24h?: number;
  trades24h?: number;
  createdAt?: number;
  marketUrl?: string;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function normalizeFeaturedMarket(
  payload: unknown,
): FeaturedMarketData | null {
  if (!payload || typeof payload !== "object" || !("pairs" in payload))
    return null;
  const pairs = Array.isArray(payload.pairs)
    ? (payload.pairs as DexPair[])
    : [];
  const pair = pairs
    .filter((item) => item.chainId === "bsc" && item.dexId === "pancakeswap")
    .sort(
      (left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0),
    )[0];
  if (!pair) return null;

  const buys = finite(pair.txns?.h24?.buys);
  const sells = finite(pair.txns?.h24?.sells);
  const parsedPrice = Number(pair.priceUsd);
  return {
    priceUsd: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
    marketCapUsd: finite(pair.marketCap) ?? finite(pair.fdv),
    volume24hUsd: finite(pair.volume?.h24),
    liquidityUsd: finite(pair.liquidity?.usd),
    priceChange24h: finite(pair.priceChange?.h24),
    trades24h:
      buys !== undefined && sells !== undefined ? buys + sells : undefined,
    createdAt: finite(pair.pairCreatedAt),
    marketUrl: typeof pair.url === "string" ? pair.url : undefined,
  };
}
