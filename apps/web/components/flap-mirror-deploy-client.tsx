"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import {
  useAccount,
  useChainId,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { bsc } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  buildFlapMirrorCreateRequest,
  isSubmittedFlapMirrorTransaction,
  shouldReuseFlapMirrorSession,
  type FlapMirrorOperatorSession,
  SubmittedFlapMirrorTransactionError,
} from "@/lib/flap-mirror-deployment";
import { resolveMirrorDeployBlocker } from "@/lib/four-mirror-page-core";
import {
  isWalletRejection,
  runSequentialMirrorQueue,
  selectedMirrorFeeBNB,
} from "@/lib/four-mirror-queue";
import { holderRewardsFactoryAddress } from "@/lib/deployments";
import {
  buildMirrorHolderRewardsVanityCall,
  decodeMirrorHolderCreatedToken,
} from "@/lib/mirror-holder-rewards";
import { tokenProjectPath } from "@/lib/project-paths";
import { blockExplorerUrl, testnetPublicClient } from "@/lib/web3";

const VANITY_SEARCH_LIMIT = 500_000;
const VANITY_SEARCH_CHUNK = 10_000;

type MirrorCandidate = {
  sourceAddress: `0x${string}`;
  name: string;
  symbol: string;
  imageUrl: string;
  sourceUrl: string;
  createdAt: string | null;
  graduationTargetBNB: number;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  holderCount: number | null;
  buyTaxPercent: number | null;
  sellTaxPercent: number | null;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};

type PrepareResult = {
  metadataURI?: string;
  name?: string;
  symbol?: string;
  graduationTargetBNB?: number;
  error?: string;
};

type QueueItemState = {
  status: "waiting" | "preparing" | "wallet" | "confirming" | "submitted" | "success" | "failed" | "cancelled";
  message: string;
  transactionHash?: Hex;
  token?: `0x${string}`;
};

const reasonCopy: Record<string, string> = {
  liquidity: "流动性低于 3,000 USDT",
  volume24h: "24h 交易量低于 5,000 USDT",
  holders: "持币地址少于 30",
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

function formatUsd(value: number | null) {
  if (value === null) return "暂无数据";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTax(value: number | null) {
  if (value === null) return "暂无数据";
  return `${Number(value.toFixed(2))}%`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function walletMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (isWalletRejection(error)) {
    return "你已在钱包中取消，本次没有发送交易。";
  }
  return message.split("\n")[0]?.slice(0, 240) || "部署失败";
}

export function FlapMirrorDeployClient() {
  const [mirrors, setMirrors] = useState<MirrorCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);
  const [queueStates, setQueueStates] = useState<Record<string, QueueItemState>>({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [vanityProgress, setVanityProgress] = useState(0);
  const [actionError, setActionError] = useState("");
  const [operatorSession, setOperatorSession] =
    useState<FlapMirrorOperatorSession | null>(null);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const loadMirrors = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/flap-mirrors", { cache: "no-store" });
      const payload = (await response.json()) as {
        mirrors?: MirrorCandidate[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.mirrors)) {
        throw new Error(payload.error ?? "Flap 项目读取失败");
      }
      setMirrors(payload.mirrors);
      setSelectedAddresses([]);
      setQueueStates({});
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Flap 项目读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMirrors();
  }, [loadMirrors]);

  function tokenFromReceipt(receipt: Awaited<ReturnType<typeof testnetPublicClient.waitForTransactionReceipt>>) {
    return decodeMirrorHolderCreatedToken(receipt.logs);
  }

  const globallyBusy = queueRunning || isPending || isSigning;
  const eligibleCount = useMemo(
    () => mirrors.filter((mirror) => mirror.eligible).length,
    [mirrors],
  );
  const selectedMirrors = useMemo(
    () => mirrors.filter((mirror) => selectedAddresses.includes(mirror.sourceAddress)),
    [mirrors, selectedAddresses],
  );

  function updateQueueState(sourceAddress: string, state: QueueItemState) {
    setQueueStates((current) => ({
      ...current,
      [sourceAddress]: { ...current[sourceAddress], ...state },
    }));
  }

  async function findVanitySalt({
    name,
    symbol,
    metadataURI,
  }: {
    name: string;
    symbol: string;
    metadataURI: string;
  }) {
    if (!address) throw new Error("请先连接钱包");
    const start = (BigInt(Date.now()) << 160n) | BigInt(address);
    for (let index = 0; index < VANITY_SEARCH_LIMIT; index += VANITY_SEARCH_CHUNK) {
      const result = await testnetPublicClient.readContract(
        buildMirrorHolderRewardsVanityCall({
          name,
          symbol,
          metadataURI,
          start: start + BigInt(index),
          maxIterations: BigInt(VANITY_SEARCH_CHUNK),
        }),
      );
      setVanityProgress(
        Math.round(((index + VANITY_SEARCH_CHUNK) / VANITY_SEARCH_LIMIT) * 100),
      );
      if (result[0]) return result[1];
    }
    throw new Error("本轮未找到 1111 尾号，请重新点击再试");
  }

  async function ensureOperatorSession(force = false) {
    if (!address) throw new Error("请先连接钱包");
    if (!force && shouldReuseFlapMirrorSession(operatorSession, address)) return;
    setStage("请签署一次免 Gas 的部署员登录消息…");
    const challengeResponse = await fetch(
      `/api/flap-mirrors/session?address=${encodeURIComponent(address)}`,
      { cache: "no-store" },
    );
    const challenge = (await challengeResponse.json()) as {
      token?: string;
      message?: string;
      error?: string;
    };
    if (!challengeResponse.ok || !challenge.token || !challenge.message) {
      throw new Error(challenge.error ?? "部署员身份验证失败");
    }
    const signature = await signMessageAsync({ message: challenge.message });
    const sessionResponse = await fetch("/api/flap-mirrors/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: challenge.token,
        message: challenge.message,
        signature,
      }),
    });
    const session = (await sessionResponse.json()) as {
      address?: string;
      expiresAt?: number;
      error?: string;
    };
    if (
      !sessionResponse.ok ||
      typeof session.address !== "string" ||
      typeof session.expiresAt !== "number"
    ) {
      throw new Error(session.error ?? "部署员会话建立失败");
    }
    setOperatorSession({
      wallet: session.address.toLowerCase(),
      expiresAt: session.expiresAt,
    });
  }

  async function prepareMirror(sourceAddress: string, retryUnauthorized = true) {
    const response = await fetch("/api/flap-mirrors/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAddress }),
    });
    if (response.status === 401 && retryUnauthorized) {
      setOperatorSession(null);
      await ensureOperatorSession(true);
      return prepareMirror(sourceAddress, false);
    }
    return {
      response,
      prepared: (await response.json()) as PrepareResult,
    };
  }

  async function deployMirrorTransaction(mirror: MirrorCandidate, index: number) {
    setActiveAddress(mirror.sourceAddress);
    setVanityProgress(0);
    const position = `${index + 1}/${selectedMirrors.length}`;
    setStage(`${position} · 正在准备 ${mirror.symbol} 的镜像资料…`);
    updateQueueState(mirror.sourceAddress, { status: "preparing", message: "准备资料与 1111 尾号" });
    const { response, prepared } = await prepareMirror(mirror.sourceAddress);
    setStage(`${position} · 正在准备 ${mirror.symbol} 的镜像资料…`);
    if (
      !response.ok ||
      !prepared.metadataURI ||
      !prepared.name ||
      !prepared.symbol ||
      prepared.graduationTargetBNB !== mirror.graduationTargetBNB
    ) {
      throw new Error(prepared.error ?? "镜像资料准备失败");
    }

    const vanitySalt = await findVanitySalt({
      name: prepared.name,
      symbol: prepared.symbol,
      metadataURI: prepared.metadataURI,
    });
    setStage(`${position} · 请在钱包中确认部署 ${prepared.symbol}`);
    updateQueueState(mirror.sourceAddress, { status: "wallet", message: "等待钱包确认" });
    const hash = await writeContractAsync(
      buildFlapMirrorCreateRequest({
        account: address!,
        name: prepared.name,
        symbol: prepared.symbol,
        graduationTargetBNB: prepared.graduationTargetBNB,
        metadataURI: prepared.metadataURI,
        vanitySalt,
      }),
    );
    setStage(`${position} · ${prepared.symbol} 已发送，等待 BSC 确认…`);
    updateQueueState(mirror.sourceAddress, {
      status: "confirming",
      message: "等待链上确认",
      transactionHash: hash,
    });
    let receipt: Awaited<ReturnType<typeof testnetPublicClient.waitForTransactionReceipt>>;
    let token: `0x${string}` | null;
    try {
      receipt = await testnetPublicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      token = tokenFromReceipt(receipt);
      if (!token) {
        throw new Error("交易已确认，但未找到 TokenCreated 事件，请打开 BscScan 核对");
      }
    } catch (error) {
      throw new SubmittedFlapMirrorTransactionError(hash, error);
    }
    updateQueueState(mirror.sourceAddress, {
      status: "success",
      message: "部署完成，已触发自动开源任务",
      transactionHash: hash,
      token,
    });
    void fetch("/api/verify-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionHash: receipt.transactionHash }),
      keepalive: true,
    }).catch(() => {
      // The scheduled verifier remains the fallback.
    });
    return token;
  }

  async function deploySelectedMirrors() {
    const blocker = resolveMirrorDeployBlocker({
      isConnected,
      address,
      chainId,
      eligible: selectedMirrors.length > 0,
      busy: globallyBusy,
    });
    if (blocker || !address) return;
    setQueueRunning(true);
    setActionError("");
    try {
      await ensureOperatorSession();
    } catch (error) {
      setActionError(walletMessage(error));
      setStage("");
      setQueueRunning(false);
      return;
    }
    setQueueStates(Object.fromEntries(selectedMirrors.map((mirror) => [
      mirror.sourceAddress,
      { status: "waiting", message: "等待处理" } satisfies QueueItemState,
    ])));
    const results = await runSequentialMirrorQueue(
      selectedMirrors,
      async (mirror, index) => {
        try {
          return await deployMirrorTransaction(mirror, index);
        } catch (error) {
          const cancelled = isWalletRejection(error);
          const submitted = isSubmittedFlapMirrorTransaction(error);
          updateQueueState(mirror.sourceAddress, {
            status: submitted ? "submitted" : cancelled ? "cancelled" : "failed",
            message: submitted
              ? "交易已发送，但回执状态不确定；队列已暂停，请先在 BscScan 核对"
              : walletMessage(error),
            transactionHash: submitted ? error.transactionHash : undefined,
          });
          throw error;
        }
      },
      {
        shouldStop: (error) =>
          isWalletRejection(error) || isSubmittedFlapMirrorTransaction(error),
      },
    );
    const successCount = results.filter((result) => result.status === "success").length;
    const stopped = results.some((result) => result.status === "cancelled");
    setStage(
      stopped
        ? `队列已暂停：成功 ${successCount} 枚，其余未发送`
        : `本轮完成：成功 ${successCount} / ${selectedMirrors.length}`,
    );
    setActionError("");
    setActiveAddress(null);
    setVanityProgress(0);
    setQueueRunning(false);
  }

  return (
    <main className="four-mirror-shell">
      <section className="four-mirror-hero">
        <div>
          <p className="eyebrow">BNBX · FLAP MIRROR</p>
          <h1>Flap 最新外盘镜像部署</h1>
          <p>
            自动读取 Flap.sh 在 BSC 上最新的已毕业外盘。勾选你喜欢的项目后，系统会按顺序逐枚弹出钱包确认，
            每次只发送一笔 BNBX 持币分红 USDT 部署交易。
          </p>
        </div>
        <WalletButton connectLabel="连接部署钱包" />
      </section>

      <section className="four-mirror-warning" role="note">
        <strong>社区镜像 / 非原项目官方发行</strong>
        <span>
          BNBX 版本与原 Flap 项目合约地址不同。页面和 IPFS 资料都会保留原合约与来源链接，禁止冒充原项目官方。
        </span>
      </section>

      <p className="four-mirror-action-note">
        开始批次时先签署一次免 Gas 的部署员登录消息；随后每枚代币只弹出一笔链上部署确认。
      </p>

      <section className="four-mirror-statusbar">
        <div><small>正式持币分红 USDT Factory</small><code>{shortAddress(holderRewardsFactoryAddress)}</code></div>
        <div><small>固定新币参数</small><strong>毕业 1 BNB · 买入 3% · 卖出 3%</strong></div>
        <div>
          <small>钱包权限</small>
          <strong>任意钱包可用</strong>
        </div>
        <div><small>本轮可选</small><strong>{eligibleCount} / {mirrors.length}</strong></div>
        <button className="button secondary" type="button" onClick={() => void loadMirrors()} disabled={loading || globallyBusy}>刷新项目</button>
      </section>

      <section className="four-mirror-batchbar" aria-label="逐笔部署队列">
        <div>
          <strong>已选 {selectedMirrors.length} 枚</strong>
          <span>
            创建费合计 {selectedMirrorFeeBNB(selectedMirrors.length)} BNB，另加每笔链上 Gas
          </span>
        </div>
        <div className="four-mirror-batch-actions">
          <button
            className="button secondary"
            type="button"
            disabled={globallyBusy || mirrors.length === 0}
            onClick={() => setSelectedAddresses(
              selectedMirrors.length === mirrors.length
                ? []
                : mirrors.map((mirror) => mirror.sourceAddress),
            )}
          >
            {selectedMirrors.length === mirrors.length && mirrors.length > 0 ? "取消全选" : "全选本轮"}
          </button>
          <button
            className="button"
            type="button"
            disabled={Boolean(resolveMirrorDeployBlocker({
              isConnected,
              address,
              chainId,
              eligible: selectedMirrors.length > 0,
              busy: globallyBusy,
            }))}
            onClick={() => void deploySelectedMirrors()}
          >
            {queueRunning ? "正在逐个部署…" : `开始逐个确认部署 ${selectedMirrors.length} 枚`}
          </button>
        </div>
      </section>

      {isConnected && chainId !== bsc.id && (
        <section className="four-mirror-action-note">
          当前不是 BNB Chain 主网。
          <button className="button" type="button" onClick={() => switchChain({ chainId: bsc.id })}>切换到 BSC</button>
        </section>
      )}
      {stage && (
        <p className="four-mirror-progress" role="status">
          {stage}{vanityProgress > 0 ? ` ${vanityProgress}%` : ""}
        </p>
      )}
      {actionError && <p className="four-mirror-error" role="alert">{actionError}</p>}

      {loading ? (
        <p className="four-mirror-empty">正在读取 Flap 最新已毕业外盘项目并执行安全筛选…</p>
      ) : loadError ? (
        <p className="four-mirror-error" role="alert">{loadError}</p>
      ) : mirrors.length === 0 ? (
        <p className="four-mirror-empty">本轮没有读取到可展示的 Flap 毕业项目。</p>
      ) : (
        <section className="four-mirror-grid" aria-label="Flap 镜像候选项目">
          {mirrors.map((mirror) => {
            const active = activeAddress === mirror.sourceAddress;
            const selected = selectedAddresses.includes(mirror.sourceAddress);
            const queueState = queueStates[mirror.sourceAddress];
            return (
              <article className={`four-mirror-card ${selected ? "selected" : ""} ${active ? "active" : ""}`} key={mirror.sourceAddress}>
                <label className="four-mirror-selector">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={globallyBusy}
                    onChange={(event) => setSelectedAddresses((current) =>
                      event.target.checked
                        ? [...current, mirror.sourceAddress]
                        : current.filter((sourceAddress) => sourceAddress !== mirror.sourceAddress),
                    )}
                  />
                  <span>{selected ? "已加入逐笔部署队列" : "勾选这个项目"}</span>
                </label>
                <div className="four-mirror-card-head">
                  <div className="four-mirror-logo">
                    {mirror.imageUrl ? (
                      <Image src={mirror.imageUrl} alt={`${mirror.name} Logo`} width={72} height={72} unoptimized />
                    ) : <span>{mirror.symbol.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div>
                    <span className="four-mirror-badge">Flap 已毕业 · 可部署</span>
                    <h2>{mirror.name}</h2>
                    <p>{mirror.symbol} · 毕业 {mirror.graduationTargetBNB} BNB</p>
                  </div>
                </div>
                <p className="four-mirror-description">
                  原合约 {shortAddress(mirror.sourceAddress)}
                  {mirror.createdAt ? ` · 创建于 ${new Date(mirror.createdAt).toLocaleString("zh-CN")}` : ""}
                </p>
                <dl className="four-mirror-metrics">
                  <div><dt>市值</dt><dd>{formatUsd(mirror.marketCapUsd)}</dd></div>
                  <div><dt>24h 交易量</dt><dd>{formatUsd(mirror.volume24hUsd)}</dd></div>
                  <div><dt>流动性</dt><dd>{formatUsd(mirror.liquidityUsd)}</dd></div>
                  <div><dt>持币地址</dt><dd>{mirror.holderCount === null ? "暂无数据" : mirror.holderCount.toLocaleString()}</dd></div>
                  <div><dt>原币买税</dt><dd>{formatTax(mirror.buyTaxPercent)}</dd></div>
                  <div><dt>原币卖税</dt><dd>{formatTax(mirror.sellTaxPercent)}</dd></div>
                </dl>
                {mirror.reasons.length > 0 && (
                  <ul className="four-mirror-reasons">
                    {mirror.reasons.map((reason) => <li key={reason}>{reasonCopy[reason] ?? reason}</li>)}
                  </ul>
                )}
                {mirror.warnings.length > 0 && (
                  <ul className="four-mirror-warnings">
                    {mirror.warnings.map((warning) => (
                      <li key={warning}>提示：{reasonCopy[warning] ?? warning}</li>
                    ))}
                  </ul>
                )}
                <div className="four-mirror-links">
                  <a href={mirror.sourceUrl} target="_blank" rel="noreferrer">Flap 原项目 ↗</a>
                  <a href={`${blockExplorerUrl}/token/${mirror.sourceAddress}`} target="_blank" rel="noreferrer">原合约 ↗</a>
                </div>
                {queueState && (
                  <div className={`four-mirror-item-state ${queueState.status}`}>
                    <strong>{queueState.message}</strong>
                    <div>
                      {queueState.transactionHash && (
                        <a href={`${blockExplorerUrl}/tx/${queueState.transactionHash}`} target="_blank" rel="noreferrer">交易 ↗</a>
                      )}
                      {queueState.token && (
                        <Link href={tokenProjectPath(queueState.token)}>BNBX 代币页 →</Link>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
