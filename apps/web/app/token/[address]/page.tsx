"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatEther, isAddress, maxUint256, parseEther, zeroAddress } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  curveAbi,
  factoryAbi,
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
  const factoryAddress = testnetFactoryAddress ?? zeroAddress;
  const { address: user } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [buyAmount, setBuyAmount] = useState("0.01");
  const [sellAmount, setSellAmount] = useState("0");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [copied, setCopied] = useState(false);
  const [continueAfterApproval, setContinueAfterApproval] = useState(false);
  const autoSellStarted = useRef(false);
  const tradeWrite = useWriteContract();
  const approvalWrite = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: tradeWrite.data });
  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalWrite.data });
  const { t } = useLanguage();

  const curveQuery = useReadContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: "curveOf",
    args: [tokenAddress],
    query: { enabled: factoryAddress !== zeroAddress && tokenAddress !== zeroAddress },
  });
  const curveAddress = curveQuery.data ?? zeroAddress;
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
  const launchManager = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "launchManager",
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

  function executeSell() {
    tradeWrite.writeContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "sell",
      args: [tokenAddress, sellWei, minimumAfterSlippage(quotedSellBNB), deadline()],
    });
  }

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
  }, [approvalReceipt.isSuccess, continueAfterApproval]);

  function setSellPercent(percent: bigint) {
    setSellAmount(formatEther(((balance.data ?? 0n) * percent) / 100n));
  }

  async function copyTokenAddress() {
    await navigator.clipboard.writeText(tokenAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">BNBX</a>
        <WalletButton />
      </header>

      <section className="token-heading">
        <p className="eyebrow">{[t("curveTrading"), t("preparing"), t("pancake")][Number(state.data ?? 0)]}</p>
        <div className="token-identity">
          {metadata?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={metadata.image} alt="" />
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
        <div className="project-links">
          {metadata?.website && <a href={metadata.website} target="_blank" rel="noreferrer">官网 ↗</a>}
          {metadata?.telegram && <a href={metadata.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
          {metadata?.twitter && <a href={metadata.twitter} target="_blank" rel="noreferrer">X / Twitter ↗</a>}
          {metadata?.debox && <a href={metadata.debox} target="_blank" rel="noreferrer">DeBox ↗</a>}
          {metadata?.qq && <a href={metadata.qq} target="_blank" rel="noreferrer">QQ 群 ↗</a>}
          <a
            href={`https://testnet.bscscan.com/token/${tokenAddress}`}
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
        </div>
      </section>

      {curveAddress !== zeroAddress && (
        <BondingCurveChart
          curve={curveAddress}
          symbol={symbol.data ?? "TOKEN"}
        />
      )}

      <section className="trade-layout">
        <article className="card progress-card">
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
                  href={`https://testnet.bscscan.com/address/${liquidityPair.data}`}
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
              <div className="quote-row">
                <span>{t("fee")}</span>
                <strong>{formatEther(buyQuote.data?.[1] ?? 0n)} BNB</strong>
              </div>
              {user && chainId !== bscTestnet.id ? (
                <button className="button wide" type="button" onClick={() => switchChain({ chainId: bscTestnet.id })}>
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
              <div className="quote-row">
                <span>{t("fee")}</span>
                <strong>{formatEther(sellQuote.data?.[1] ?? 0n)} BNB</strong>
              </div>
              {user && chainId !== bscTestnet.id ? (
                <button className="button wide" type="button" onClick={() => switchChain({ chainId: bscTestnet.id })}>
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

          {tradeWrite.data && <p className="notice">{t("txHash")}：{tradeWrite.data}</p>}
          {receipt.isSuccess && <p className="success">{t("confirmed")}</p>}
          {(tradeWrite.error || approvalWrite.error) && (
            <p className="error">{(tradeWrite.error ?? approvalWrite.error)?.message}</p>
          )}
        </article>
      </section>
      {tokenAddress !== zeroAddress && curveAddress !== zeroAddress && (
        <TokenActivity token={tokenAddress} curve={curveAddress} />
      )}
    </main>
  );
}
