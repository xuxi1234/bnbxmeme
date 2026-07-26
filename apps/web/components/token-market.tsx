"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { curveAbi, factoryAbi, testnetFactoryAddress, tokenAbi } from "@/lib/web3";
import { useTokenMetadata } from "@/lib/metadata";
import { useLanguage } from "./language-provider";

const MAX_VISIBLE_TOKENS = 24;
type MarketFilter = "hot" | "latest" | "graduating" | "graduated";
type Entry = {
  token: `0x${string}`;
  curve: `0x${string}`;
  creationIndex: number;
  principal: bigint;
  target: bigint;
  state: number;
  volume: bigint;
  activity: number;
  lastBlock: bigint;
};

function TokenCard({ entry, factory }: { entry: Entry; factory: `0x${string}` }) {
  const { t } = useLanguage();
  const details = useReadContracts({
    contracts: [
      { address: entry.token, abi: tokenAbi, functionName: "name" },
      { address: entry.token, abi: tokenAbi, functionName: "symbol" },
      { address: factory, abi: factoryAbi, functionName: "tokenMetadataURI", args: [entry.token] },
    ],
  });
  const name = details.data?.[0]?.result as string | undefined;
  const symbol = details.data?.[1]?.result as string | undefined;
  const metadataURI = details.data?.[2]?.result as string | undefined;
  const { metadata } = useTokenMetadata(metadataURI);
  const progress = entry.target > 0n
    ? Math.min(100, Number((entry.principal * 10_000n) / entry.target) / 100)
    : 0;

  return (
    <Link className="token-card" href={`/token/${entry.token}`}>
      <div className="token-avatar">
        {metadata?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={metadata.image} alt="" />
        ) : (
          (symbol ?? "?").slice(0, 2)
        )}
      </div>
      <div className="token-card-title">
        <strong>{name ?? t("loading")}</strong>
        <span>${symbol ?? "—"}</span>
      </div>
      <span className={`state-label state-${entry.state}`}>
        {entry.state === 2 ? t("graduatedState") : entry.state === 1 ? t("graduatingState") : t("internal")}
      </span>
      <div className="token-card-progress">
        <div><span>{t("progress")}</span><strong>{progress.toFixed(2)}%</strong></div>
        <div className="mini-track"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="token-card-footer">
        <span>{formatEther(entry.principal)} BNB</span>
        <span>{t("target")} {formatEther(entry.target)} BNB</span>
      </div>
    </Link>
  );
}

export function TokenMarket() {
  const [filter, setFilter] = useState<MarketFilter>("hot");
  const [scores, setScores] = useState<Record<string, Pick<Entry, "volume" | "activity" | "lastBlock">>>({});
  const { t } = useLanguage();
  const factory = testnetFactoryAddress ?? zeroAddress;
  const count = useReadContract({
    address: factory,
    abi: factoryAbi,
    functionName: "tokenCount",
    query: { enabled: factory !== zeroAddress, refetchInterval: 12_000 },
  });
  const visibleCount = Math.min(Number(count.data ?? 0n), MAX_VISIBLE_TOKENS);
  const indexes = Array.from({ length: visibleCount }, (_, index) => visibleCount - index - 1);
  const tokenResults = useReadContracts({
    contracts: indexes.map((index) => ({
      address: factory, abi: factoryAbi, functionName: "allTokens" as const, args: [BigInt(index)] as const,
    })),
    query: { enabled: factory !== zeroAddress && visibleCount > 0 },
  });
  const tokens = (tokenResults.data ?? [])
    .map((item) => item.result)
    .filter((address): address is `0x${string}` => typeof address === "string");
  const curveResults = useReadContracts({
    contracts: tokens.map((token) => ({
      address: factory, abi: factoryAbi, functionName: "curveOf" as const, args: [token] as const,
    })),
    query: { enabled: tokens.length > 0 },
  });
  const curves = (curveResults.data ?? []).map((item) =>
    (item.result as `0x${string}` | undefined) ?? zeroAddress,
  );
  const curveStats = useReadContracts({
    contracts: curves.flatMap((curve) => [
      { address: curve, abi: curveAbi, functionName: "realBNBPrincipal" as const },
      { address: curve, abi: curveAbi, functionName: "graduationTarget" as const },
      { address: curve, abi: curveAbi, functionName: "state" as const },
    ]),
    query: { enabled: curves.length > 0 && curves.every((curve) => curve !== zeroAddress) },
  });

  const entries = useMemo<Entry[]>(() => tokens.map((token, position) => ({
    token,
    curve: curves[position] ?? zeroAddress,
    creationIndex: indexes[position] ?? 0,
    principal: (curveStats.data?.[position * 3]?.result as bigint | undefined) ?? 0n,
    target: (curveStats.data?.[position * 3 + 1]?.result as bigint | undefined) ?? 0n,
    state: Number(curveStats.data?.[position * 3 + 2]?.result ?? 0),
    volume: scores[token]?.volume ?? 0n,
    activity: scores[token]?.activity ?? 0,
    lastBlock: scores[token]?.lastBlock ?? 0n,
  })), [curveStats.data, curves, indexes, scores, tokens]);

  useEffect(() => {
    if (entries.length === 0) return;
    const controller = new AbortController();
    void Promise.all(entries.map(async (entry) => {
      if (entry.curve === zeroAddress) return [entry.token, { volume: 0n, activity: 0, lastBlock: 0n }] as const;
      try {
        const response = await fetch(`/api/chain-data?curve=${entry.curve}`, { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json() as { trades: Array<{ bnb: string; blockNumber: string }> };
        return [entry.token, {
          volume: data.trades.reduce((sum, trade) => sum + BigInt(trade.bnb), 0n),
          activity: data.trades.length,
          lastBlock: data.trades.reduce((latest, trade) => BigInt(trade.blockNumber) > latest ? BigInt(trade.blockNumber) : latest, 0n),
        }] as const;
      } catch {
        return [entry.token, { volume: 0n, activity: 0, lastBlock: 0n }] as const;
      }
    })).then((result) => {
      if (!controller.signal.aborted) setScores(Object.fromEntries(result));
    });
    return () => controller.abort();
    // Curves and tokens define the data request; scores must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves.join(","), tokens.join(",")]);

  const ranked = useMemo(() => {
    const visible = entries.filter((entry) => {
      const progress = entry.target > 0n ? Number((entry.principal * 10_000n) / entry.target) / 100 : 0;
      if (filter === "graduating") return entry.state < 2 && progress < 100;
      if (filter === "graduated") return entry.state === 2;
      return true;
    });
    return visible.sort((a, b) => {
      if (filter === "latest") return b.creationIndex - a.creationIndex;
      if (filter === "graduating") {
        const aProgress = a.target > 0n ? (a.principal * 1_000_000n) / a.target : 0n;
        const bProgress = b.target > 0n ? (b.principal * 1_000_000n) / b.target : 0n;
        return aProgress === bProgress ? b.creationIndex - a.creationIndex : aProgress > bProgress ? -1 : 1;
      }
      if (filter === "graduated") {
        return a.lastBlock === b.lastBlock ? b.creationIndex - a.creationIndex : a.lastBlock > b.lastBlock ? -1 : 1;
      }
      const aScore = a.volume + BigInt(a.activity) * 10_000_000_000_000_000n;
      const bScore = b.volume + BigInt(b.activity) * 10_000_000_000_000_000n;
      return aScore === bScore ? b.creationIndex - a.creationIndex : aScore > bScore ? -1 : 1;
    });
  }, [entries, filter]);

  if (factory === zeroAddress) return <MarketEmpty title={t("loading")} message="Factory unavailable" />;
  if (count.isLoading || tokenResults.isLoading) return <MarketEmpty title={t("loading")} message="BNB Testnet" />;
  if (tokens.length === 0) return <MarketEmpty title={t("noMatch")} message="" />;

  return (
    <>
      <div className="market-tabs" role="tablist">
        {(["hot", "latest", "graduating", "graduated"] as MarketFilter[]).map((item) => (
          <button className={filter === item ? "active" : ""} key={item} type="button"
            aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {t(item)}
          </button>
        ))}
      </div>
      {ranked.length === 0 ? (
        <div className="market-no-results">{t("noMatch")}</div>
      ) : (
        <div className="token-grid">
          {ranked.map((entry) => <TokenCard key={entry.token} entry={entry} factory={factory} />)}
        </div>
      )}
    </>
  );
}

function MarketEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-market">
      <span className="radar" />
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      <Link href="/create">BNBX →</Link>
    </div>
  );
}
