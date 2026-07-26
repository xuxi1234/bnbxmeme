"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEther, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import {
  curveAbi,
  factoryAbi,
  testnetFactoryAddress,
  tokenAbi,
} from "@/lib/web3";
import { useTokenMetadata } from "@/lib/metadata";
import { useLanguage } from "./language-provider";

const MAX_VISIBLE_TOKENS = 24;
type MarketFilter = "hot" | "latest" | "graduating" | "graduated";

function TokenCard({
  token,
  factory,
  filter,
}: {
  token: `0x${string}`;
  factory: `0x${string}`;
  filter: MarketFilter;
}) {
  const { t } = useLanguage();
  const details = useReadContracts({
    contracts: [
      { address: token, abi: tokenAbi, functionName: "name" },
      { address: token, abi: tokenAbi, functionName: "symbol" },
      { address: factory, abi: factoryAbi, functionName: "curveOf", args: [token] },
      {
        address: factory,
        abi: factoryAbi,
        functionName: "tokenMetadataURI",
        args: [token],
      },
    ],
  });

  const name = details.data?.[0]?.result as string | undefined;
  const symbol = details.data?.[1]?.result as string | undefined;
  const curve =
    (details.data?.[2]?.result as `0x${string}` | undefined) ?? zeroAddress;
  const metadataURI = details.data?.[3]?.result as string | undefined;
  const { metadata } = useTokenMetadata(metadataURI);

  const curveDetails = useReadContracts({
    contracts: [
      { address: curve, abi: curveAbi, functionName: "realBNBPrincipal" },
      { address: curve, abi: curveAbi, functionName: "graduationTarget" },
      { address: curve, abi: curveAbi, functionName: "state" },
    ],
    query: { enabled: curve !== zeroAddress },
  });

  const principal = (curveDetails.data?.[0]?.result as bigint | undefined) ?? 0n;
  const target = (curveDetails.data?.[1]?.result as bigint | undefined) ?? 0n;
  const state = Number(curveDetails.data?.[2]?.result ?? 0);
  const progress =
    target > 0n ? Math.min(100, Number((principal * 10_000n) / target) / 100) : 0;
  const visible =
    filter === "hot" ||
    filter === "latest" ||
    (filter === "graduating" && state < 2 && progress >= 70) ||
    (filter === "graduated" && state === 2);
  if (!visible) return null;

  return (
    <Link className="token-card" href={`/token/${token}`}>
      <div className="token-avatar">
        {metadata?.image ? (
          // IPFS images are user-provided and intentionally bypass Next image optimization.
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
      <span className={`state-label state-${state}`}>
        {state === 2 ? t("graduatedState") : state === 1 ? t("graduatingState") : t("internal")}
      </span>
      <div className="token-card-progress">
        <div>
          <span>{t("progress")}</span>
          <strong>{progress.toFixed(2)}%</strong>
        </div>
        <div className="mini-track">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="token-card-footer">
        <span>{formatEther(principal)} BNB</span>
        <span>{t("target")} {formatEther(target)} BNB</span>
      </div>
    </Link>
  );
}

export function TokenMarket() {
  const [filter, setFilter] = useState<MarketFilter>("hot");
  const { t } = useLanguage();
  const factory = testnetFactoryAddress ?? zeroAddress;
  const count = useReadContract({
    address: factory,
    abi: factoryAbi,
    functionName: "tokenCount",
    query: { enabled: factory !== zeroAddress, refetchInterval: 12_000 },
  });

  const visibleCount = Math.min(Number(count.data ?? 0n), MAX_VISIBLE_TOKENS);
  const indexes = Array.from({ length: visibleCount }, (_, index) =>
    BigInt(visibleCount - index - 1),
  );
  const tokens = useReadContracts({
    contracts: indexes.map((index) => ({
      address: factory,
      abi: factoryAbi,
      functionName: "allTokens" as const,
      args: [index] as const,
    })),
    query: { enabled: factory !== zeroAddress && visibleCount > 0 },
  });

  if (factory === zeroAddress) {
    return (
      <MarketEmpty
        title="测试网合约等待部署"
        message="Factory 地址配置完成后，这里会自动显示真实链上代币。"
      />
    );
  }

  if (count.isLoading || tokens.isLoading) {
    return <MarketEmpty title="正在读取链上市场" message="正在同步 BNB Testnet…" />;
  }

  const tokenAddresses = (tokens.data ?? [])
    .map((item) => item.result)
    .filter((address): address is `0x${string}` => typeof address === "string");

  if (tokenAddresses.length === 0) {
    return (
      <MarketEmpty
        title="等待首个测试网代币"
        message="创建成功后，代币会自动出现在这里。"
      />
    );
  }

  return (
    <>
      <div className="market-tabs" role="tablist">
        {(["hot", "latest", "graduating", "graduated"] as MarketFilter[]).map((item) => (
          <button
            className={filter === item ? "active" : ""}
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {t(item)}
          </button>
        ))}
      </div>
      <div className="token-grid">
      {tokenAddresses.map((token) => (
        <TokenCard key={token} token={token} factory={factory} filter={filter} />
      ))}
      </div>
    </>
  );
}

function MarketEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-market">
      <span className="radar" />
      <strong>{title}</strong>
      <p>{message}</p>
      <Link href="/create">前往创建页面 →</Link>
    </div>
  );
}
