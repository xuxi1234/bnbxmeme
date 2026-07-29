"use client";

import { useEffect, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useLanguage } from "./language-provider";
import { blockExplorerUrl } from "@/lib/web3";

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
};

type Holder = {
  address: `0x${string}`;
  balance: bigint;
};

export type ActivitySummary = {
  latestPriceBnb: number;
  bnbUsd: number;
  trackedVolumeBnb: number;
  holderCount: number;
  holdersLimited: boolean;
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
  refreshKey,
  onSummary,
}: {
  token: `0x${string}`;
  curve: `0x${string}`;
  refreshKey?: `0x${string}`;
  onSummary?: (summary: ActivitySummary) => void;
}) {
  const { language, t } = useLanguage();
  const locale = languageLocales[language];
  const [activeTab, setActiveTab] = useState<"trades" | "holders">("trades");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [bnbUsd, setBnbUsd] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (token === zeroAddress || curve === zeroAddress) return;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setLoadError(false);
      try {
        const response = await fetch(`/api/chain-data?curve=${curve}&token=${token}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("chain data unavailable");
        const data = await response.json() as {
          trades: Array<Omit<Trade, "bnb" | "priceBNB" | "tokens" | "blockNumber"> & { bnb: string; priceBNB: string; tokens: string; blockNumber: string }>;
          holders: Array<{ address: `0x${string}`; balance: string }>;
          bnbUsd?: number;
        };
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
        setHolders(data.holders.map((holder) => ({ ...holder, balance: BigInt(holder.balance) })));
        const nextBnbUsd = Number(data.bnbUsd ?? 0);
        setBnbUsd(nextBnbUsd);
        const latestTrade = allActivity[0];
        const latestTokens = latestTrade ? Number(formatEther(latestTrade.tokens)) : 0;
        const latestPriceBnb =
          latestTrade && latestTokens > 0
            ? Number(formatEther(latestTrade.priceBNB)) / latestTokens
            : 0;
        onSummary?.({
          latestPriceBnb,
          bnbUsd: nextBnbUsd,
          trackedVolumeBnb: allActivity.reduce(
            (sum, trade) => sum + Number(formatEther(trade.bnb)),
            0,
          ),
          holderCount: data.holders.length,
          holdersLimited: data.holders.length >= 50,
        });
      } catch {
        if (!controller.signal.aborted) {
          setTrades([]);
          setHolders([]);
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [curve, onSummary, refreshKey, token]);

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
            </div>
          </div>
          <span>{t("liveRefresh")}</span>
        </div>
        {activeTab === "trades" && (isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : loadError ? (
          <p className="activity-empty activity-error">
            {t("chainBusy")}
          </p>
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
          <p className="activity-empty activity-error">
            {t("holderSyncBusy")}
          </p>
        ) : holders.length === 0 ? (
          <p className="activity-empty">{t("noHolders")}</p>
        ) : (
          <div className="holder-list">
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
      </article>
    </section>
  );
}
