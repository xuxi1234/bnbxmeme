"use client";

import { useEffect, useState } from "react";
import { formatEther, parseAbiItem, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";

const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, uint256 grossBNB, uint256 feeBNB, uint256 netBNB, uint256 tokensOut, uint256 refundBNB)",
);
const soldEvent = parseAbiItem(
  "event Sold(address indexed seller, uint256 tokensIn, uint256 grossBNB, uint256 feeBNB, uint256 netBNB)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

type Trade = {
  id: string;
  side: "买入" | "卖出";
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

function deploymentStart(latest: bigint) {
  const configured = process.env.NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK;
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  return latest > 100_000n ? latest - 100_000n : 0n;
}

export function TokenActivity({
  token,
  curve,
}: {
  token: `0x${string}`;
  curve: `0x${string}`;
}) {
  const client = usePublicClient();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!client || token === zeroAddress || curve === zeroAddress) return;
    const publicClient = client;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setMessage("");
      try {
        const latest = await publicClient.getBlockNumber();
        const fromBlock = deploymentStart(latest);
        const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
        for (let start = fromBlock; start <= latest; start += 3_000n) {
          ranges.push({
            fromBlock: start,
            toBlock: start + 2_999n > latest ? latest : start + 2_999n,
          });
        }
        const [buyChunks, sellChunks, transferChunks] = await Promise.all([
          Promise.all(
            ranges.map((range) =>
              publicClient.getLogs({
                address: curve,
                event: boughtEvent,
                ...range,
              }),
            ),
          ),
          Promise.all(
            ranges.map((range) =>
              publicClient.getLogs({
                address: curve,
                event: soldEvent,
                ...range,
              }),
            ),
          ),
          Promise.all(
            ranges.map((range) =>
              publicClient.getLogs({
                address: token,
                event: transferEvent,
                ...range,
              }),
            ),
          ),
        ]);
        const buys = buyChunks.flat();
        const sells = sellChunks.flat();
        const transfers = transferChunks.flat();
        if (cancelled) return;

        const activity: Trade[] = [
          ...buys.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            side: "买入" as const,
            account: log.args.buyer!,
            bnb: log.args.grossBNB ?? 0n,
            tokens: log.args.tokensOut ?? 0n,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          })),
          ...sells.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}`,
            side: "卖出" as const,
            account: log.args.seller!,
            bnb: log.args.netBNB ?? 0n,
            tokens: log.args.tokensIn ?? 0n,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          })),
        ]
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1))
          .slice(0, 50);
        setTrades(activity);

        const balances = new Map<`0x${string}`, bigint>();
        for (const log of transfers) {
          const from = log.args.from;
          const to = log.args.to;
          const value = log.args.value ?? 0n;
          if (from && from !== zeroAddress) {
            balances.set(from, (balances.get(from) ?? 0n) - value);
          }
          if (to && to !== zeroAddress) {
            balances.set(to, (balances.get(to) ?? 0n) + value);
          }
        }
        setHolders(
          [...balances.entries()]
            .filter(([, balance]) => balance > 0n)
            .map(([address, balance]) => ({ address, balance }))
            .sort((a, b) => (a.balance > b.balance ? -1 : 1))
            .slice(0, 50),
        );
      } catch {
        if (!cancelled) {
          setMessage("当前 RPC 无法一次读取完整日志，稍后会由索引器接管。");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client, curve, token]);

  return (
    <section className="activity-layout">
      <article className="activity-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">ON-CHAIN ACTIVITY</p>
            <h2>最近交易</h2>
          </div>
          <span>{trades.length} 条</span>
        </div>
        {isLoading ? (
          <p className="activity-empty">正在读取链上日志…</p>
        ) : trades.length === 0 ? (
          <p className="activity-empty">{message || "还没有内盘交易。"}</p>
        ) : (
          <div className="activity-table">
            {trades.map((trade) => (
              <a
                key={trade.id}
                href={`https://testnet.bscscan.com/tx/${trade.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong className={trade.side === "买入" ? "trade-buy" : "trade-sell"}>
                  {trade.side}
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
            <h2>持币地址</h2>
          </div>
          <span>{holders.length} 个</span>
        </div>
        {isLoading ? (
          <p className="activity-empty">正在计算持币分布…</p>
        ) : holders.length === 0 ? (
          <p className="activity-empty">{message || "暂无持币地址。"}</p>
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
