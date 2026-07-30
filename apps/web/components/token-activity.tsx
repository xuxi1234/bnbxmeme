"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useLanguage } from "./language-provider";
import { blockExplorerUrl } from "@/lib/web3";
import { pancakeRouterAddress } from "@/lib/deployments";
import { fetchSharedChainData } from "@/lib/shared-chain-data";
import { startVisiblePolling } from "@/lib/visible-polling";

type Trade = {
  id: string;
  side: "buy" | "sell";
  account: `0x${string}`;
  bnb: bigint;
  priceBNB: bigint;
  tokens: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  timestamp: number;
  source?: "curve" | "pancake";
};

type Holder = {
  address: `0x${string}`;
  balance: bigint;
};

export type ActivitySummary = {
  latestPricePerMillionBnb: number | null;
  bnbUsd: number;
  volume24hBnb: number | null;
  priceChange24h: number | null;
  liquidityBnb: number | null;
  marketSource: "curve" | "pancake";
  holderCount: number | null;
  holdersLimited: boolean;
  top10ConcentrationPct: number | null;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const languageLocales = {
  zh: "zh-CN",
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
} as const;

function accountColor(address: string) {
  const hue = Number.parseInt(address.slice(2, 8), 16) % 360;
  return `hsl(${hue} 68% 52%)`;
}

function formatCompact(value: bigint, locale: string) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 3,
  }).format(Number(formatEther(value)));
}

function formatBnb(value: bigint, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(formatEther(value)));
}

export function TokenActivity({
  token,
  curve,
  pair,
  refreshKey,
  onSummary,
}: {
  token: `0x${string}`;
  curve: `0x${string}`;
  pair?: `0x${string}`;
  refreshKey?: `0x${string}`;
  onSummary?: (summary: ActivitySummary) => void;
}) {
  const { language, t } = useLanguage();
  const locale = languageLocales[language];
  const [activeTab, setActiveTab] = useState<
    "trades" | "holders" | "topTraders"
  >("trades");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [bnbUsd, setBnbUsd] = useState(0);
  const [top10ConcentrationPct, setTop10ConcentrationPct] = useState<
    number | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const topTraders = useMemo(() => {
    const excluded = new Set(
      [
        curve,
        pair,
        token,
        zeroAddress,
        pancakeRouterAddress,
      ]
        .filter(Boolean)
        .map((address) => address!.toLowerCase()),
    );
    const totals = new Map<
      string,
      { account: `0x${string}`; volume: bigint; buys: number; sells: number }
    >();
    for (const trade of trades) {
      if (!trade.account || excluded.has(trade.account.toLowerCase())) continue;
      const key = trade.account.toLowerCase();
      const current = totals.get(key) ?? {
        account: trade.account,
        volume: 0n,
        buys: 0,
        sells: 0,
      };
      current.volume += trade.bnb;
      current[trade.side === "buy" ? "buys" : "sells"] += 1;
      totals.set(key, current);
    }
    return [...totals.values()]
      .sort((a, b) => (a.volume > b.volume ? -1 : 1))
      .slice(0, 20);
  }, [curve, pair, token, trades]);

  useEffect(() => {
    if (token === zeroAddress || curve === zeroAddress) return;
    const controller = new AbortController();

    async function load() {
      if (trades.length === 0 && holders.length === 0) setIsLoading(true);
      setLoadError(false);
      let isBackfilling = false;
      try {
        const data = await fetchSharedChainData<{
          trades: Array<Omit<Trade, "bnb" | "priceBNB" | "tokens" | "blockNumber"> & { bnb: string; priceBNB: string; tokens: string; blockNumber: string }>;
          holders: Array<{ address: `0x${string}`; balance: string }>;
          holderCount?: number;
          holdersLimited?: boolean;
          holderSupply?: string;
          top10ConcentrationPct?: number | null;
          market?: {
            source: "curve" | "pancake";
            pricePerMillionBnb: number | null;
            volume24hBnb: number | null;
            priceChange24h: number | null;
            liquidityBnb: number | null;
          };
          index?: {
            status: "backfilling" | "complete";
          };
          bnbUsd?: number;
        }>({ curve, token, pair }, controller.signal);
        if (data.index?.status === "backfilling") {
          isBackfilling = true;
          onSummary?.({
            latestPricePerMillionBnb:
              data.market?.pricePerMillionBnb ?? null,
            bnbUsd: Number(data.bnbUsd ?? 0),
            volume24hBnb: null,
            priceChange24h: null,
            liquidityBnb: data.market?.liquidityBnb ?? null,
            marketSource:
              data.market?.source ??
              (pair && pair !== zeroAddress ? "pancake" : "curve"),
            holderCount: null,
            holdersLimited: false,
            top10ConcentrationPct: null,
          });
          return;
        }
        const allActivity = data.trades.map((trade) => ({
          ...trade,
          bnb: BigInt(trade.bnb),
          priceBNB: BigInt(trade.priceBNB),
          tokens: BigInt(trade.tokens),
          blockNumber: BigInt(trade.blockNumber),
        }))
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));
        const activity = allActivity.slice(0, 50);
        setTrades(activity);
        const nextHolders = data.holders.map((holder) => ({
          ...holder,
          balance: BigInt(holder.balance),
        }));
        setHolders(nextHolders);
        const nextTop10Concentration =
          typeof data.top10ConcentrationPct === "number" &&
          Number.isFinite(data.top10ConcentrationPct)
            ? Math.min(100, Math.max(0, data.top10ConcentrationPct))
            : null;
        setTop10ConcentrationPct(nextTop10Concentration);
        const nextBnbUsd = Number(data.bnbUsd ?? 0);
        setBnbUsd(nextBnbUsd);
        const latestTrade = allActivity[0];
        const latestTokens = latestTrade ? Number(formatEther(latestTrade.tokens)) : 0;
        const fallbackPricePerMillionBnb =
          latestTrade && latestTokens > 0
            ? (Number(formatEther(latestTrade.priceBNB)) / latestTokens) *
              1_000_000
            : 0;
        const cutoff24h = Math.floor(Date.now() / 1000) - 86_400;
        const recentActivity = allActivity.filter(
          (trade) => trade.timestamp >= cutoff24h,
        );
        onSummary?.({
          latestPricePerMillionBnb:
            data.market?.pricePerMillionBnb ?? fallbackPricePerMillionBnb,
          bnbUsd: nextBnbUsd,
          volume24hBnb:
            data.market?.volume24hBnb ??
            recentActivity.reduce(
            (sum, trade) => sum + Number(formatEther(trade.bnb)),
            0,
          ),
          priceChange24h: data.market?.priceChange24h ?? null,
          liquidityBnb: data.market?.liquidityBnb ?? null,
          marketSource: data.market?.source ?? "curve",
          holderCount: data.holderCount ?? data.holders.length,
          holdersLimited:
            data.holdersLimited ?? data.holders.length >= 50,
          top10ConcentrationPct: nextTop10Concentration,
        });
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(isBackfilling);
      }
    }

    const stopPolling = startVisiblePolling(load, 15_000);
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [curve, holders.length, onSummary, pair, refreshKey, reloadKey, token, trades.length]);

  return (
    <section className="activity-terminal">
      <article className="activity-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">ON-CHAIN ACTIVITY</p>
            <div className="activity-tabs" role="tablist" aria-label={t("marketData")}>
              <button
                className={activeTab === "trades" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "trades"}
                onClick={() => setActiveTab("trades")}
              >
                {t("recentTrades")} <span>{trades.length}</span>
              </button>
              <button
                className={activeTab === "holders" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "holders"}
                onClick={() => setActiveTab("holders")}
              >
                {t("holders")} <span>{holders.length}{holders.length >= 50 ? "+" : ""}</span>
              </button>
              <button
                className={activeTab === "topTraders" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "topTraders"}
                onClick={() => setActiveTab("topTraders")}
              >
                {t("topTraders")} <span>{topTraders.length}</span>
              </button>
            </div>
          </div>
          <span>{t("liveRefresh")}</span>
        </div>
        {loadError && (trades.length > 0 || holders.length > 0) && (
          <div className="data-reliability-banner compact" role="status">
            <span>{t("staleDataNotice")}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              {t("retry")}
            </button>
          </div>
        )}
        {activeTab === "trades" && (isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : loadError ? (
          <div className="activity-empty activity-error">
            <p>{t("chainBusy")}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              {t("retry")}
            </button>
          </div>
        ) : trades.length === 0 ? (
          <p className="activity-empty">{t("noTrades")}</p>
        ) : (
          <div className="activity-table">
            <div className="activity-table-head">
              <span>{t("direction")}</span>
              <span>{t("account")}</span>
              <span>USD</span>
              <span>BNB</span>
              <span>{t("tokenAmount")}</span>
              <span>{t("date")}</span>
              <span>TXN</span>
            </div>
            {trades.map((trade) => (
              <a
                key={trade.id}
                href={`${blockExplorerUrl}/tx/${trade.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong className={trade.side === "buy" ? "trade-buy" : "trade-sell"}>
                  {t(trade.side)}
                </strong>
                <span className="trade-account">
                  <i style={{ background: accountColor(trade.account) }} aria-hidden="true">
                    {trade.account.slice(2, 4).toUpperCase()}
                  </i>
                  {shortAddress(trade.account)}
                </span>
                <span>{bnbUsd > 0 ? `$${(Number(formatEther(trade.bnb)) * bnbUsd).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
                <span>{formatBnb(trade.bnb, locale)}</span>
                <span title={`${formatEther(trade.tokens)} ${t("units")}`}>{formatCompact(trade.tokens, locale)}</span>
                <time dateTime={new Date(trade.timestamp * 1000).toISOString()}>
                  {new Intl.DateTimeFormat(locale, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(trade.timestamp * 1000))}
                </time>
                <strong className="trade-explorer" aria-label={t("viewExplorer")}>↗</strong>
              </a>
            ))}
          </div>
        ))}
        {activeTab === "holders" && (isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : loadError ? (
          <div className="activity-empty activity-error">
            <p>{t("holderSyncBusy")}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              {t("retry")}
            </button>
          </div>
        ) : holders.length === 0 ? (
          <p className="activity-empty">{t("noHolders")}</p>
        ) : (
          <div className="holder-list">
            <div className="holder-concentration">
              <span>{t("top10Concentration")}</span>
              <strong>
                {top10ConcentrationPct === null
                  ? "—"
                  : `${top10ConcentrationPct.toFixed(2)}%`}
              </strong>
            </div>
            {holders.map((holder, index) => (
              <a
                key={holder.address}
                href={`${blockExplorerUrl}/token/${token}?a=${holder.address}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{shortAddress(holder.address)}</strong>
                <span title={formatEther(holder.balance)}>{formatCompact(holder.balance, locale)} {t("units")}</span>
              </a>
            ))}
          </div>
        ))}
        {activeTab === "topTraders" && (isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : topTraders.length === 0 ? (
          <p className="activity-empty">{t("noTopTraders")}</p>
        ) : (
          <div className="holder-list top-trader-list">
            {topTraders.map((trader, index) => (
              <a
                key={trader.account}
                href={`${blockExplorerUrl}/address/${trader.account}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{shortAddress(trader.account)}</strong>
                <span>
                  {formatBnb(trader.volume, locale)} BNB · {trader.buys} {t("buy")} /{" "}
                  {trader.sells} {t("sell")}
                </span>
              </a>
            ))}
          </div>
        ))}
      </article>
    </section>
  );
}
