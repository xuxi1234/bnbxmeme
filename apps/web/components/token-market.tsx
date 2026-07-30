"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useTokenMetadata } from "@/lib/metadata";
import { pancakeRouterAddress } from "@/lib/deployments";
import { chunkItems } from "@/lib/market-data-core";
import {
  formatCompactMetric,
  formatTokenPriceUsdt,
  tokenPriceUsdt,
} from "@/lib/market-format";
import {
  calculateHotRanking,
  compareMarketEntries,
  summarizeCompleteMarketActivity,
  type MarketFilter,
} from "@/lib/market-ranking-core";
import { resolveMarketNoResults } from "@/lib/market-empty-state-core";
import { useLanguage } from "./language-provider";
import { accessibilityCopy, interpolate } from "@/lib/localization-copy";

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
type MarketScoreResult = readonly [string, MarketScore, boolean];

const SCORE_REQUEST_BATCH_SIZE = 8;

function asBigInt(value: string | null) {
  return value === null ? undefined : BigInt(value);
}

function TokenCard({
  entry,
  score,
}: {
  entry: MarketEntry;
  score?: MarketScore;
}) {
  const { language, t } = useLanguage();
  const a11y = accessibilityCopy[language];
  const [imageFailed, setImageFailed] = useState(false);
  const { metadata } = useTokenMetadata(entry.metadataURI ?? undefined);
  const principal = asBigInt(entry.principal);
  const target = asBigInt(entry.target);
  const progress =
    principal !== undefined && target !== undefined && target > 0n
      ? Math.min(100, Number((principal * 10_000n) / target) / 100)
      : null;
  const priceUsdt = tokenPriceUsdt(
    score?.pricePerMillion,
    score?.bnbUsd,
  );

  return (
    <Link className="token-card" href={`/token/${entry.token}`}>
      <div className="token-avatar">
        {metadata?.image && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.image}
            alt={interpolate(a11y.tokenLogo, {
              name:
                entry.name ??
                metadata?.name ??
                entry.symbol ??
                entry.token.slice(0, 10),
            })}
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
          <strong>{formatTokenPriceUsdt(priceUsdt)} USDT</strong>
          <small>
            / 1 {entry.symbol ?? t("token")}
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
              : formatCompactMetric(score.volume24hBnb)}{" "}
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
  const [scoreLoadPartial, setScoreLoadPartial] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [indexReloadKey, setIndexReloadKey] = useState(0);
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

  const loadMarket = useCallback(
    async (signal: AbortSignal) => {
      setLoadError(false);
      setIsRefreshing(hasPayload.current);
      if (!hasPayload.current) setIsLoading(true);
      try {
        const endpoint = creator
          ? `/api/market-data?creator=${encodeURIComponent(creator)}`
          : "/api/market-data";
        const response = await fetch(endpoint, { signal });
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
    },
    [creator],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMarket(controller.signal);
    const interval = window.setInterval(
      () => void loadMarket(controller.signal),
      creator ? 60_000 : 15_000,
    );
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [creator, loadMarket, reloadKey]);

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
    let retryTimer: number | undefined;
    let needsIndexRetry = false;
    const loadScore = async (
      entry: MarketEntry,
    ): Promise<MarketScoreResult> => {
      if (!entry.curve || entry.curve === zeroAddress) {
        return [entry.token, {}, false] as const;
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
            source?: "curve" | "pancake";
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
          index?: {
            status: "backfilling" | "complete";
          };
        };
        if (data.index?.status === "backfilling") {
          needsIndexRetry = true;
          return [
            entry.token,
            {
              pricePerMillion: data.market?.pricePerMillionBnb ?? undefined,
              liquidityBnb: data.market?.liquidityBnb ?? undefined,
              bnbUsd: data.bnbUsd,
            },
            false,
          ] as const;
        }
        const latestTrade = [...data.trades].sort((a, b) =>
          BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1,
        )[0];
        const latestTokens = latestTrade
          ? Number(formatEther(BigInt(latestTrade.tokens)))
          : 0;
        const latestBnb = latestTrade
          ? Number(formatEther(BigInt(latestTrade.priceBNB)))
          : 0;
        const holderCount = data.holderCount ?? data.holders.length;
        const ranking = calculateHotRanking({
          trades: data.trades,
          market: data.market,
          holderCount,
          graduated: entry.state === 2,
          nowSeconds: Math.floor(Date.now() / 1000),
          excludedAccounts: [
            zeroAddress,
            entry.token,
            entry.curve,
            entry.liquidityPair,
            pancakeRouterAddress,
          ],
        });
        return [
          entry.token,
          {
            volume24hBnb: ranking.volume24hBnb,
            activity: ranking.activity,
            uniqueTraders: ranking.uniqueTraders,
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
            hotScore: ranking.hotScore,
          },
          true,
        ] as const;
      } catch {
        return [entry.token, {}, false] as const;
      }
    };
    const loadScores = async () => {
      const result: MarketScoreResult[] = [];
      for (const batch of chunkItems(entries, SCORE_REQUEST_BATCH_SIZE)) {
        if (controller.signal.aborted) break;
        result.push(...(await Promise.all(batch.map(loadScore))));
      }
      return result;
    };
    void loadScores().then((result) => {
      if (controller.signal.aborted) return;
      setScores(
        Object.fromEntries(result.map(([token, score]) => [token, score])),
      );
      setScoreLoadPartial(result.some(([, , complete]) => !complete));
      if (needsIndexRetry) {
        retryTimer = window.setTimeout(
          () => setIndexReloadKey((value) => value + 1),
          15_000,
        );
      }
    });
    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [entries, indexReloadKey]);

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
    return visible.sort((a, b) =>
      compareMarketEntries(filter, scores, a, b),
    );
  }, [entries, filter, query, scores]);
  const noResults = useMemo(
    () => resolveMarketNoResults(query, filter),
    [filter, query],
  );

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
  const activitySummary =
    payload?.dataStatus === "fresh"
      ? summarizeCompleteMarketActivity(
          entries.map((entry) => entry.token),
          scores,
        )
      : null;
  const projectSummaryComplete =
    payload?.dataStatus === "fresh" && knownEntries.length === entries.length;
  const marketStats = [
    [
      t("volume24h"),
      activitySummary
        ? `${formatCompactMetric(activitySummary.volume24hBnb)} BNB`
        : "—",
    ],
    [t("trades24h"), activitySummary?.trades24h ?? "—"],
    [
      t("nearGraduation"),
      projectSummaryComplete
        ? knownEntries.filter((entry) => {
            const principal = asBigInt(entry.principal);
            const target = asBigInt(entry.target);
            return (
              entry.state !== null &&
              entry.state < 2 &&
              principal !== undefined &&
              target !== undefined &&
              target > 0n &&
              principal * 100n >= target * 75n
            );
          }).length
        : "—",
    ],
    [
      t("completedProjects"),
      projectSummaryComplete
        ? knownEntries.filter((entry) => entry.state === 2).length
        : "—",
    ],
  ] as const;

  return (
    <>
      {(payload?.dataStatus === "partial" || loadError || scoreLoadPartial) && (
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
        <section
          className="market-no-results"
          role="status"
          aria-live="polite"
        >
          <strong>
            {noResults.kind === "search"
              ? interpolate(t("searchNoResultsTitle"), {
                  query: noResults.query,
                })
              : interpolate(t("filterNoResultsTitle"), {
                  filter: t(noResults.filter),
                })}
          </strong>
          <p>
            {noResults.kind === "search"
              ? interpolate(t("searchNoResultsHelp"), {
                  filter: t(noResults.filter),
                })
              : t("filterNoResultsHelp")}
          </p>
          <div className="market-no-results-actions">
            {noResults.kind === "search" && (
              <button
                className="button secondary"
                type="button"
                onClick={() => setQuery("")}
              >
                {t("clearSearch")}
              </button>
            )}
            {noResults.showHotAction && (
              <button
                className="button secondary"
                type="button"
                onClick={() => chooseFilter("hot")}
              >
                {t("showHotProjects")}
              </button>
            )}
          </div>
        </section>
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
