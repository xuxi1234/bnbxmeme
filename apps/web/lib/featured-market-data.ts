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
  holderCount?: number;
};

export type FeaturedMarketScore = {
  pricePerMillion?: number;
  bnbUsd?: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  liquidityUsd?: number;
  priceChange24h?: number;
  activity?: number;
  createdAt?: number;
  holderCount?: number;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function normalizeFeaturedMarket(
  payload: unknown,
  holderCount?: number,
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
    ...(finite(holderCount) === undefined
      ? {}
      : { holderCount: finite(holderCount) }),
  };
}

export function parseBscScanHolderCount(html: string) {
  const match = html.match(/\bHolders:\s*([1-9]\d*(?:,\d{3})*)\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function parseGoPlusHolderCount(payload: unknown, tokenAddress: string) {
  if (!payload || typeof payload !== "object" || !("result" in payload))
    return undefined;
  const result = payload.result;
  if (!result || typeof result !== "object") return undefined;
  const token = (result as Record<string, unknown>)[tokenAddress.toLowerCase()];
  if (!token || typeof token !== "object" || !("holder_count" in token))
    return undefined;
  const value = Number((token as { holder_count: unknown }).holder_count);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function mergeFeaturedMarketScore(
  current: FeaturedMarketScore,
  data: FeaturedMarketData,
): FeaturedMarketScore {
  return {
    pricePerMillion:
      data.priceUsd === undefined ? undefined : data.priceUsd * 1_000_000,
    bnbUsd: 1,
    marketCapUsd: data.marketCapUsd,
    volume24hUsd: data.volume24hUsd,
    liquidityUsd: data.liquidityUsd,
    priceChange24h: data.priceChange24h,
    activity: data.trades24h,
    createdAt: data.createdAt,
    holderCount: data.holderCount ?? current.holderCount,
  };
}
