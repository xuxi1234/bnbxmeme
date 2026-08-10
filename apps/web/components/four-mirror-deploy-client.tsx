"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { decodeEventLog, isAddress, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bsc } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { buildFourMirrorCreateRequest } from "@/lib/four-mirror-deployment";
import { resolveMirrorDeployBlocker } from "@/lib/four-mirror-page-core";
import { blockExplorerUrl, factoryAbi, testnetPublicClient } from "@/lib/web3";
import { zeroTaxFactoryAddress } from "@/lib/deployments";
import { tokenProjectPath } from "@/lib/project-paths";

const VANITY_SEARCH_LIMIT = 500_000;
const VANITY_SEARCH_CHUNK = 10_000;

type MirrorCandidate = {
  sourceAddress: `0x${string}`;
  name: string;
  symbol: string;
  imageUrl: string;
  sourceUrl: string;
  createdAt: string | null;
  description: string;
  telegram: string;
  twitter: string;
  graduationTargetBNB: number;
  liquidityUsd: number;
  volume24hUsd: number;
  holderCount: number;
  pairUrl: string;
  eligible: boolean;
  reasons: string[];
};

type PrepareResult = {
  metadataURI?: string;
  name?: string;
  symbol?: string;
  graduationTargetBNB?: number;
  error?: string;
};

const reasonCopy: Record<string, string> = {
  liquidity: "流动性低于 10,000 USDT",
  volume24h: "24h 交易量低于 20,000 USDT",
  holders: "持币地址少于 100",
  "security-unavailable": "安全数据暂不可用",
  "not-open-source": "原合约未开源",
  is_honeypot: "蜜罐风险",
  is_mintable: "可增发风险",
  is_blacklisted: "黑名单风险",
  cannot_buy: "无法买入风险",
  cannot_sell_all: "无法全部卖出",
  hidden_owner: "隐藏所有者",
  is_proxy: "代理合约风险",
  selfdestruct: "可自毁风险",
  transfer_pausable: "可暂停转账",
  external_call: "外部调用风险",
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function walletMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/User rejected|User denied|rejected the request/i.test(message)) {
    return "你已在钱包中取消，本次没有发送交易。";
  }
  return message.split("\n")[0]?.slice(0, 240) || "部署失败";
}

export function FourMirrorDeployClient({
  authorizedWallet,
}: {
  authorizedWallet: string;
}) {
  const [mirrors, setMirrors] = useState<MirrorCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeMirror, setActiveMirror] = useState<MirrorCandidate | null>(null);
  const [stage, setStage] = useState("");
  const [vanityProgress, setVanityProgress] = useState(0);
  const [transactionHash, setTransactionHash] = useState<Hex | undefined>();
  const [createdToken, setCreatedToken] = useState<`0x${string}` | null>(null);
  const [actionError, setActionError] = useState("");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  const loadMirrors = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/four-mirrors", { cache: "no-store" });
      const payload = (await response.json()) as {
        mirrors?: MirrorCandidate[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.mirrors)) {
        throw new Error(payload.error ?? "Four 项目读取失败");
      }
      setMirrors(payload.mirrors);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Four 项目读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMirrors();
  }, [loadMirrors]);

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data || !activeMirror) return;
    let token: `0x${string}` | null = null;
    for (const log of receipt.data.logs) {
      if (log.address.toLowerCase() !== zeroTaxFactoryAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: factoryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "TokenCreated") continue;
        const args = decoded.args as { token?: `0x${string}` };
        if (args.token && isAddress(args.token)) token = args.token;
      } catch {
        // The receipt also contains token, curve, and Pancake events.
      }
    }
    if (!token) {
      setActionError("交易已确认，但未找到 TokenCreated 事件，请打开 BscScan 核对。 ");
      setActiveAddress(null);
      setStage("");
      return;
    }
    setCreatedToken(token);
    setStage("部署完成，已触发自动开源任务");
    setActiveAddress(null);
    void fetch("/api/verify-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash: receipt.data.transactionHash }),
      keepalive: true,
    }).catch(() => {
      // The scheduled verifier remains the fallback.
    });
  }, [activeMirror, receipt.data, receipt.isSuccess]);

  useEffect(() => {
    if (!receipt.error) return;
    setActionError(walletMessage(receipt.error));
    setActiveAddress(null);
    setStage("");
  }, [receipt.error]);

  const globallyBusy = Boolean(activeAddress) || isPending || receipt.isLoading;
  const eligibleCount = useMemo(
    () => mirrors.filter((mirror) => mirror.eligible).length,
    [mirrors],
  );

  async function findVanitySalt(mirror: MirrorCandidate) {
    if (!address) throw new Error("请先连接钱包");
    const start = (BigInt(Date.now()) << 160n) | BigInt(address);
    for (let index = 0; index < VANITY_SEARCH_LIMIT; index += VANITY_SEARCH_CHUNK) {
      const result = await testnetPublicClient.readContract({
        address: zeroTaxFactoryAddress,
        abi: factoryAbi,
        functionName: "findVanitySalt",
        args: [
          mirror.name,
          mirror.symbol,
          start + BigInt(index),
          BigInt(VANITY_SEARCH_CHUNK),
        ],
      });
      setVanityProgress(
        Math.round(((index + VANITY_SEARCH_CHUNK) / VANITY_SEARCH_LIMIT) * 100),
      );
      if (result[0]) return result[1];
    }
    throw new Error("本轮未找到 1111 尾号，请重新点击再试");
  }

  async function deployMirror(mirror: MirrorCandidate) {
    const blocker = resolveMirrorDeployBlocker({
      isConnected,
      address,
      authorizedWallet,
      chainId,
      eligible: mirror.eligible,
      busy: globallyBusy,
    });
    if (blocker) return;

    setActiveAddress(mirror.sourceAddress);
    setActiveMirror(mirror);
    setTransactionHash(undefined);
    setCreatedToken(null);
    setActionError("");
    setVanityProgress(0);
    try {
      setStage("重新核验并上传镜像资料到 IPFS…");
      const response = await fetch("/api/four-mirrors/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAddress: mirror.sourceAddress }),
      });
      const prepared = (await response.json()) as PrepareResult;
      if (
        !response.ok ||
        !prepared.metadataURI ||
        !prepared.name ||
        !prepared.symbol ||
        prepared.graduationTargetBNB !== mirror.graduationTargetBNB
      ) {
        throw new Error(prepared.error ?? "镜像资料准备失败");
      }

      const preparedMirror = {
        ...mirror,
        name: prepared.name,
        symbol: prepared.symbol,
      };
      setStage("搜索 1111 合约尾号…");
      const vanitySalt = await findVanitySalt(preparedMirror);
      setStage("请在钱包中确认这 1 笔部署交易");
      const hash = await writeContractAsync(
        buildFourMirrorCreateRequest({
          account: address!,
          name: prepared.name,
          symbol: prepared.symbol,
          graduationTargetBNB: prepared.graduationTargetBNB,
          metadataURI: prepared.metadataURI,
          vanitySalt,
        }),
      );
      setTransactionHash(hash);
      setStage("交易已发送，等待 BSC 确认…");
    } catch (error) {
      setActionError(walletMessage(error));
      setActiveAddress(null);
      setStage("");
    } finally {
      setVanityProgress(0);
    }
  }

  return (
    <main className="four-mirror-shell">
      <section className="four-mirror-hero">
        <div>
          <p className="eyebrow">BNBX ADMIN · FOUR MIRROR PREVIEW</p>
          <h1>Four 毕业币镜像部署</h1>
          <p>
            自动读取 Four.meme 新毕业项目，通过平衡筛选后，由你的钱包逐个部署 BNBX 0 税版本。
            每个按钮只弹出一笔主网交易。
          </p>
        </div>
        <WalletButton connectLabel="连接部署钱包" />
      </section>

      <section className="four-mirror-warning" role="note">
        <strong>社区镜像 / 非原项目官方发行</strong>
        <span>
          BNBX 版本与原 Four 项目合约地址不同。页面和 IPFS 资料都会保留原合约与来源链接，禁止冒充原项目官方。
        </span>
      </section>

      <section className="four-mirror-statusbar">
        <div><small>正式 0 税 Factory</small><code>{shortAddress(zeroTaxFactoryAddress)}</code></div>
        <div><small>授权钱包</small><code>{shortAddress(authorizedWallet)}</code></div>
        <div><small>本轮合格</small><strong>{eligibleCount} / {mirrors.length}</strong></div>
        <button className="button secondary" type="button" onClick={() => void loadMirrors()} disabled={loading || globallyBusy}>刷新项目</button>
      </section>

      {isConnected && chainId !== bsc.id && (
        <section className="four-mirror-action-note">
          当前不是 BNB Chain 主网。
          <button className="button" type="button" onClick={() => switchChain({ chainId: bsc.id })}>切换到 BSC</button>
        </section>
      )}
      {isConnected && address?.toLowerCase() !== authorizedWallet.toLowerCase() && (
        <p className="four-mirror-error" role="alert">当前钱包无部署权限，请连接指定的 BNBX 管理钱包。</p>
      )}
      {stage && (
        <p className="four-mirror-progress" role="status">
          {stage}{vanityProgress > 0 ? ` ${vanityProgress}%` : ""}
        </p>
      )}
      {actionError && <p className="four-mirror-error" role="alert">{actionError}</p>}
      {transactionHash && (
        <div className="four-mirror-result">
          <a href={`${blockExplorerUrl}/tx/${transactionHash}`} target="_blank" rel="noreferrer">查看部署交易 ↗</a>
          {createdToken && <Link href={tokenProjectPath(createdToken)}>打开 BNBX 代币页 →</Link>}
        </div>
      )}

      {loading ? (
        <p className="four-mirror-empty">正在读取 Four 新毕业项目并执行安全筛选…</p>
      ) : loadError ? (
        <p className="four-mirror-error" role="alert">{loadError}</p>
      ) : mirrors.length === 0 ? (
        <p className="four-mirror-empty">本轮没有读取到可展示的 Four 毕业项目。</p>
      ) : (
        <section className="four-mirror-grid" aria-label="Four 镜像候选项目">
          {mirrors.map((mirror) => {
            const blocker = resolveMirrorDeployBlocker({
              isConnected,
              address,
              authorizedWallet,
              chainId,
              eligible: mirror.eligible,
              busy: globallyBusy,
            });
            const active = activeAddress === mirror.sourceAddress;
            return (
              <article className={`four-mirror-card ${mirror.eligible ? "eligible" : "rejected"}`} key={mirror.sourceAddress}>
                <div className="four-mirror-card-head">
                  <div className="four-mirror-logo">
                    {mirror.imageUrl ? (
                      <Image src={mirror.imageUrl} alt={`${mirror.name} Logo`} width={72} height={72} unoptimized />
                    ) : <span>{mirror.symbol.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div>
                    <span className="four-mirror-badge">{mirror.eligible ? "通过筛选" : "仅展示"}</span>
                    <h2>{mirror.name}</h2>
                    <p>{mirror.symbol} · 毕业 {mirror.graduationTargetBNB} BNB</p>
                  </div>
                </div>
                <p className="four-mirror-description">{mirror.description || "Four.meme 未提供简介"}</p>
                <dl className="four-mirror-metrics">
                  <div><dt>流动性</dt><dd>{formatUsd(mirror.liquidityUsd)}</dd></div>
                  <div><dt>24h 交易量</dt><dd>{formatUsd(mirror.volume24hUsd)}</dd></div>
                  <div><dt>持币地址</dt><dd>{mirror.holderCount.toLocaleString()}</dd></div>
                </dl>
                {!mirror.eligible && (
                  <ul className="four-mirror-reasons">
                    {mirror.reasons.map((reason) => <li key={reason}>{reasonCopy[reason] ?? reason}</li>)}
                  </ul>
                )}
                <div className="four-mirror-links">
                  <a href={mirror.sourceUrl} target="_blank" rel="noreferrer">Four 原项目 ↗</a>
                  <a href={`${blockExplorerUrl}/token/${mirror.sourceAddress}`} target="_blank" rel="noreferrer">原合约 ↗</a>
                  {mirror.pairUrl && <a href={mirror.pairUrl} target="_blank" rel="noreferrer">外盘 ↗</a>}
                </div>
                <button className="button wide" type="button" disabled={Boolean(blocker)} onClick={() => void deployMirror(mirror)}>
                  {active ? stage || "处理中…" : mirror.eligible ? "签名并部署这个 0 税镜像" : "未通过筛选，禁止部署"}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
