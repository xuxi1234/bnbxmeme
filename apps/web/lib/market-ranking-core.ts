import { formatEther } from "viem";

export const marketFilters = [
  "hotInternal",
  "newInternal",
  "graduating",
  "newExternal",
  "hotExternal",
] as const;

export type MarketFilter = (typeof marketFilters)[number];

export type RankingEntry = {
  token: string;
  factory: string;
  factoryOrder?: number;
  creationIndex: number;
  principal: string | null;
  target: string | null;
  state?: number | null;
};

export type RankingScore = {
  hotScore?: number;
  volume24hBnb?: number;
  createdAt?: number;
  graduatedAt?: number;
};

export type MarketActivityScore = {
  volume24hBnb?: number;
  activity?: number;
};

export type RankingTrade = {
  bnb: string;
  timestamp: number;
  account?: string;
  source?: "curve" | "pancake";
};

type MarketActivity = {
  volume24hBnb?: number | null;
  buys24h?: number | null;
  sells24h?: number | null;
};

const MINIMUM_RANKED_TRADE_WEI = 10_000_000_000_000n;

function compareCreationFallback(left: RankingEntry, right: RankingEntry) {
  if (
    left.factoryOrder !== undefined &&
    right.factoryOrder !== undefined &&
    left.factoryOrder !== right.factoryOrder
  ) {
    return left.factoryOrder - right.factoryOrder;
  }
  if (left.creationIndex !== right.creationIndex) {
    return right.creationIndex - left.creationIndex;
  }
  const factoryOrder = left.factory
    .toLowerCase()
    .localeCompare(right.factory.toLowerCase());
  return (
    factoryOrder ||
    left.token.toLowerCase().localeCompare(right.token.toLowerCase())
  );
}

export function parseMarketFilter(value: string | null): MarketFilter | null {
  if (marketFilters.includes(value as MarketFilter)) {
    return value as MarketFilter;
  }
  if (value === "hot") return "hotInternal";
  if (value === "latest") return "newInternal";
  if (value === "graduated") return "newExternal";
  return null;
}

export function marketEntryMatchesFilter(
  filter: MarketFilter,
  entry: Pick<RankingEntry, "state">,
) {
  if (entry.state === null || entry.state === undefined) return false;
  const isExternal = entry.state === 2;
  if (filter === "newExternal" || filter === "hotExternal") {
    return isExternal;
  }
  return !isExternal;
}

function compareKnownDescending(
  left: number | undefined,
  right: number | undefined,
  fallback: number,
) {
  if (left === undefined && right === undefined) return fallback;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left === right ? fallback : right - left;
}

function progress(entry: RankingEntry) {
  const principal = entry.principal === null ? null : BigInt(entry.principal);
  const target = entry.target === null ? null : BigInt(entry.target);
  return principal !== null && target !== null && target > 0n
    ? (principal * 1_000_000n) / target
    : 0n;
}

export function compareMarketEntries(
  filter: MarketFilter,
  scores: Record<string, RankingScore>,
  left: RankingEntry,
  right: RankingEntry,
) {
  const fallback = compareCreationFallback(left, right);
  if (filter === "newInternal") {
    return compareKnownDescending(
      scores[left.token]?.createdAt,
      scores[right.token]?.createdAt,
      fallback,
    );
  }
  if (filter === "graduating") {
    const leftProgress = progress(left);
    const rightProgress = progress(right);
    return leftProgress === rightProgress
      ? fallback
      : leftProgress > rightProgress
        ? -1
        : 1;
  }
  if (filter === "newExternal") {
    return compareKnownDescending(
      scores[left.token]?.graduatedAt,
      scores[right.token]?.graduatedAt,
      fallback,
    );
  }
  return compareKnownDescending(
    scores[left.token]?.volume24hBnb,
    scores[right.token]?.volume24hBnb,
    fallback,
  );
}

export function summarizeCompleteMarketActivity(
  tokens: string[],
  scores: Record<string, MarketActivityScore>,
) {
  if (tokens.length === 0) return null;
  let volume24hBnb = 0;
  let trades24h = 0;
  for (const token of tokens) {
    const score = scores[token];
    if (
      score?.volume24hBnb === undefined ||
      !Number.isFinite(score.volume24hBnb) ||
      score.volume24hBnb < 0 ||
      score.activity === undefined ||
      !Number.isSafeInteger(score.activity) ||
      score.activity < 0
    ) {
      return null;
    }
    volume24hBnb += score.volume24hBnb;
    trades24h += score.activity;
    if (!Number.isFinite(volume24hBnb) || !Number.isSafeInteger(trades24h)) {
      return null;
    }
  }
  return { volume24hBnb, trades24h };
}

export function calculateHotRanking({
  trades,
  market,
  holderCount,
  graduated,
  nowSeconds,
  excludedAccounts = [],
}: {
  trades: RankingTrade[];
  market?: MarketActivity;
  holderCount: number;
  graduated: boolean;
  nowSeconds: number;
  excludedAccounts?: Array<string | null | undefined>;
}) {
  const cutoff24h = nowSeconds - 86_400;
  const excluded = new Set(
    excludedAccounts
      .filter((account): account is string => Boolean(account))
      .map((account) => account.toLowerCase()),
  );
  const qualifiedTrades = trades.filter(
    (trade) =>
      trade.timestamp >= cutoff24h &&
      BigInt(trade.bnb) >= MINIMUM_RANKED_TRADE_WEI &&
      (!graduated || trade.source === "pancake"),
  );
  const uniqueTraders = new Set(
    qualifiedTrades
      .map((trade) => trade.account?.toLowerCase())
      .filter(
        (account): account is string =>
          account !== undefined && !excluded.has(account),
      ),
  ).size;
  const hasMarketActivity = market?.buys24h != null && market?.sells24h != null;
  const activity = hasMarketActivity
    ? market.buys24h! + market.sells24h!
    : qualifiedTrades.length;
  const volume24hBnb =
    market?.volume24hBnb ??
    qualifiedTrades.reduce(
      (sum, trade) => sum + Number(formatEther(BigInt(trade.bnb))),
      0,
    );
  const mostRecentTimestamp = qualifiedTrades.reduce(
    (latest, trade) => Math.max(latest, trade.timestamp),
    0,
  );
  const recencyHours =
    mostRecentTimestamp > 0
      ? Math.max(0, (nowSeconds - mostRecentTimestamp) / 3600)
      : 24;
  const cappedTradeCount = Math.min(
    qualifiedTrades.length,
    Math.max(uniqueTraders, 1) * 5,
  );
  const hotScore =
    Math.log1p(volume24hBnb * 1_000) * 40 +
    Math.min(uniqueTraders, 25) * 12 +
    cappedTradeCount * 2 +
    Math.min(holderCount, 100) * 0.4 +
    Math.max(0, 24 - recencyHours);

  return {
    activity,
    hotScore,
    uniqueTraders,
    volume24hBnb,
  };
}
