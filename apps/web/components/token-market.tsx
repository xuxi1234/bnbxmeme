"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useTokenMetadata } from "@/lib/metadata";
import { useLanguage } from "./language-provider";

type MarketFilter = "hot" | "latest" | "graduating" | "graduated";
type MarketEntry = {
  token: `0x${string}`;
  name: string | null;
  symbol: string | null;
  totalSupply: string | null;
  factory: `0x${string}`;
  curve: `0x${string}` | null;
  metadataURI: string | null;
  creationIndex: number;
  principal: string | null;
  target: string | null;
  state: number | null;
  creator: `0x${string}` | null;
  liquidityPair: `0x${string}` | null;
};
type MarketPayload = {
  entries: MarketEntry[];
  dataStatus: "fresh" | "partial";
};
type MarketScore = {
  volume24hBnb?: number;
  activity?: number;
  uniqueTraders?: number;
  lastBlock?: bigint;
  pricePerMillion?: number;
  priceChange24h?: number;
  liquidityBnb?: number;
  bnbUsd?: number;
  holderCount?: number;
  graduatedAt?: number;
  hotScore?: number;
};

function asBigInt(value: string | null) {
  return value === null ? undefined : BigInt(value);
}

function compactMetric(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function priceMetric(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  return value < 0.000001 ? value.toExponential(2) : value.toFixed(6);
}

function TokenCard({
  entry,
  score,
}: {
  entry: MarketEntry;
  score?: MarketScore;
}) {
  const { t } = useLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const { metadata } = useTokenMetadata(entry.metadataURI ?? undefined);
  const principal = asBigInt(entry.principal);
  const target = asBigInt(entry.target);
  const progress =
    principal !== undefined && target !== undefined && target > 0n
      ? Math.min(100, Number((principal * 10_000n) / target) / 100)
      : null;

  return (
    <Link className="token-card" href={`/token/${entry.token}`}>
      <div className="token-avatar">
        {metadata?.image && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          (entry.symbol ?? "?").slice(0, 2)
        )}
      </div>
      <div className="token-card-title">
        <strong>{entry.name ?? t("dataUnknown")}</strong>
        <span>${entry.symbol ?? "—"}</span>
      </div>
      <span
        className={
          entry.state === null
            ? "state-label"
            : `state-label state-${entry.state}`
        }
      >
        {entry.state === null
          ? t("dataUnknown")
          : entry.state === 2
            ? t("graduatedState")
            : entry.state === 1
              ? t("graduatingState")
              : t("internal")}
      </span>
      <div className="token-card-progress">
        <div>
          <span>{t("progress")}</span>
          <strong>{progress === null ? "—" : `${progress.toFixed(2)}%`}</strong>
        </div>
        <div className="mini-track">
          <i style={{ width: `${progress ?? 0}%` }} />
        </div>
      </div>
      <div className="token-card-market">
        <div>
          <span>{t("currentPrice")}</span>
          <strong>{priceMetric(score?.pricePerMillion)} BNB</strong>
          <small>
            / 1M
            {score?.priceChange24h !== undefined
              ? ` · ${score.priceChange24h >= 0 ? "+" : ""}${score.priceChange24h.toFixed(2)}%`
              : ""}
          </small>
        </div>
        <div>
          <span>{t("volume24h")}</span>
          <strong>
            {score?.volume24hBnb === undefined
              ? "—"
              : compactMetric(score.volume24hBnb)}{" "}
            BNB
          </strong>
        </div>
        <div>
          <span>{t("trades24h")}</span>
          <strong>{score?.activity ?? "—"}</strong>
        </div>
        <div>
          <span>{t("holders")}</span>
          <strong>{score?.holderCount ?? "—"}</strong>
        </div>
      </div>
      <div className="token-card-footer">
        <span>
          {principal === undefined ? "—" : formatEther(principal)} BNB
        </span>
        <span>
          {t("target")} {target === undefined ? "—" : formatEther(target)} BNB
        </span>
      </div>
    </Link>
  );
}

export function TokenMarket({ creator }: { creator?: string } = {}) {
  const [filter, setFilter] = useState<MarketFilter>("hot");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<MarketPayload | null>(null);
  const [scores, setScores] = useState<Record<string, MarketScore>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hasPayload = useRef(false);
  const { t } = useLanguage();

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("market");
    if (
      requested === "hot" ||
      requested === "latest" ||
      requested === "graduating" ||
      requested === "graduated"
    ) {
      setFilter(requested);
    }
  }, []);

  const chooseFilter = useCallback((next: MarketFilter) => {
    setFilter(next);
    const url = new URL(window.location.href);
    url.searchParams.set("market", next);
    url.hash = "market";
    window.history.replaceState(null, "", url);
  }, []);

  const loadMarket = useCallback(async (signal: AbortSignal) => {
    setLoadError(false);
    setIsRefreshing(hasPayload.current);
    if (!hasPayload.current) setIsLoading(true);
    try {
      const response = await fetch("/api/market-data", {
        signal,
      });
      if (!response.ok) throw new Error("market data unavailable");
      const next = (await response.json()) as MarketPayload;
      if (!signal.aborted) {
        hasPayload.current = true;
        setPayload(next);
      }
    } catch {
      if (!signal.aborted) setLoadError(true);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadMarket(controller.signal);
    const interval = window.setInterval(
      () => void loadMarket(controller.signal),
      15_000,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadMarket, reloadKey]);

  const entries = useMemo(
    () =>
      (payload?.entries ?? []).filter(
        (entry) =>
          !creator ||
          entry.creator?.toLowerCase() === creator.toLowerCase(),
      ),
    [creator, payload?.entries],
  );

  useEffect(() => {
    if (entries.length === 0) return;
    const controller = new AbortController();
    void Promise.all(
      entries.map(async (entry) => {
        if (!entry.curve || entry.curve === zeroAddress) {
          return [entry.token, {}] as const;
        }
        try {
          const response = await fetch(
            `/api/chain-data?curve=${entry.curve}&token=${entry.token}${
              entry.state === 2 &&
              entry.liquidityPair &&
              entry.liquidityPair !== zeroAddress
                ? `&pair=${entry.liquidityPair}`
                : ""
            }`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error("unavailable");
          const data = (await response.json()) as {
            trades: Array<{
              bnb: string;
              priceBNB: string;
              tokens: string;
              blockNumber: string;
              timestamp: number;
              account?: string;
              side?: "buy" | "sell";
            }>;
            holders: Array<unknown>;
            holderCount?: number;
            market?: {
              pricePerMillionBnb?: number | null;
              volume24hBnb?: number | null;
              priceChange24h?: number | null;
              liquidityBnb?: number | null;
              buys24h?: number | null;
              sells24h?: number | null;
              graduatedAt?: number | null;
            };
            bnbUsd?: number;
          };
          const latestTrade = [...data.trades].sort((a, b) =>
            BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1,
          )[0];
          const latestTokens = latestTrade
            ? Number(formatEther(BigInt(latestTrade.tokens)))
            : 0;
          const latestBnb = latestTrade
            ? Number(formatEther(BigInt(latestTrade.priceBNB)))
            : 0;
          const cutoff24h = Math.floor(Date.now() / 1000) - 86_400;
          const qualifiedTrades = data.trades.filter(
            (trade) =>
              trade.timestamp >= cutoff24h &&
              Number(formatEther(BigInt(trade.bnb))) >= 0.00001,
          );
          const uniqueTraders = new Set(
            qualifiedTrades.map((trade) => trade.account?.toLowerCase()).filter(Boolean),
          ).size;
          const activity =
            (data.market?.buys24h ?? 0) + (data.market?.sells24h ?? 0) ||
            qualifiedTrades.length;
          const volume24hBnb =
            data.market?.volume24hBnb ??
            qualifiedTrades.reduce(
              (sum, trade) => sum + Number(formatEther(BigInt(trade.bnb))),
              0,
            );
          const holderCount = data.holderCount ?? data.holders.length;
          const mostRecentTimestamp = data.trades.reduce(
            (latest, trade) => Math.max(latest, trade.timestamp),
            0,
          );
          const recencyHours =
            mostRecentTimestamp > 0
              ? Math.max(0, (Date.now() / 1000 - mostRecentTimestamp) / 3600)
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
          return [
            entry.token,
            {
              volume24hBnb,
              activity,
              uniqueTraders,
              lastBlock: data.trades.reduce(
                (latest, trade) =>
                  BigInt(trade.blockNumber) > latest
                    ? BigInt(trade.blockNumber)
                    : latest,
                0n,
              ),
              pricePerMillion:
                data.market?.pricePerMillionBnb ??
                (latestTokens > 0
                  ? (latestBnb / latestTokens) * 1_000_000
                  : undefined),
              priceChange24h: data.market?.priceChange24h ?? undefined,
              liquidityBnb: data.market?.liquidityBnb ?? undefined,
              bnbUsd: data.bnbUsd,
              holderCount,
              graduatedAt: data.market?.graduatedAt ?? undefined,
              hotScore,
            },
          ] as const;
        } catch {
          return [entry.token, {}] as const;
        }
      }),
    ).then((result) => {
      if (!controller.signal.aborted) setScores(Object.fromEntries(result));
    });
    return () => controller.abort();
  }, [entries]);

  const ranked = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const visible = entries.filter((entry) => {
      if (
        normalizedQuery &&
        !entry.token.toLowerCase().includes(normalizedQuery) &&
        !entry.name?.toLowerCase().includes(normalizedQuery) &&
        !entry.symbol?.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      const principal = asBigInt(entry.principal);
      const target = asBigInt(entry.target);
      const progress =
        principal !== undefined && target !== undefined && target > 0n
          ? Number((principal * 10_000n) / target) / 100
          : null;
      if (filter === "graduating") {
        return (
          entry.state !== null &&
          entry.state < 2 &&
          progress !== null &&
          progress >= 75
        );
      }
      if (filter === "graduated") return entry.state === 2;
      return true;
    });
    return visible.sort((a, b) => {
      if (filter === "latest") return b.creationIndex - a.creationIndex;
      if (filter === "graduating") {
        const aPrincipal = asBigInt(a.principal);
        const aTarget = asBigInt(a.target);
        const bPrincipal = asBigInt(b.principal);
        const bTarget = asBigInt(b.target);
        const aProgress =
          aPrincipal !== undefined && aTarget
            ? (aPrincipal * 1_000_000n) / aTarget
            : 0n;
        const bProgress =
          bPrincipal !== undefined && bTarget
            ? (bPrincipal * 1_000_000n) / bTarget
            : 0n;
        return aProgress === bProgress
          ? b.creationIndex - a.creationIndex
          : aProgress > bProgress
            ? -1
            : 1;
      }
      if (filter === "graduated") {
        const aGraduatedAt = scores[a.token]?.graduatedAt;
        const bGraduatedAt = scores[b.token]?.graduatedAt;
        if (aGraduatedAt === undefined || bGraduatedAt === undefined) {
          return b.creationIndex - a.creationIndex;
        }
        return aGraduatedAt === bGraduatedAt
          ? b.creationIndex - a.creationIndex
          : bGraduatedAt - aGraduatedAt;
      }
      const aScore = scores[a.token]?.hotScore;
      const bScore = scores[b.token]?.hotScore;
      if (aScore === undefined || bScore === undefined) {
        return b.creationIndex - a.creationIndex;
      }
      return aScore === bScore
        ? b.creationIndex - a.creationIndex
        : aScore > bScore
          ? -1
          : 1;
    });
  }, [entries, filter, query, scores]);

  if (isLoading && !payload) {
    return <MarketNotice title={t("loading")} message="BNB Chain Mainnet" />;
  }
  if (loadError && !payload) {
    return (
      <MarketNotice
        title={t("dataUnavailable")}
        message={t("dataUnavailableHelp")}
        action={() => setReloadKey((value) => value + 1)}
        actionLabel={t("retry")}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <MarketNotice
        title={t("noProjectsYet")}
        message={t("noProjectsHelp")}
      />
    );
  }

  const knownEntries = entries.filter(
    (entry) =>
      entry.principal !== null &&
      entry.target !== null &&
      entry.state !== null,
  );
  const knownScores = Object.values(scores).filter(
    (score) =>
      score.volume24hBnb !== undefined && score.activity !== undefined,
  );
  const volume24h = knownScores.reduce(
    (sum, score) => sum + (score.volume24hBnb ?? 0),
    0,
  );
  const trades24h = knownScores.reduce(
    (sum, score) => sum + (score.activity ?? 0),
    0,
  );
  const marketStats = [
    [t("volume24h"), knownScores.length ? `${compactMetric(volume24h)} BNB` : "—"],
    [t("trades24h"), knownScores.length ? trades24h : "—"],
    [
      t("nearGraduation"),
      knownEntries.filter((entry) => {
        const principal = asBigInt(entry.principal);
        const target = asBigInt(entry.target);
        return (
          (entry.state ?? 2) < 2 &&
          principal !== undefined &&
          target !== undefined &&
          target > 0n &&
          principal * 100n >= target * 75n
        );
      }).length,
    ],
    [
      t("completedProjects"),
      knownEntries.filter((entry) => entry.state === 2).length,
    ],
  ] as const;

  return (
    <>
      {(payload?.dataStatus === "partial" || loadError) && (
        <div className="data-reliability-banner" role="status">
          <span>
            {loadError ? t("staleDataNotice") : t("partialDataNotice")}
          </span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            {isRefreshing ? t("loading") : t("retry")}
          </button>
        </div>
      )}
      <div className="market-overview" aria-label={t("projects")}>
        {marketStats.map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="market-toolbar">
        <label className="market-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
        </label>
        <div className="market-tabs" role="tablist">
          {(
            ["hot", "latest", "graduating", "graduated"] as MarketFilter[]
          ).map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => chooseFilter(item)}
            >
              {t(item)}
            </button>
          ))}
        </div>
      </div>
      {ranked.length === 0 ? (
        <div className="market-no-results">{t("noMatch")}</div>
      ) : (
        <div className="token-grid">
          {ranked.map((entry) => (
            <TokenCard key={entry.token} entry={entry} score={scores[entry.token]} />
          ))}
        </div>
      )}
    </>
  );
}

function MarketNotice({
  title,
  message,
  action,
  actionLabel,
}: {
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="empty-market">
      <span className="radar" />
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {action ? (
        <button className="button secondary" type="button" onClick={action}>
          {actionLabel}
        </button>
      ) : (
        <Link href="/create">BNBX →</Link>
      )}
    </div>
  );
}
