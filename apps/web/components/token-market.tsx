"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useTokenMetadata } from "@/lib/metadata";
import { pancakeRouterAddress } from "@/lib/deployments";
import { buildMarketScoreRefreshKey, chunkItems } from "@/lib/market-data-core";
import {
  formatCompactMetric,
  formatCompactTokenPriceUsdt,
  tokenPriceUsdt,
} from "@/lib/market-format";
import {
  calculateHotRanking,
  compareMarketEntries,
  marketEntryMatchesFilter,
  marketFilters,
  parseMarketFilter,
  summarizeCompleteMarketActivity,
  type MarketFilter,
} from "@/lib/market-ranking-core";
import { resolveMarketNoResults } from "@/lib/market-empty-state-core";
import { tokenProjectPath } from "@/lib/project-paths";
import { useLanguage } from "./language-provider";
import {
  accessibilityCopy,
  interpolate,
  localeByLanguage,
} from "@/lib/localization-copy";
import { startVisiblePolling } from "@/lib/visible-polling";

type MarketEntry = {
  token: `0x${string}`;
  name: string | null;
  symbol: string | null;
  totalSupply: string | null;
  factory: `0x${string}`;
  factoryOrder: number;
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
  createdAt?: number;
  graduatedAt?: number;
  hotScore?: number;
};
type MarketScoreResult = readonly [string, MarketScore, boolean];

const SCORE_REQUEST_BATCH_SIZE = 8;
const SCORE_POLL_INTERVAL_MS = 60_000;
const MARKET_PAGE_SIZE = 30;

function asBigInt(value: string | null) {
  return value === null ? undefined : BigInt(value);
}

function formatAge(timestamp: number | undefined, locale: string) {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return "—";
  const elapsedSeconds = Math.max(0, (Date.now() - timestamp) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 3_600) {
    return formatter.format(
      -Math.max(1, Math.floor(elapsedSeconds / 60)),
      "minute",
    );
  }
  if (elapsedSeconds < 86_400) {
    return formatter.format(-Math.floor(elapsedSeconds / 3_600), "hour");
  }
  return formatter.format(-Math.floor(elapsedSeconds / 86_400), "day");
}

function formatUsdMetric(value: number | undefined, locale: string) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—";
  return `$${formatCompactMetric(value, locale)}`;
}

function TokenMarketRow({
  entry,
  score,
  onCreationTime,
}: {
  entry: MarketEntry;
  score?: MarketScore;
  onCreationTime: (token: string, createdAt: string) => void;
}) {
  const { language, t } = useLanguage();
  const a11y = accessibilityCopy[language];
  const [imageFailed, setImageFailed] = useState(false);
  const { metadata } = useTokenMetadata(entry.metadataURI ?? undefined);
  useEffect(() => {
    if (metadata?.createdAt) onCreationTime(entry.token, metadata.createdAt);
  }, [entry.token, metadata?.createdAt, onCreationTime]);
  const principal = asBigInt(entry.principal);
  const target = asBigInt(entry.target);
  const progress =
    principal !== undefined && target !== undefined && target > 0n
      ? Math.min(100, Number((principal * 10_000n) / target) / 100)
      : null;
  const locale = localeByLanguage[language];
  const priceUsdt = tokenPriceUsdt(score?.pricePerMillion, score?.bnbUsd);
  const supply = entry.totalSupply
    ? Number(formatEther(BigInt(entry.totalSupply)))
    : undefined;
  const marketCap =
    priceUsdt !== null && supply !== undefined ? priceUsdt * supply : undefined;
  const volumeUsd =
    score?.volume24hBnb !== undefined && score?.bnbUsd !== undefined
      ? score.volume24hBnb * score.bnbUsd
      : undefined;
  const liquidityUsd =
    score?.liquidityBnb !== undefined && score?.bnbUsd !== undefined
      ? score.liquidityBnb * score.bnbUsd
      : undefined;
  const change = score?.priceChange24h;
  const stateLabel =
    entry.state === null
      ? t("dataUnknown")
      : entry.state === 2
        ? t("graduatedState")
        : entry.state === 1
          ? t("graduatingState")
          : t("internal");

  return (
    <Link
      className="token-market-row"
      href={tokenProjectPath(entry.token)}
      role="row"
    >
      <span className="token-market-identity" role="cell">
        <span className="token-avatar">
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
        </span>
        <span className="token-market-name">
          <strong>{entry.name ?? t("dataUnknown")}</strong>
          <small>${entry.symbol ?? "—"}</small>
        </span>
      </span>
      <span
        className="token-market-value token-market-price"
        role="cell"
        data-label={t("currentPrice")}
      >
        <strong>{formatCompactTokenPriceUsdt(priceUsdt, locale)}</strong>
        <small>{entry.name ?? entry.symbol ?? t("token")} / USDT</small>
      </span>
      <span
        className="token-market-progress"
        role="cell"
        data-label={t("progress")}
      >
        <span>
          <strong>{progress === null ? "—" : `${progress.toFixed(2)}%`}</strong>
          <small
            className={
              entry.state === 2 ? "state-label state-2" : "state-label"
            }
          >
            {stateLabel}
          </small>
        </span>
        <span className="mini-track" aria-hidden="true">
          <i style={{ width: `${progress ?? 0}%` }} />
        </span>
      </span>
      <span
        className="token-market-value token-market-age"
        role="cell"
        data-label={t("launchTime")}
      >
        <strong>{formatAge(score?.createdAt, locale)}</strong>
      </span>
      <span
        className="token-market-value token-market-cap"
        role="cell"
        data-label={t("marketCap")}
      >
        <strong>{formatUsdMetric(marketCap, locale)}</strong>
      </span>
      <span
        className="token-market-value token-market-volume"
        role="cell"
        data-label={t("volume24h")}
      >
        <strong>{formatUsdMetric(volumeUsd, locale)}</strong>
        <small>
          {score?.volume24hBnb === undefined
            ? "—"
            : `${formatCompactMetric(score.volume24hBnb, locale)} BNB`}
        </small>
      </span>
      <span
        className="token-market-value token-market-holders"
        role="cell"
        data-label={t("holders")}
      >
        <strong>{score?.holderCount ?? "—"}</strong>
      </span>
      <span
        className="token-market-value token-market-trades"
        role="cell"
        data-label={t("trades24h")}
      >
        <strong>{score?.activity ?? "—"}</strong>
      </span>
      <span
        className="token-market-value token-market-liquidity"
        role="cell"
        data-label={t("liquidity")}
      >
        <strong>{formatUsdMetric(liquidityUsd, locale)}</strong>
      </span>
      <span
        className={`token-market-value token-market-change ${change === undefined ? "" : change >= 0 ? "positive" : "negative"}`}
        role="cell"
        data-label={t("change24h")}
      >
        <strong>
          {change === undefined
            ? "—"
            : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        </strong>
      </span>
    </Link>
  );
}

export function TokenMarket({ creator }: { creator?: string } = {}) {
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<MarketFilter>("hotInternal");
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<MarketPayload | null>(null);
  const [scores, setScores] = useState<Record<string, MarketScore>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [scoreLoadPartial, setScoreLoadPartial] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [indexReloadKey, setIndexReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const hasPayload = useRef(false);
  const scoreEntriesRef = useRef<MarketEntry[]>([]);
  const { t } = useLanguage();

  useEffect(() => {
    const requested = searchParams.get("market");
    const parsed = parseMarketFilter(requested);
    if (parsed) setFilter(parsed);
  }, [searchParams]);

  const chooseFilter = useCallback((next: MarketFilter) => {
    setFilter(next);
    const url = new URL(window.location.href);
    url.searchParams.set("market", next);
    url.hash = "market";
    window.history.replaceState(null, "", url);
  }, []);

  const rememberCreationTime = useCallback(
    (token: string, createdAt: string) => {
      const timestamp = Date.parse(createdAt);
      if (!Number.isFinite(timestamp)) return;
      setScores((current) =>
        current[token]?.createdAt === timestamp
          ? current
          : {
              ...current,
              [token]: { ...current[token], createdAt: timestamp },
            },
      );
    },
    [],
  );

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
    const stopPolling = startVisiblePolling(
      () => loadMarket(controller.signal),
      creator ? 60_000 : 15_000,
    );
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [creator, loadMarket, reloadKey]);

  const entries = useMemo(
    () =>
      (payload?.entries ?? []).filter(
        (entry) =>
          !creator || entry.creator?.toLowerCase() === creator.toLowerCase(),
      ),
    [creator, payload?.entries],
  );
  const scoreRefreshKey = useMemo(
    () => buildMarketScoreRefreshKey(entries),
    [entries],
  );
  useEffect(() => {
    scoreEntriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    if (!scoreRefreshKey) return;
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
      for (const batch of chunkItems(
        scoreEntriesRef.current,
        SCORE_REQUEST_BATCH_SIZE,
      )) {
        if (controller.signal.aborted) break;
        result.push(...(await Promise.all(batch.map(loadScore))));
      }
      return result;
    };
    const refreshScores = async () => {
      needsIndexRetry = false;
      const result = await loadScores();
      if (controller.signal.aborted) return;
      setScores((current) =>
        Object.fromEntries(
          result.map(([token, score]) => [
            token,
            { ...score, createdAt: current[token]?.createdAt },
          ]),
        ),
      );
      setScoreLoadPartial(result.some(([, , complete]) => !complete));
      if (needsIndexRetry) {
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(
          () => setIndexReloadKey((value) => value + 1),
          15_000,
        );
      }
    };
    const stopPolling = startVisiblePolling(
      refreshScores,
      SCORE_POLL_INTERVAL_MS,
    );
    return () => {
      controller.abort();
      stopPolling();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [indexReloadKey, scoreRefreshKey]);

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
      return marketEntryMatchesFilter(filter, entry);
    });
    return visible.sort((a, b) => compareMarketEntries(filter, scores, a, b));
  }, [entries, filter, query, scores]);
  const noResults = useMemo(
    () => resolveMarketNoResults(query, filter),
    [filter, query],
  );
  const pageCount = Math.max(1, Math.ceil(ranked.length / MARKET_PAGE_SIZE));
  const pagedEntries = ranked.slice(
    (currentPage - 1) * MARKET_PAGE_SIZE,
    currentPage * MARKET_PAGE_SIZE,
  );
  const pageNumbers = Array.from(
    { length: Math.min(5, pageCount) },
    (_, index) => {
      const start = Math.min(
        Math.max(1, currentPage - 2),
        Math.max(1, pageCount - 4),
      );
      return start + index;
    },
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

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
      <MarketNotice title={t("noProjectsYet")} message={t("noProjectsHelp")} />
    );
  }

  const knownEntries = entries.filter(
    (entry) =>
      entry.principal !== null && entry.target !== null && entry.state !== null,
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
        ? knownEntries.filter(
            (entry) => entry.state !== null && entry.state < 2,
          ).length
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
          <button
            type="button"
            onClick={() => {
              setReloadKey((value) => value + 1);
              setIndexReloadKey((value) => value + 1);
            }}
          >
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
          {marketFilters.map((item) => (
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
        <section className="market-no-results" role="status" aria-live="polite">
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
                onClick={() => chooseFilter("hotInternal")}
              >
                {t("showHotProjects")}
              </button>
            )}
          </div>
        </section>
      ) : (
        <div
          className="token-market-table"
          role="table"
          aria-label={t("projects")}
        >
          <div className="token-market-header" role="row">
            {[
              t("token"),
              t("currentPrice"),
              t("progress"),
              t("launchTime"),
              t("marketCap"),
              t("volume24h"),
              t("holders"),
              t("trades24h"),
              t("liquidity"),
              t("change24h"),
            ].map((label) => (
              <span key={label} role="columnheader">
                {label}
              </span>
            ))}
          </div>
          <div className="token-market-body" role="rowgroup">
            {pagedEntries.map((entry) => (
              <TokenMarketRow
                key={entry.token}
                entry={entry}
                score={scores[entry.token]}
                onCreationTime={rememberCreationTime}
              />
            ))}
          </div>
        </div>
      )}
      {ranked.length > MARKET_PAGE_SIZE && (
        <nav className="market-pagination" aria-label={t("pagination")}>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => page - 1)}
          >
            {t("previousPage")}
          </button>
          {pageNumbers.map((page) => (
            <button
              type="button"
              key={page}
              className={page === currentPage ? "active" : ""}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setCurrentPage((page) => page + 1)}
          >
            {t("nextPage")}
          </button>
        </nav>
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
