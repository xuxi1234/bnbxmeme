"use client";

import { useEffect, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useLanguage } from "./language-provider";

type Trade = {
  id: string;
  side: "buy" | "sell";
  account: `0x${string}`;
  bnb: bigint;
  tokens: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

type Holder = {
  address: `0x${string}`;
  balance: bigint;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TokenActivity({
  token,
  curve,
}: {
  token: `0x${string}`;
  curve: `0x${string}`;
}) {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token === zeroAddress || curve === zeroAddress) return;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/chain-data?curve=${curve}&token=${token}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("chain data unavailable");
        const data = await response.json() as {
          trades: Array<Omit<Trade, "bnb" | "tokens" | "blockNumber"> & { bnb: string; tokens: string; blockNumber: string }>;
          holders: Array<{ address: `0x${string}`; balance: string }>;
        };
        const activity = data.trades.map((trade) => ({
          ...trade,
          bnb: BigInt(trade.bnb),
          tokens: BigInt(trade.tokens),
          blockNumber: BigInt(trade.blockNumber),
        }))
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
          .slice(0, 50);
        setTrades(activity);
        setHolders(data.holders.map((holder) => ({ ...holder, balance: BigInt(holder.balance) })));
      } catch {
        if (!controller.signal.aborted) {
          setTrades([]);
          setHolders([]);
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
  }, [curve, token]);

  return (
    <section className="activity-layout">
      <article className="activity-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">ON-CHAIN ACTIVITY</p>
            <h2>{t("recentTrades")}</h2>
          </div>
          <span>{trades.length} {t("items")}</span>
        </div>
        {isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : trades.length === 0 ? (
          <p className="activity-empty">{t("noTrades")}</p>
        ) : (
          <div className="activity-table">
            {trades.map((trade) => (
              <a
                key={trade.id}
                href={`https://testnet.bscscan.com/tx/${trade.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong className={trade.side === "buy" ? "trade-buy" : "trade-sell"}>
                  {t(trade.side)}
                </strong>
                <span>{shortAddress(trade.account)}</span>
                <span>{Number(formatEther(trade.bnb)).toFixed(4)} BNB</span>
                <span>{Number(formatEther(trade.tokens)).toLocaleString()} 枚</span>
              </a>
            ))}
          </div>
        )}
      </article>

      <article className="activity-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">HOLDERS</p>
            <h2>{t("holders")}</h2>
          </div>
          <span>{holders.length} {t("addresses")}</span>
        </div>
        {isLoading ? (
          <p className="activity-empty">{t("readingLogs")}</p>
        ) : holders.length === 0 ? (
          <p className="activity-empty">{t("noHolders")}</p>
        ) : (
          <div className="holder-list">
            {holders.map((holder, index) => (
              <a
                key={holder.address}
                href={`https://testnet.bscscan.com/token/${token}?a=${holder.address}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{shortAddress(holder.address)}</strong>
                <span>{Number(formatEther(holder.balance)).toLocaleString()} 枚</span>
              </a>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
