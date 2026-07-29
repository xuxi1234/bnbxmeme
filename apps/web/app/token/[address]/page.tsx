"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, isAddress, maxUint256, parseEther, zeroAddress } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bsc } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  curveAbi,
  factoryAbi,
  autoLiquidityFactoryAddress,
  blockExplorerUrl,
  rewardVaultAbi,
  rewardsFactoryAddress,
  testnetFactoryAddress,
  tokenAbi,
} from "@/lib/web3";
import { useTokenMetadata } from "@/lib/metadata";
import { TokenActivity } from "@/components/token-activity";
import { BondingCurveChart } from "@/components/bonding-curve-chart";
import { useLanguage } from "@/components/language-provider";

const SLIPPAGE_BPS = 100n;
const BPS = 10_000n;

function minimumAfterSlippage(value: bigint) {
  return (value * (BPS - SLIPPAGE_BPS)) / BPS;
}

function safeParseEther(value: string) {
  try {
    return parseEther(value || "0");
  } catch {
    return 0n;
  }
}

export default function TokenTradingPage() {
  const params = useParams<{ address: string }>();
  const tokenAddress = isAddress(params.address) ? params.address : zeroAddress;
  const { address: user } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [buyAmount, setBuyAmount] = useState("0.01");
  const [sellAmount, setSellAmount] = useState("0");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [lpAmount, setLPAmount] = useState("0");
  const [copied, setCopied] = useState(false);
  const [qqCopied, setQQCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [continueAfterApproval, setContinueAfterApproval] = useState(false);
  const autoSellStarted = useRef(false);
  const tradeWrite = useWriteContract();
  const approvalWrite = useWriteContract();
  const rewardWrite = useWriteContract();
  const lpApprovalWrite = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: tradeWrite.data });
  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalWrite.data });
  const rewardReceipt = useWaitForTransactionReceipt({ hash: rewardWrite.data });
  const lpApprovalReceipt = useWaitForTransactionReceipt({
    hash: lpApprovalWrite.data,
  });
  const { t } = useLanguage();

  const launchManager = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "launchManager",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  // `launchManager` is deliberately renounced during token creation, so it
  // cannot be used to discover the originating Factory after deployment.
  // Probe both supported factories and use the one that owns a non-zero curve.
  const standardCurveQuery = useReadContract({
    address: testnetFactoryAddress,
    abi: factoryAbi,
    functionName: "curveOf",
    args: [tokenAddress],
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const autoCurveQuery = useReadContract({
    address: autoLiquidityFactoryAddress,
    abi: factoryAbi,
    functionName: "curveOf",
    args: [tokenAddress],
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const configuredRewardsFactory = rewardsFactoryAddress ?? zeroAddress;
  const rewardsCurveQuery = useReadContract({
    address: configuredRewardsFactory,
    abi: factoryAbi,
    functionName: "curveOf",
    args: [tokenAddress],
    query: {
      enabled:
        configuredRewardsFactory !== zeroAddress && tokenAddress !== zeroAddress,
    },
  });
  const standardCurve =
    standardCurveQuery.data && standardCurveQuery.data !== zeroAddress
      ? standardCurveQuery.data
      : zeroAddress;
  const autoCurve =
    autoCurveQuery.data && autoCurveQuery.data !== zeroAddress
      ? autoCurveQuery.data
      : zeroAddress;
  const rewardsCurve =
    rewardsCurveQuery.data && rewardsCurveQuery.data !== zeroAddress
      ? rewardsCurveQuery.data
      : zeroAddress;
  const factoryAddress =
    standardCurve !== zeroAddress
      ? testnetFactoryAddress
      : autoCurve !== zeroAddress
        ? autoLiquidityFactoryAddress
        : rewardsCurve !== zeroAddress
          ? configuredRewardsFactory
          : zeroAddress;
  const curveAddress =
    standardCurve !== zeroAddress
      ? standardCurve
      : autoCurve !== zeroAddress
        ? autoCurve
        : rewardsCurve;
  const isAdvancedTemplate =
    factoryAddress !== zeroAddress &&
    (factoryAddress.toLowerCase() === autoLiquidityFactoryAddress.toLowerCase() ||
      factoryAddress.toLowerCase() === configuredRewardsFactory.toLowerCase());
  const metadataURI = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "tokenMetadataURI",
    args: [tokenAddress],
    query: { enabled: factoryAddress !== zeroAddress && tokenAddress !== zeroAddress },
  });
  const { metadata } = useTokenMetadata(metadataURI.data);

  const name = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "name",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const symbol = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "symbol",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const balance = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [user ?? zeroAddress],
    query: { enabled: Boolean(user) && tokenAddress !== zeroAddress },
  });
  const totalSupply = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "totalSupply",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const graduationAuthority = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "graduationAuthority",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const pairUnlocked = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "liquidityPairUnlocked",
    query: { enabled: tokenAddress !== zeroAddress },
  });
  const allowance = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "allowance",
    args: [user ?? zeroAddress, curveAddress],
    query: { enabled: Boolean(user) && curveAddress !== zeroAddress },
  });
  const principal = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "realBNBPrincipal",
    query: { enabled: curveAddress !== zeroAddress },
  });
  const target = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "graduationTarget",
    query: { enabled: curveAddress !== zeroAddress },
  });
  const state = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "state",
    query: { enabled: curveAddress !== zeroAddress },
  });
  const liquidityPair = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "liquidityPair",
    query: { enabled: curveAddress !== zeroAddress },
  });
  const buyTaxes = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "buyTaxes",
    query: { enabled: tokenAddress !== zeroAddress && isAdvancedTemplate },
  });
  const sellTaxes = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "sellTaxes",
    query: { enabled: tokenAddress !== zeroAddress && isAdvancedTemplate },
  });
  const marketingWallet = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "marketingWallet",
    query: { enabled: tokenAddress !== zeroAddress && isAdvancedTemplate },
  });
  const template = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "template",
    query: { enabled: tokenAddress !== zeroAddress && rewardsCurve !== zeroAddress },
  });
  const rewardVault = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "rewardVault",
    query: { enabled: tokenAddress !== zeroAddress && rewardsCurve !== zeroAddress },
  });
  const minimumRewardShare = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "minimumRewardShare",
    query: { enabled: tokenAddress !== zeroAddress && rewardsCurve !== zeroAddress },
  });
  const rewardVaultAddress = rewardVault.data ?? zeroAddress;
  const isHolderRewards = Number(template.data ?? 0) === 2;
  const isLPRewards = Number(template.data ?? 0) === 3;
  const claimableRewards = useReadContract({
    address: rewardVaultAddress,
    abi: rewardVaultAbi,
    functionName: "claimable",
    args: [user ?? zeroAddress],
    query: { enabled: Boolean(user) && rewardVaultAddress !== zeroAddress },
  });
  const rewardShares = useReadContract({
    address: rewardVaultAddress,
    abi: rewardVaultAbi,
    functionName: "shares",
    args: [user ?? zeroAddress],
    query: { enabled: Boolean(user) && rewardVaultAddress !== zeroAddress },
  });
  const lpTokenAddress = useReadContract({
    address: rewardVaultAddress,
    abi: rewardVaultAbi,
    functionName: "shareAsset",
    query: { enabled: isLPRewards && rewardVaultAddress !== zeroAddress },
  });
  const lpBalance = useReadContract({
    address: lpTokenAddress.data ?? zeroAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [user ?? zeroAddress],
    query: {
      enabled: Boolean(user) && isLPRewards && Boolean(lpTokenAddress.data),
    },
  });
  const lpAllowance = useReadContract({
    address: lpTokenAddress.data ?? zeroAddress,
    abi: tokenAbi,
    functionName: "allowance",
    args: [user ?? zeroAddress, rewardVaultAddress],
    query: {
      enabled: Boolean(user) && isLPRewards && Boolean(lpTokenAddress.data),
    },
  });
  const taxPercent = (value: number | undefined) =>
    `${((value ?? 0) / 100).toFixed(2)}%`;
  const buyTaxTotal = buyTaxes.data
    ? buyTaxes.data.reduce((sum, value) => sum + value, 0)
    : 0;
  const sellTaxTotal = sellTaxes.data
    ? sellTaxes.data.reduce((sum, value) => sum + value, 0)
    : 0;

  const buyWei = safeParseEther(buyAmount);
  const sellWei = safeParseEther(sellAmount);
  const buyQuote = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [buyWei],
    query: {
      enabled: curveAddress !== zeroAddress && buyWei > 0n,
      refetchInterval: 8_000,
    },
  });
  const sellQuote = useReadContract({
    address: curveAddress,
    abi: curveAbi,
    functionName: "quoteSell",
    args: [sellWei],
    query: {
      enabled: curveAddress !== zeroAddress && sellWei > 0n,
      refetchInterval: 8_000,
    },
  });
  const quotedTokens = buyQuote.data?.[3] ?? 0n;
  const quotedSellBNB = sellQuote.data?.[2] ?? 0n;
  const needsApproval = (allowance.data ?? 0n) < sellWei;
  const progress =
    target.data && target.data > 0n
      ? Math.min(100, Number(((principal.data ?? 0n) * 10_000n) / target.data) / 100)
      : 0;
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const lpWei = safeParseEther(lpAmount);

  function buy() {
    if (!user) return;
    tradeWrite.writeContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "buy",
      args: [tokenAddress, minimumAfterSlippage(quotedTokens), deadline(), user],
      value: buyWei,
    });
  }

  const executeSell = useCallback(() => {
    tradeWrite.writeContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "sell",
      args: [tokenAddress, sellWei, minimumAfterSlippage(quotedSellBNB), deadline()],
    });
  }, [factoryAddress, quotedSellBNB, sellWei, tokenAddress, tradeWrite]);

  function sell() {
    if (needsApproval) {
      autoSellStarted.current = false;
      setContinueAfterApproval(true);
      approvalWrite.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "approve",
        args: [curveAddress, maxUint256],
      });
      return;
    }
    executeSell();
  }

  useEffect(() => {
    if (
      continueAfterApproval &&
      approvalReceipt.isSuccess &&
      !autoSellStarted.current
    ) {
      autoSellStarted.current = true;
      setContinueAfterApproval(false);
      executeSell();
    }
  }, [approvalReceipt.isSuccess, continueAfterApproval, executeSell]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    void Promise.all([
      balance.refetch(),
      allowance.refetch(),
      principal.refetch(),
      target.refetch(),
      state.refetch(),
      buyQuote.refetch(),
      sellQuote.refetch(),
    ]);
  }, [
    allowance,
    balance,
    buyQuote,
    principal,
    receipt.isSuccess,
    sellQuote,
    state,
    target,
  ]);

  useEffect(() => {
    if (!rewardReceipt.isSuccess && !lpApprovalReceipt.isSuccess) return;
    void Promise.all([
      claimableRewards.refetch(),
      rewardShares.refetch(),
      lpBalance.refetch(),
      lpAllowance.refetch(),
    ]);
  }, [
    claimableRewards,
    lpAllowance,
    lpApprovalReceipt.isSuccess,
    lpBalance,
    rewardReceipt.isSuccess,
    rewardShares,
  ]);

  function setSellPercent(percent: bigint) {
    setSellAmount(formatEther(((balance.data ?? 0n) * percent) / 100n));
  }

  function claimRewards() {
    if (!user || rewardVaultAddress === zeroAddress) return;
    rewardWrite.writeContract({
      address: rewardVaultAddress,
      abi: rewardVaultAbi,
      functionName: "claim",
      args: [user],
    });
  }

  function approveLP() {
    if (!lpTokenAddress.data || rewardVaultAddress === zeroAddress) return;
    lpApprovalWrite.writeContract({
      address: lpTokenAddress.data,
      abi: tokenAbi,
      functionName: "approve",
      args: [rewardVaultAddress, maxUint256],
    });
  }

  function stakeLP() {
    rewardWrite.writeContract({
      address: rewardVaultAddress,
      abi: rewardVaultAbi,
      functionName: "stakeLP",
      args: [lpWei],
    });
  }

  function withdrawLP() {
    if (!user) return;
    rewardWrite.writeContract({
      address: rewardVaultAddress,
      abi: rewardVaultAbi,
      functionName: "withdrawLP",
      args: [lpWei, user],
    });
  }

  async function copyTokenAddress() {
    await navigator.clipboard.writeText(tokenAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  async function copyQQGroupNumber() {
    if (!metadata?.qqGroupNumber) return;
    await navigator.clipboard.writeText(metadata.qqGroupNumber);
    setQQCopied(true);
    window.setTimeout(() => setQQCopied(false), 2_400);
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">BNBX</Link>
        <WalletButton />
      </header>

      <section className="token-heading">
        <p className="eyebrow">{[t("curveTrading"), t("preparing"), t("pancake")][Number(state.data ?? 0)]}</p>
        <div className="token-identity">
          {metadata?.image && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={metadata.image}
              alt=""
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="token-detail-avatar" aria-hidden="true">
              {String(symbol.data ?? "?").slice(0, 2)}
            </span>
          )}
          <div>
            <h1 className="form-title">{name.data ?? "代币"}</h1>
            <p className="lead">${symbol.data ?? "—"}</p>
            <button
              className="copy-address"
              type="button"
              onClick={copyTokenAddress}
              title={t("copy")}
            >
              <span>{tokenAddress}</span>
              <strong>{copied ? t("copied") : t("copy")}</strong>
            </button>
          </div>
        </div>
        {metadata?.description && (
          <p className="token-description">{metadata.description}</p>
        )}
        {isAdvancedTemplate && (
          <section className="tax-template-card">
            <div className="tax-template-heading">
              <div>
                <span className="eyebrow">
                  {isHolderRewards
                    ? "HOLDER REWARDS TEMPLATE"
                    : isLPRewards
                      ? "LP REWARDS TEMPLATE"
                      : "AUTO LIQUIDITY TEMPLATE"}
                </span>
                <strong>
                  {isHolderRewards
                    ? "持币分红代币"
                    : isLPRewards
                      ? "添加 LP 分红代币"
                      : "自动回流代币"}
                </strong>
              </div>
              <span>买入税 {taxPercent(buyTaxTotal)} · 卖出税 {taxPercent(sellTaxTotal)}</span>
            </div>
            <div className="tax-breakdown">
              <div>
                <span>买入税分配</span>
                <strong>
                  销毁 {taxPercent(buyTaxes.data?.[0])} · 回流 {taxPercent(buyTaxes.data?.[1])} ·
                  营销 {taxPercent(buyTaxes.data?.[2])} · 分红 {taxPercent(buyTaxes.data?.[3])}
                </strong>
              </div>
              <div>
                <span>卖出税分配</span>
                <strong>
                  销毁 {taxPercent(sellTaxes.data?.[0])} · 回流 {taxPercent(sellTaxes.data?.[1])} ·
                  营销 {taxPercent(sellTaxes.data?.[2])} · 分红 {taxPercent(sellTaxes.data?.[3])}
                </strong>
              </div>
              <div>
                <span>营销钱包</span>
                <strong>{marketingWallet.data ?? "读取中…"}</strong>
              </div>
            </div>
          </section>
        )}
        {(isHolderRewards || isLPRewards) && (
          <section className="tax-template-card">
            <div className="tax-template-heading">
              <div>
                <span className="eyebrow">BNB REWARD VAULT</span>
                <strong>
                  {isHolderRewards ? "持币分红金库" : "LP 质押分红金库"}
                </strong>
              </div>
              <span>
                可领取 {formatEther(claimableRewards.data ?? 0n)} BNB
              </span>
            </div>
            <div className="tax-breakdown">
              <div>
                <span>我的分红权重</span>
                <strong>{formatEther(rewardShares.data ?? 0n)}</strong>
              </div>
              {isHolderRewards && (
                <div>
                  <span>最低持币门槛</span>
                  <strong>
                    {formatEther(minimumRewardShare.data ?? 0n)}{" "}
                    {symbol.data ?? "TOKEN"}
                  </strong>
                </div>
              )}
              {isLPRewards && (
                <>
                  <div>
                    <span>钱包可用 LP</span>
                    <strong>{formatEther(lpBalance.data ?? 0n)} LP</strong>
                  </div>
                  <label>
                    质押或取回 LP 数量
                    <input
                      min="0"
                      step="0.000000001"
                      value={lpAmount}
                      onChange={(event) => setLPAmount(event.target.value)}
                    />
                  </label>
                  <div className="amount-presets">
                    <button
                      type="button"
                      onClick={() =>
                        setLPAmount(formatEther(lpBalance.data ?? 0n))
                      }
                    >
                      全部可用 LP
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLPAmount(formatEther(rewardShares.data ?? 0n))
                      }
                    >
                      全部已质押 LP
                    </button>
                  </div>
                  {(lpAllowance.data ?? 0n) < lpWei ? (
                    <button
                      className="button"
                      type="button"
                      disabled={
                        !user ||
                        lpWei === 0n ||
                        lpApprovalWrite.isPending ||
                        lpApprovalReceipt.isLoading
                      }
                      onClick={approveLP}
                    >
                      授权 LP
                    </button>
                  ) : (
                    <button
                      className="button"
                      type="button"
                      disabled={!user || lpWei === 0n || rewardWrite.isPending}
                      onClick={stakeLP}
                    >
                      质押 LP
                    </button>
                  )}
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      !user ||
                      lpWei === 0n ||
                      lpWei > (rewardShares.data ?? 0n) ||
                      rewardWrite.isPending
                    }
                    onClick={withdrawLP}
                  >
                    取回 LP
                  </button>
                </>
              )}
              <button
                className="button"
                type="button"
                disabled={
                  !user ||
                  (claimableRewards.data ?? 0n) === 0n ||
                  rewardWrite.isPending ||
                  rewardReceipt.isLoading
                }
                onClick={claimRewards}
              >
                领取 BNB 分红
              </button>
              {(rewardWrite.error || lpApprovalWrite.error) && (
                <p className="error">
                  {(rewardWrite.error ?? lpApprovalWrite.error)?.message}
                </p>
              )}
            </div>
          </section>
        )}
        <div className="project-links">
          {metadata?.website && <a href={metadata.website} target="_blank" rel="noreferrer">官网 ↗</a>}
          {metadata?.telegram && <a href={metadata.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
          {metadata?.twitter && <a href={metadata.twitter} target="_blank" rel="noreferrer">X / Twitter ↗</a>}
          {metadata?.debox && <a href={metadata.debox} target="_blank" rel="noreferrer">DeBox ↗</a>}
          {metadata?.qqGroupNumber && (
            <button
              className="qq-group-copy"
              type="button"
              onClick={copyQQGroupNumber}
              title={t("copy")}
            >
              <span>{t("qqGroupNumber")}：{metadata.qqGroupNumber}</span>
              <strong aria-hidden="true">⧉</strong>
            </button>
          )}
          <a
            href={`${blockExplorerUrl}/token/${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            BscScan ↗
          </a>
          <a
            href={`https://ave.ai/token/${tokenAddress}-bsc`}
            target="_blank"
            rel="noreferrer"
          >
            AVE.AI ↗
          </a>
          <a
            href={`https://dexscreener.com/bsc/${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            DexScreener ↗
          </a>
          <a
            href={`https://www.dextools.io/app/en/bnb/pair-explorer/${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            DEXTools ↗
          </a>
          <a
            href={`https://dex.coinmarketcap.com/token/BSC/${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            CoinMarketCap ↗
          </a>
          <a
            href={`https://gmgn.ai/bsc/token/bnbxmeme_${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            GMGN.AI ↗
          </a>
        </div>
        {qqCopied && (
          <div className="copy-toast" role="status" aria-live="polite">
            {t("qqGroupCopied")}
          </div>
        )}
      </section>

      <section className="token-workspace">
      {curveAddress !== zeroAddress && (
        <BondingCurveChart
          curve={curveAddress}
          symbol={symbol.data ?? "TOKEN"}
          refreshKey={receipt.isSuccess ? tradeWrite.data : undefined}
        />
      )}

      <section className="trade-layout" id="trade">
        <article className="card progress-card">
          <h2 className="section-title">{t("safetyTitle")}</h2>
          <span>{t("progress")}</span>
          <strong>{progress.toFixed(2)}%</strong>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <span>
            {formatEther(principal.data ?? 0n)} / {formatEther(target.data ?? 0n)} BNB
          </span>
          <span>{t("myBalance")}：{formatEther(balance.data ?? 0n)}</span>
          <div className="security-facts">
            <div>
              <span>{t("verifiedFactory")}</span>
              <a href={`${blockExplorerUrl}/address/${factoryAddress}`} target="_blank" rel="noreferrer">{t("verified")} ↗</a>
            </div>
            <div>
              <span>{t("tokenTax")}</span>
              <strong>{isAdvancedTemplate ? `${taxPercent(buyTaxTotal)} / ${taxPercent(sellTaxTotal)}` : t("zeroTax")}</strong>
            </div>
            <div><span>{t("fixedFee")}</span><strong>0.5%</strong></div>
            <div><span>{t("slippage")}</span><strong>1%</strong></div>
            <div>
              <span>{t("supply")}</span>
              <strong>
                {Number(formatEther(totalSupply.data ?? 0n)).toLocaleString()} 枚
              </strong>
            </div>
            <div>
              <span>{t("factoryPermission")}</span>
              <strong>
                {launchManager.data === zeroAddress ? t("abandoned") : t("loading")}
              </strong>
            </div>
            <div>
              <span>{t("graduationPermission")}</span>
              <strong>
                {graduationAuthority.data === zeroAddress
                  ? t("destroyed")
                  : graduationAuthority.data === curveAddress
                    ? t("curveOnly")
                    : t("loading")}
              </strong>
            </div>
            <div>
              <span>Pancake Pair</span>
              {liquidityPair.data ? (
                <a
                  href={`${blockExplorerUrl}/address/${liquidityPair.data}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {liquidityPair.data.slice(0, 6)}…
                  {liquidityPair.data.slice(-4)} ↗
                </a>
              ) : (
                <strong>{t("loading")}</strong>
              )}
            </div>
            <div>
              <span>{t("pairStatus")}</span>
              <strong>
                {pairUnlocked.data ? t("unlocked") : t("protected")}
              </strong>
            </div>
          </div>
        </article>

        <article className="launch-form trade-box">
          <div className="trade-tabs">
            <button
              className={tradeMode === "buy" ? "active buy" : ""}
              type="button"
              onClick={() => setTradeMode("buy")}
            >{t("buy")}</button>
            <button
              className={tradeMode === "sell" ? "active sell" : ""}
              type="button"
              onClick={() => setTradeMode("sell")}
            >{t("sell")}</button>
          </div>

          {tradeMode === "buy" ? (
            <>
              <label>
                {t("buyWith")}
                <input
                  min="0.000000001"
                  step="0.000000001"
                  value={buyAmount}
                  onChange={(event) => setBuyAmount(event.target.value)}
                />
              </label>
              <div className="amount-presets">
                {["0.1", "0.5", "1"].map((amount) => (
                  <button key={amount} type="button" onClick={() => setBuyAmount(amount)}>
                    {amount} BNB
                  </button>
                ))}
              </div>
              <div className="quote-row">
                <span>{t("expectedGet")}</span>
                <strong>{formatEther(quotedTokens)} {symbol.data ?? "TOKEN"}</strong>
              </div>
              {!user ? (
                <WalletButton
                  className="button wide trade-submit buy"
                  connectLabel={`${t("buy")} · ${t("connectWallet")}`}
                />
              ) : chainId !== bsc.id ? (
                <button className="button wide" type="button" onClick={() => switchChain({ chainId: bsc.id })}>
                  {t("switchNetwork")}
                </button>
              ) : (
                <button
                  className="button wide trade-submit buy"
                  type="button"
                  disabled={!user || factoryAddress === zeroAddress || curveAddress === zeroAddress || buyWei === 0n || quotedTokens === 0n || tradeWrite.isPending || Number(state.data ?? 0) !== 0}
                  onClick={buy}
                >{t("buy")}</button>
              )}
            </>
          ) : (
            <>
              <label>
                {t("sellToken")}
                <input
                  min="0"
                  step="0.000000001"
                  value={sellAmount}
                  onChange={(event) => setSellAmount(event.target.value)}
                />
              </label>
              <div className="amount-presets">
                {[25n, 50n, 100n].map((percent) => (
                  <button key={percent.toString()} type="button" onClick={() => setSellPercent(percent)}>
                    {percent.toString()}%
                  </button>
                ))}
              </div>
              <div className="trade-balance">{t("balance")}: {formatEther(balance.data ?? 0n)} {symbol.data ?? "TOKEN"}</div>
              <div className="quote-row">
                <span>{t("expectedReceive")}</span>
                <strong>{formatEther(quotedSellBNB)} BNB</strong>
              </div>
              {!user ? (
                <WalletButton
                  className="button wide trade-submit sell"
                  connectLabel={`${t("sell")} · ${t("connectWallet")}`}
                />
              ) : chainId !== bsc.id ? (
                <button className="button wide" type="button" onClick={() => switchChain({ chainId: bsc.id })}>
                  {t("switchNetwork")}
                </button>
              ) : (
            <button
                  className="button wide trade-submit sell"
              type="button"
                  disabled={!user || factoryAddress === zeroAddress || curveAddress === zeroAddress || sellWei === 0n || quotedSellBNB === 0n || tradeWrite.isPending || approvalWrite.isPending || approvalReceipt.isLoading || Number(state.data ?? 0) !== 0}
              onClick={sell}
            >
                  {approvalWrite.isPending || approvalReceipt.isLoading
                    ? t("approving")
                    : tradeWrite.isPending
                      ? t("selling")
                      : needsApproval
                        ? t("firstApproveSell")
                        : t("sell")}
            </button>
              )}
            </>
          )}

          {tradeWrite.data && (
            <a
              className="trade-tx-link"
              href={`${blockExplorerUrl}/tx/${tradeWrite.data}`}
              target="_blank"
              rel="noreferrer"
            >
              <span>{t("txHash")}</span>
              <strong>{tradeWrite.data.slice(0, 10)}…{tradeWrite.data.slice(-8)} ↗</strong>
            </a>
          )}
          {(approvalWrite.isPending || approvalWrite.data || tradeWrite.isPending || tradeWrite.data || receipt.isLoading || receipt.isSuccess) && (
            <div className="transaction-status" role="status" aria-live="polite">
              <strong>{t("txStatus")}</strong>
              <ol>
                <li className={tradeWrite.data || approvalWrite.data ? "done" : "active"}>{t("walletStep")}</li>
                <li className={tradeWrite.data ? "done" : approvalWrite.data || tradeWrite.isPending ? "active" : ""}>{t("broadcastStep")}</li>
                <li className={receipt.isSuccess ? "done" : tradeWrite.data ? "active" : ""}>{t("confirmStep")}</li>
                <li className={receipt.isSuccess ? "done" : ""}>{t("syncStep")}</li>
              </ol>
            </div>
          )}
          {receipt.isSuccess && <p className="success">{t("confirmed")}</p>}
          {(tradeWrite.error || approvalWrite.error) && (
            <p className="error">{(tradeWrite.error ?? approvalWrite.error)?.message}</p>
          )}
        </article>
      </section>
      </section>
      {tokenAddress !== zeroAddress && curveAddress !== zeroAddress && (
        <TokenActivity
          token={tokenAddress}
          curve={curveAddress}
          refreshKey={receipt.isSuccess ? tradeWrite.data : undefined}
        />
      )}
    </main>
  );
}
