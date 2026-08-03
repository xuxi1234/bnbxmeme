"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  formatEther,
  isAddress,
  maxUint256,
  parseEther,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { curveAbi, factoryAbi, tokenAbi } from "@/lib/web3";
import { advancedFactoryAbi } from "@/lib/advanced-factory-abi";
import {
  BSC_TESTNET_EXPLORER,
  TESTNET_BUSD,
  TESTNET_CREATION_FEE,
  TESTNET_GRADUATION_BUY,
  TESTNET_PANCAKE_ROUTER,
  TESTNET_REWARDS_FACTORY,
  TESTNET_STANDARD_FACTORY,
  TESTNET_ACCEPTANCE_TOKEN_STORAGE_KEY,
  TESTNET_VANITY_CHUNK,
  TESTNET_VANITY_LIMIT,
  acceptanceErc20Abi,
  acceptanceFactory,
  acceptanceRewardVaultAbi,
  acceptanceRouterAbi,
  acceptanceTokenCandidate,
  buildAcceptanceCreateRequest,
  normalizeAcceptanceAddress,
  tokenCreatedFromReceipt,
  type AcceptanceTemplate,
} from "@/lib/testnet-acceptance";

const ZERO_SALT = `0x${"00".repeat(32)}` as const;
const CREATE_GAS_LIMIT = 12_000_000n;

type Snapshot = {
  factory: `0x${string}`;
  curve: `0x${string}`;
  name: string;
  symbol: string;
  balance: bigint;
  state: number;
  principal: bigint;
  target: bigint;
  vault: `0x${string}`;
  claimable: bigint;
  shares: bigint;
  shareAsset: `0x${string}`;
  lpBalance: bigint;
  rewardBalance: bigint;
};

type TxRecord = { label: string; hash: `0x${string}` };

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function safeAmount(value: string) {
  try {
    return parseEther(value || "0");
  } catch {
    return 0n;
  }
}

export default function AcceptanceTestnetPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: bscTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const [template, setTemplate] = useState<AcceptanceTemplate>("standard");
  const [name, setName] = useState("BNBX V4 Acceptance");
  const [symbol, setSymbol] = useState("V4TEST");
  const [token, setToken] = useState("");
  const [buyAmount, setBuyAmount] = useState("0.001");
  const [sellAmount, setSellAmount] = useState("1000000");
  const [transferAmount, setTransferAmount] = useState("1");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [rewardAmount, setRewardAmount] = useState("1");
  const [claimForAccount, setClaimForAccount] = useState("");
  const [liquidityTokenAmount, setLiquidityTokenAmount] = useState("1000000");
  const [liquidityBNB, setLiquidityBNB] = useState("0.0001");
  const [lpAmount, setLPAmount] = useState("0.000001");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const restoredForAccount = useRef("");

  const wrongChain = isConnected && chainId !== bscTestnet.id;
  const configuredFactory = acceptanceFactory(template);
  const tokenAddress = normalizeAcceptanceAddress(token);
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const readiness = useMemo(
    () => [
      { label: "BSC Testnet", ok: chainId === bscTestnet.id },
      { label: "0 税 Factory", ok: Boolean(TESTNET_STANDARD_FACTORY) },
      { label: "V4 分红 Factory", ok: Boolean(TESTNET_REWARDS_FACTORY) },
      { label: "测试网 BUSD", ok: Boolean(TESTNET_BUSD) },
    ],
    [chainId],
  );

  const loadSnapshot = useCallback(
    async (candidate?: `0x${string}`) => {
      const selected = candidate ?? tokenAddress;
      if (!publicClient || !selected || !address) return;
      setBusy("读取链上状态");
      setError("");
      try {
        const [standardCurve, rewardsCurve] = await Promise.all([
          publicClient.readContract({
            address: TESTNET_STANDARD_FACTORY,
            abi: factoryAbi,
            functionName: "curveOf",
            args: [selected],
          }),
          publicClient.readContract({
            address: TESTNET_REWARDS_FACTORY,
            abi: factoryAbi,
            functionName: "curveOf",
            args: [selected],
          }),
        ]);
        const factory =
          standardCurve !== zeroAddress
            ? TESTNET_STANDARD_FACTORY
            : rewardsCurve !== zeroAddress
              ? TESTNET_REWARDS_FACTORY
              : zeroAddress;
        const curve =
          standardCurve !== zeroAddress ? standardCurve : rewardsCurve;
        if (factory === zeroAddress || curve === zeroAddress) {
          throw new Error("该代币不属于本次 V4 测试网 Factory");
        }
        const [tokenName, tokenSymbol, balance, state, principal, target] =
          await Promise.all([
            publicClient.readContract({
              address: selected,
              abi: tokenAbi,
              functionName: "name",
            }),
            publicClient.readContract({
              address: selected,
              abi: tokenAbi,
              functionName: "symbol",
            }),
            publicClient.readContract({
              address: selected,
              abi: tokenAbi,
              functionName: "balanceOf",
              args: [address],
            }),
            publicClient.readContract({
              address: curve,
              abi: curveAbi,
              functionName: "state",
            }),
            publicClient.readContract({
              address: curve,
              abi: curveAbi,
              functionName: "realBNBPrincipal",
            }),
            publicClient.readContract({
              address: curve,
              abi: curveAbi,
              functionName: "graduationTarget",
            }),
          ]);

        let vault: `0x${string}` = zeroAddress;
        let claimable = 0n;
        let shares = 0n;
        let shareAsset: `0x${string}` = zeroAddress;
        let lpBalance = 0n;
        let rewardBalance = 0n;
        if (factory === TESTNET_REWARDS_FACTORY) {
          vault = await publicClient.readContract({
            address: selected,
            abi: tokenAbi,
            functionName: "rewardVault",
          });
          [claimable, shares, shareAsset, rewardBalance] = await Promise.all([
            publicClient.readContract({
              address: vault,
              abi: acceptanceRewardVaultAbi,
              functionName: "claimable",
              args: [address],
            }),
            publicClient.readContract({
              address: vault,
              abi: acceptanceRewardVaultAbi,
              functionName: "shares",
              args: [address],
            }),
            publicClient.readContract({
              address: vault,
              abi: acceptanceRewardVaultAbi,
              functionName: "shareAsset",
            }),
            publicClient.readContract({
              address: TESTNET_BUSD,
              abi: acceptanceErc20Abi,
              functionName: "balanceOf",
              args: [address],
            }),
          ]);
          if (shareAsset !== zeroAddress) {
            lpBalance = await publicClient.readContract({
              address: shareAsset,
              abi: acceptanceErc20Abi,
              functionName: "balanceOf",
              args: [address],
            });
          }
        }
        setSnapshot({
          factory,
          curve,
          name: tokenName,
          symbol: tokenSymbol,
          balance,
          state,
          principal,
          target,
          vault,
          claimable,
          shares,
          shareAsset,
          lpBalance,
          rewardBalance,
        });
        window.localStorage.setItem(
          TESTNET_ACCEPTANCE_TOKEN_STORAGE_KEY,
          selected,
        );
        const restoredUrl = new URL(window.location.href);
        restoredUrl.searchParams.set("token", selected);
        window.history.replaceState(null, "", restoredUrl);
      } catch (cause) {
        setSnapshot(null);
        setError(cause instanceof Error ? cause.message : "读取链上状态失败");
      } finally {
        setBusy("");
      }
    },
    [address, publicClient, tokenAddress],
  );

  useEffect(() => {
    if (!address || !publicClient || restoredForAccount.current === address)
      return;
    restoredForAccount.current = address;
    const restored = acceptanceTokenCandidate(
      window.location.search,
      window.localStorage.getItem(TESTNET_ACCEPTANCE_TOKEN_STORAGE_KEY),
    );
    if (!restored) return;
    setToken(restored);
    setTransferRecipient(address);
    setClaimForAccount(address);
    void loadSnapshot(restored);
  }, [address, loadSnapshot, publicClient]);

  async function runTransaction(
    label: string,
    submit: () => Promise<`0x${string}`>,
    refresh = true,
  ) {
    if (!publicClient) {
      setError("BSC Testnet 连接尚未就绪，请刷新后重试");
      return null;
    }
    setBusy(label);
    setError("");
    try {
      const hash = await submit();
      setTransactions((items) => [{ label, hash }, ...items]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`${label}已上链但执行回滚，请打开交易记录检查`);
      }
      if (refresh && tokenAddress) await loadSnapshot(tokenAddress);
      return hash;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label}失败`);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function findVanitySalt() {
    if (!publicClient || !address) throw new Error("请先连接钱包");
    const start = (BigInt(Date.now()) << 160n) | BigInt(address);
    const emptyRequest = buildAcceptanceCreateRequest({
      template,
      name,
      symbol,
      creator: address,
      vanitySalt: ZERO_SALT,
    });
    for (
      let index = 0;
      index < TESTNET_VANITY_LIMIT;
      index += TESTNET_VANITY_CHUNK
    ) {
      const result =
        template === "standard"
          ? await publicClient.readContract({
              address: TESTNET_STANDARD_FACTORY,
              abi: factoryAbi,
              functionName: "findVanitySalt",
              args: [
                emptyRequest.name,
                emptyRequest.symbol,
                start + BigInt(index),
                BigInt(TESTNET_VANITY_CHUNK),
              ],
            })
          : await publicClient.readContract({
              address: TESTNET_REWARDS_FACTORY,
              abi: advancedFactoryAbi,
              functionName: "findVanitySalt",
              args: [
                emptyRequest as ReturnType<
                  typeof buildAcceptanceCreateRequest
                > & {
                  marketingWallet: `0x${string}`;
                },
                start + BigInt(index),
                BigInt(TESTNET_VANITY_CHUNK),
              ],
            });
      if (result[0]) return result[1];
      setProgress(
        Math.round(
          ((index + TESTNET_VANITY_CHUNK) / TESTNET_VANITY_LIMIT) * 100,
        ),
      );
    }
    throw new Error("50 万次搜索内未找到 1111 尾号，请重试");
  }

  async function createToken() {
    if (!address || !publicClient || wrongChain) return;
    setBusy("搜索 1111 尾号");
    setError("");
    setProgress(0);
    try {
      const vanitySalt = await findVanitySalt();
      const request = buildAcceptanceCreateRequest({
        template,
        name,
        symbol,
        creator: address,
        vanitySalt,
      });
      setBusy("创建测试代币");
      const hash =
        template === "standard"
          ? await writeContractAsync({
              address: TESTNET_STANDARD_FACTORY,
              abi: factoryAbi,
              functionName: "createVanityToken",
              args: [request],
              value: TESTNET_CREATION_FEE,
              gas: CREATE_GAS_LIMIT,
              account: address,
              chain: bscTestnet,
            })
          : await writeContractAsync({
              address: TESTNET_REWARDS_FACTORY,
              abi: advancedFactoryAbi,
              functionName: "createVanityToken",
              args: [
                request as ReturnType<typeof buildAcceptanceCreateRequest> & {
                  marketingWallet: `0x${string}`;
                },
              ],
              value: TESTNET_CREATION_FEE,
              gas: CREATE_GAS_LIMIT,
              account: address,
              chain: bscTestnet,
            });
      setTransactions((items) => [
        { label: `创建 ${template}`, hash },
        ...items,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("创建交易已上链但执行回滚，请打开交易记录检查");
      }
      const created = tokenCreatedFromReceipt(receipt, template);
      if (!created) throw new Error("交易成功，但未解析到 TokenCreated 事件");
      setToken(created.token);
      setTransferRecipient(address);
      setClaimForAccount(address);
      await loadSnapshot(created.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    } finally {
      setBusy("");
      setProgress(0);
    }
  }

  const ensureTrading = () => {
    if (!address || !tokenAddress || !snapshot) {
      throw new Error("请先加载本次测试代币");
    }
    return { address, tokenAddress, factory: snapshot.factory };
  };

  async function buy(value = safeAmount(buyAmount)) {
    const context = ensureTrading();
    await runTransaction("曲线买入", () =>
      writeContractAsync({
        address: context.factory,
        abi: factoryAbi,
        functionName: "buy",
        args: [context.tokenAddress, 0n, deadline(), context.address],
        value,
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function approveCurve() {
    const context = ensureTrading();
    await runTransaction("授权卖出", () =>
      writeContractAsync({
        address: context.tokenAddress,
        abi: acceptanceErc20Abi,
        functionName: "approve",
        args: [snapshot!.curve, maxUint256],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  function selectSellPercent(percent: 25 | 50 | 100) {
    if (!snapshot) return;
    setSellAmount(formatEther((snapshot.balance * BigInt(percent)) / 100n));
  }

  async function sell() {
    const context = ensureTrading();
    const tokensIn = safeAmount(sellAmount);
    if (tokensIn === 0n) {
      setError("卖出数量必须大于 0");
      return;
    }
    if (tokensIn > snapshot!.balance) {
      setError("卖出数量不能超过钱包持币余额");
      return;
    }
    await runTransaction("曲线卖出", () =>
      writeContractAsync({
        address: context.factory,
        abi: factoryAbi,
        functionName: "sell",
        args: [context.tokenAddress, tokensIn, 0n, deadline()],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function transferToken() {
    const context = ensureTrading();
    if (!isAddress(transferRecipient)) {
      setError("请输入有效的接收地址");
      return;
    }
    await runTransaction("代币转账", () =>
      writeContractAsync({
        address: context.tokenAddress,
        abi: acceptanceErc20Abi,
        functionName: "transfer",
        args: [transferRecipient, safeAmount(transferAmount)],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  function requireVault() {
    const context = ensureTrading();
    if (snapshot!.vault === zeroAddress) throw new Error("该代币没有分红金库");
    return { ...context, vault: snapshot!.vault };
  }

  async function fundVault() {
    const context = requireVault();
    await runTransaction("转入测试网 BUSD", () =>
      writeContractAsync({
        address: TESTNET_BUSD,
        abi: acceptanceErc20Abi,
        functionName: "transfer",
        args: [context.vault, safeAmount(rewardAmount)],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function vaultAction(
    label: string,
    functionName: "syncRewards" | "processRewards" | "claim" | "claimFor",
  ) {
    if (wrongChain) {
      setError("请先将钱包切换到 BSC Testnet");
      switchChain({ chainId: bscTestnet.id });
      return;
    }
    try {
      const context = requireVault();
      const args =
        functionName === "processRewards"
          ? ([500_000n] as const)
          : functionName === "claim"
            ? ([context.address] as const)
            : functionName === "claimFor"
              ? ([
                  isAddress(claimForAccount)
                    ? claimForAccount
                    : context.address,
                ] as const)
              : ([] as const);
      await runTransaction(label, () =>
        writeContractAsync({
          address: context.vault,
          abi: acceptanceRewardVaultAbi,
          functionName,
          args,
          account: context.address,
          chain: bscTestnet,
          ...(functionName === "syncRewards" ? { gas: 500_000n } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label}失败`);
    }
  }

  async function approveRouter() {
    const context = ensureTrading();
    await runTransaction("授权 Pancake Router", () =>
      writeContractAsync({
        address: context.tokenAddress,
        abi: acceptanceErc20Abi,
        functionName: "approve",
        args: [TESTNET_PANCAKE_ROUTER, maxUint256],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function addLiquidity() {
    const context = ensureTrading();
    await runTransaction("添加测试网 LP", () =>
      writeContractAsync({
        address: TESTNET_PANCAKE_ROUTER,
        abi: acceptanceRouterAbi,
        functionName: "addLiquidityETH",
        args: [
          context.tokenAddress,
          safeAmount(liquidityTokenAmount),
          0n,
          0n,
          context.address,
          deadline(),
        ],
        value: safeAmount(liquidityBNB),
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function approveLP() {
    const context = requireVault();
    if (snapshot!.shareAsset === zeroAddress)
      throw new Error("LP 地址尚未配置");
    await runTransaction("授权 LP 金库", () =>
      writeContractAsync({
        address: snapshot!.shareAsset,
        abi: acceptanceErc20Abi,
        functionName: "approve",
        args: [context.vault, maxUint256],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  async function stakeOrWithdrawLP(withdraw: boolean) {
    const context = requireVault();
    await runTransaction(withdraw ? "提取 LP" : "质押 LP", () =>
      writeContractAsync({
        address: context.vault,
        abi: acceptanceRewardVaultAbi,
        functionName: withdraw ? "withdrawLP" : "stakeLP",
        args: withdraw
          ? [safeAmount(lpAmount), context.address]
          : [safeAmount(lpAmount)],
        account: context.address,
        chain: bscTestnet,
      }),
    );
  }

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">
          BNBX
        </Link>
        <WalletButton />
      </header>

      <section className="form-shell">
        <p className="eyebrow">BSC TESTNET / V4 ACCEPTANCE ONLY</p>
        <h1 className="form-title">V4 隔离测试网验收控制台</h1>
        <p className="lead">
          此页面只允许 Chain ID
          97，并固定使用本轮新部署合约。它不会读取或修改正式站主网 Factory。
        </p>

        <div className="launch-form">
          <section className="transaction-preview" aria-label="固定配置">
            <div className="transaction-preview-heading">
              <strong>固定测试网配置</strong>
              <span>Production 隔离</span>
            </div>
            <dl>
              {readiness.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.ok ? "✓" : "×"}</dd>
                </div>
              ))}
              <div>
                <dt>0 税 Factory</dt>
                <dd title={TESTNET_STANDARD_FACTORY}>
                  {shortAddress(TESTNET_STANDARD_FACTORY)}
                </dd>
              </div>
              <div>
                <dt>分红 Factory</dt>
                <dd title={TESTNET_REWARDS_FACTORY}>
                  {shortAddress(TESTNET_REWARDS_FACTORY)}
                </dd>
              </div>
            </dl>
          </section>

          {!isConnected ? (
            <p className="notice">请先连接钱包，然后切换到 BSC Testnet。</p>
          ) : wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bscTestnet.id })}
            >
              切换到 BSC Testnet
            </button>
          ) : (
            <p className="notice">钱包与网络正确，可以开始测试网签名。</p>
          )}

          <fieldset>
            <legend>1. 创建测试代币</legend>
            <label>
              模板
              <select
                value={template}
                onChange={(event) =>
                  setTemplate(event.target.value as AcceptanceTemplate)
                }
              >
                <option value="standard">永久 0 税</option>
                <option value="holders">持币分红 V4</option>
                <option value="lp">LP 分红 V4</option>
              </select>
            </label>
            <label>
              名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              符号
              <input
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              />
            </label>
            <p className="notice">
              Factory：{configuredFactory}
              <br />
              毕业额度：0.01 tBNB；创建费：0.001 tBNB；高级模板奖励币：Testnet
              BUSD。
            </p>
            <button
              className="button wide"
              type="button"
              disabled={!address || wrongChain || Boolean(busy)}
              onClick={createToken}
            >
              {busy === "搜索 1111 尾号"
                ? `搜索 1111 尾号 ${progress}%`
                : busy === "创建测试代币"
                  ? "等待钱包与链上确认"
                  : "创建测试代币"}
            </button>
          </fieldset>

          <fieldset>
            <legend>2. 加载并交易</legend>
            <label>
              测试代币地址
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="0x…1111"
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={!tokenAddress || !address || Boolean(busy)}
              onClick={() => loadSnapshot()}
            >
              刷新链上状态
            </button>
            {snapshot && (
              <section className="transaction-preview" aria-label="代币状态">
                <div className="transaction-preview-heading">
                  <strong>
                    {snapshot.name} / {snapshot.symbol}
                  </strong>
                  <span>{snapshot.state === 2 ? "已毕业" : "内盘"}</span>
                </div>
                <dl>
                  <div>
                    <dt>Factory</dt>
                    <dd>{shortAddress(snapshot.factory)}</dd>
                  </div>
                  <div>
                    <dt>Curve</dt>
                    <dd>{shortAddress(snapshot.curve)}</dd>
                  </div>
                  <div>
                    <dt>持币</dt>
                    <dd>{formatEther(snapshot.balance)}</dd>
                  </div>
                  <div>
                    <dt>进度</dt>
                    <dd>
                      {formatEther(snapshot.principal)} /{" "}
                      {formatEther(snapshot.target)} BNB
                    </dd>
                  </div>
                  <div>
                    <dt>Vault</dt>
                    <dd>
                      {snapshot.vault === zeroAddress
                        ? "—"
                        : shortAddress(snapshot.vault)}
                    </dd>
                  </div>
                  <div>
                    <dt>Claimable</dt>
                    <dd>{formatEther(snapshot.claimable)} BUSD</dd>
                  </div>
                  <div>
                    <dt>Shares</dt>
                    <dd>{formatEther(snapshot.shares)}</dd>
                  </div>
                  <div>
                    <dt>LP 余额</dt>
                    <dd>{formatEther(snapshot.lpBalance)}</dd>
                  </div>
                </dl>
              </section>
            )}
            <label>
              买入 tBNB
              <input
                value={buyAmount}
                onChange={(event) => setBuyAmount(event.target.value)}
              />
            </label>
            <button
              className="button wide"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={() => buy()}
            >
              曲线买入
            </button>
            <button
              className="button wide"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={() => buy(TESTNET_GRADUATION_BUY)}
            >
              一键打满毕业（最多 0.011 tBNB，超额退回）
            </button>
            <label>
              卖出代币数量
              <input
                value={sellAmount}
                onChange={(event) => setSellAmount(event.target.value)}
              />
            </label>
            <div className="button-row" aria-label="卖出比例">
              {([25, 50, 100] as const).map((percent) => (
                <button
                  className="button secondary"
                  type="button"
                  key={percent}
                  disabled={
                    !snapshot || snapshot.balance === 0n || Boolean(busy)
                  }
                  onClick={() => selectSellPercent(percent)}
                >
                  {percent}%
                </button>
              ))}
            </div>
            <p className="notice">
              卖出授权对象：{snapshot ? shortAddress(snapshot.curve) : "—"}
              （当前曲线合约）
            </p>
            <button
              className="button wide secondary"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={approveCurve}
            >
              先授权 Curve
            </button>
            <button
              className="button wide"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={sell}
            >
              曲线卖出
            </button>
            <label>
              转账接收地址
              <input
                value={transferRecipient}
                onChange={(event) => setTransferRecipient(event.target.value)}
              />
            </label>
            <label>
              转账数量
              <input
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={transferToken}
            >
              转账并触发持币份额同步
            </button>
          </fieldset>

          <fieldset>
            <legend>3. 持币 / 自动分红验收</legend>
            <p className="notice">
              钱包需持有 Testnet BUSD。先转入金库，再同步并轮询自动派发；手动
              claim 与 claimFor 均保留。
            </p>
            <label>
              转入 BUSD 数量（余额{" "}
              {snapshot ? formatEther(snapshot.rewardBalance) : "0"}）
              <input
                value={rewardAmount}
                onChange={(event) => setRewardAmount(event.target.value)}
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={
                !snapshot || snapshot.vault === zeroAddress || Boolean(busy)
              }
              onClick={fundVault}
            >
              转入分红金库
            </button>
            <button
              className="button wide secondary"
              type="button"
              disabled={Boolean(busy)}
              aria-busy={busy === "同步分红"}
              onClick={() => void vaultAction("同步分红", "syncRewards")}
            >
              {busy === "同步分红"
                ? "等待钱包或链上确认…"
                : "syncRewards（同步金库余额）"}
            </button>
            <button
              className="button wide"
              type="button"
              disabled={
                !snapshot || snapshot.vault === zeroAddress || Boolean(busy)
              }
              onClick={() => vaultAction("自动派发", "processRewards")}
            >
              有界自动派发
            </button>
            <button
              className="button wide secondary"
              type="button"
              disabled={
                !snapshot || snapshot.vault === zeroAddress || Boolean(busy)
              }
              onClick={() => vaultAction("手动领取", "claim")}
            >
              手动 claim
            </button>
            <label>
              claimFor 账户
              <input
                value={claimForAccount}
                onChange={(event) => setClaimForAccount(event.target.value)}
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={
                !snapshot || snapshot.vault === zeroAddress || Boolean(busy)
              }
              onClick={() => vaultAction("代付领取", "claimFor")}
            >
              claimFor（只会支付给账户本人）
            </button>
          </fieldset>

          <fieldset>
            <legend>4. LP 分红验收</legend>
            <p className="notice">
              仅用于 LP 模板。代币毕业后，先添加少量 LP，再把 LP
              凭证质押到金库。
            </p>
            <label>
              添加流动性的代币数量
              <input
                value={liquidityTokenAmount}
                onChange={(event) =>
                  setLiquidityTokenAmount(event.target.value)
                }
              />
            </label>
            <label>
              添加流动性的 tBNB
              <input
                value={liquidityBNB}
                onChange={(event) => setLiquidityBNB(event.target.value)}
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={!snapshot || Boolean(busy)}
              onClick={approveRouter}
            >
              授权 Pancake Router
            </button>
            <button
              className="button wide"
              type="button"
              disabled={!snapshot || snapshot.state !== 2 || Boolean(busy)}
              onClick={addLiquidity}
            >
              添加测试网 LP
            </button>
            <label>
              质押 / 提取 LP 数量
              <input
                value={lpAmount}
                onChange={(event) => setLPAmount(event.target.value)}
              />
            </label>
            <button
              className="button wide secondary"
              type="button"
              disabled={
                !snapshot ||
                snapshot.shareAsset === zeroAddress ||
                Boolean(busy)
              }
              onClick={approveLP}
            >
              授权 LP 金库
            </button>
            <button
              className="button wide"
              type="button"
              disabled={
                !snapshot ||
                snapshot.shareAsset === zeroAddress ||
                Boolean(busy)
              }
              onClick={() => stakeOrWithdrawLP(false)}
            >
              质押 LP
            </button>
            <button
              className="button wide secondary"
              type="button"
              disabled={
                !snapshot ||
                snapshot.shareAsset === zeroAddress ||
                Boolean(busy)
              }
              onClick={() => stakeOrWithdrawLP(true)}
            >
              提取 LP
            </button>
          </fieldset>

          {busy && (
            <p className="notice" role="status">
              处理中：{busy}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {transactions.length > 0 && (
            <section className="transaction-preview" aria-label="交易记录">
              <div className="transaction-preview-heading">
                <strong>本页交易记录</strong>
                <span>{transactions.length} 笔</span>
              </div>
              <dl>
                {transactions.map((transaction) => (
                  <div key={transaction.hash}>
                    <dt>{transaction.label}</dt>
                    <dd>
                      <a
                        href={`${BSC_TESTNET_EXPLORER}/tx/${transaction.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddress(transaction.hash)} ↗
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
