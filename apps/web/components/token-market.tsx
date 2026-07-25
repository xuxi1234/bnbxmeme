"use client";

import Link from "next/link";
import { formatEther, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { curveAbi, factoryAbi, tokenAbi } from "@/lib/web3";
import { useTokenMetadata } from "@/lib/metadata";

const MAX_VISIBLE_TOKENS = 24;

function TokenCard({
  token,
  factory,
}: {
  token: `0x${string}`;
  factory: `0x${string}`;
}) {
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
        <strong>{name ?? "读取中…"}</strong>
        <span>${symbol ?? "—"}</span>
      </div>
      <span className={`state-label state-${state}`}>
        {state === 2 ? "已毕业" : state === 1 ? "毕业中" : "内盘"}
      </span>
      <div className="token-card-progress">
        <div>
          <span>毕业进度</span>
          <strong>{progress.toFixed(2)}%</strong>
        </div>
        <div className="mini-track">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="token-card-footer">
        <span>{formatEther(principal)} BNB</span>
        <span>目标 {formatEther(target)} BNB</span>
      </div>
    </Link>
  );
}

export function TokenMarket() {
  const factory =
    (process.env.NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as `0x${string}` | undefined) ??
    zeroAddress;
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
    <div className="token-grid">
      {tokenAddresses.map((token) => (
        <TokenCard key={token} token={token} factory={factory} />
      ))}
    </div>
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
