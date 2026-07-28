"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decodeEventLog, isAddress, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bsc } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import {
  autoLiquidityFactoryAbi,
  autoLiquidityFactoryAddress,
  factoryAbi,
  rewardsFactoryAbi,
  rewardsFactoryAddress,
  testnetPublicClient,
  testnetFactoryAddress,
} from "@/lib/web3";
import { useLanguage } from "@/components/language-provider";

const CREATION_FEE_WEI = parseEther("0.001");
// Some injected mobile wallets incorrectly submit gasLimit=0 when estimation is
// interrupted. This cap prevents that invalid request; users still pay only for
// gas actually consumed by the transaction.
const CREATE_GAS_LIMIT = 8_000_000n;
const MAX_SIDE_TAX = 10;
const VANITY_SEARCH_LIMIT = 500_000;
// One eth_call can safely search a much larger CREATE2 salt range than the
// previous 1,000-attempt batch. 10,000 keeps the call below common BSC RPC
// execution limits while cutting the average number of network round trips
// from ~66 to ~7 for a 16-bit vanity suffix.
const VANITY_SEARCH_CHUNK_SIZE = 10_000;

type TemplateId = "standard" | "liquidity" | "holders" | "lp";
type TaxKey = "burn" | "liquidity" | "marketing" | "rewards";
type TaxSide = Record<TaxKey, number>;

const emptyTaxes: TaxSide = {
  burn: 0,
  liquidity: 0,
  marketing: 0,
  rewards: 0,
};

const templateIds: TemplateId[] = ["standard", "liquidity", "holders", "lp"];

function safeInitialBuy(value: string) {
  try {
    return parseEther(value || "0") >= 0n;
  } catch {
    return false;
  }
}

function readableWalletError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "钱包交易发送失败";
  if (message.includes("gas limit is too low") || message.includes("given 0")) {
    return "钱包生成的 Gas 限额为 0，页面已改用安全 Gas 上限。请刷新页面后重新提交。";
  }
  if (
    message.includes("User rejected") ||
    message.includes("User denied") ||
    message.includes("rejected the request")
  ) {
    return "你已在钱包中取消本次操作，没有发送交易。";
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("HTTP request failed")
  ) {
    return "RPC 节点响应超时。请先检查链上是否已有交易记录，不要连续重复点击。";
  }
  if (message.includes("revert") || message.includes("execution reverted")) {
    return "合约模拟或链上执行回滚。请保存当前参数和交易哈希以便诊断。";
  }
  return message;
}

export default function CreateTokenPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [debox, setDebox] = useState("");
  const [qqGroupNumber, setQqGroupNumber] = useState("");
  const [target, setTarget] = useState(5);
  const [initialBuy, setInitialBuy] = useState("");
  const [template, setTemplate] = useState<TemplateId>("standard");
  const [buyTaxes, setBuyTaxes] = useState<TaxSide>({ ...emptyTaxes });
  const [sellTaxes, setSellTaxes] = useState<TaxSide>({ ...emptyTaxes });
  const [marketingWallet, setMarketingWallet] = useState("");
  const [minimumRewardBalance, setMinimumRewardBalance] = useState("10000");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isFindingVanity, setIsFindingVanity] = useState(false);
  const [vanityProgress, setVanityProgress] = useState(0);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const factoryAddress =
    template === "liquidity"
      ? autoLiquidityFactoryAddress
      : template === "holders" || template === "lp"
        ? rewardsFactoryAddress
        : testnetFactoryAddress;

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data || !factoryAddress) return;
    for (const log of receipt.data.logs) {
      if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi:
            template === "liquidity"
              ? autoLiquidityFactoryAbi
              : template === "holders" || template === "lp"
                ? rewardsFactoryAbi
                : factoryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "TokenCreated") continue;
        const args = decoded.args as { token?: `0x${string}` };
        if (args.token && isAddress(args.token)) {
          router.push(`/token/${args.token}`);
          return;
        }
      } catch {
        // The receipt contains Transfer and Pancake events too. Only a
        // successfully decoded TokenCreated event is eligible for navigation.
      }
    }
  }, [factoryAddress, receipt.data, receipt.isSuccess, router, template]);

  function taxSideToBps(side: TaxSide) {
    return {
      burn: Math.round(side.burn * 100),
      liquidity: Math.round(side.liquidity * 100),
      marketing: Math.round(side.marketing * 100),
      rewards: Math.round(side.rewards * 100),
    };
  }

  function configuredTaxes() {
    return {
      buy: taxSideToBps(buyTaxes),
      sell: taxSideToBps(sellTaxes),
    };
  }

  async function uploadMetadata() {
    if (!description && !image && !website && !telegram && !twitter && !debox && !qqGroupNumber) {
      return "";
    }

    const form = new FormData();
    form.set("name", name.trim());
    form.set("symbol", symbol.trim());
    form.set("description", description.trim());
    form.set("website", website.trim());
    form.set("telegram", telegram.trim());
    form.set("twitter", twitter.trim());
    form.set("debox", debox.trim());
    form.set("qqGroupNumber", qqGroupNumber.trim());
    if (image) form.set("image", image);

    const response = await fetch("/api/metadata", { method: "POST", body: form });
    const result = (await response.json()) as {
      metadataURI?: string;
      error?: string;
    };
    if (!response.ok || !result.metadataURI) {
      throw new Error(result.error ?? "代币资料上传失败");
    }
    return result.metadataURI;
  }

  async function findVanitySalt() {
    if (!address) throw new Error("请先连接钱包");
    const tokenName = name.trim();
    const tokenSymbol = symbol.trim();
    const start = (BigInt(Date.now()) << 160n) | BigInt(address ?? 0);
    const marketing =
      marketingWallet.trim() === "" ? address : marketingWallet.trim();
    if (template !== "standard" && (!marketing || !isAddress(marketing))) {
      throw new Error("营销钱包地址格式错误");
    }
    const marketingAddress = marketing as `0x${string}`;
    if (template === "holders" || template === "lp") {
      if (!rewardsFactoryAddress) {
        throw new Error("分红模板主网 Factory 尚未配置");
      }
      const templateValue = template === "holders" ? 2 : 3;
      const minimumShare = parseEther(minimumRewardBalance || "0");
      setVanityProgress(0);
      for (
        let index = 0;
        index < VANITY_SEARCH_LIMIT;
        index += VANITY_SEARCH_CHUNK_SIZE
      ) {
        const result = await testnetPublicClient.readContract({
          address: rewardsFactoryAddress,
          abi: rewardsFactoryAbi,
          functionName: "findVanitySalt",
          args: [
            tokenName,
            tokenSymbol,
            marketingAddress,
            configuredTaxes(),
            templateValue,
            minimumShare,
            start + BigInt(index),
            BigInt(VANITY_SEARCH_CHUNK_SIZE),
          ],
        });
        if (result[0]) return result[1];
        setVanityProgress(
          Math.round(
            ((index + VANITY_SEARCH_CHUNK_SIZE) / VANITY_SEARCH_LIMIT) * 100,
          ),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
      throw new Error("暂未找到 1111 靓号，请重新提交");
    } else if (template === "liquidity") {
      if (!autoLiquidityFactoryAddress) {
        throw new Error("自动回流主网 Factory 尚未配置");
      }
      setVanityProgress(0);
      for (
        let index = 0;
        index < VANITY_SEARCH_LIMIT;
        index += VANITY_SEARCH_CHUNK_SIZE
      ) {
        const result = await testnetPublicClient.readContract({
          address: autoLiquidityFactoryAddress,
          abi: autoLiquidityFactoryAbi,
          functionName: "findVanitySalt",
          args: [
            tokenName,
            tokenSymbol,
            marketingAddress,
            configuredTaxes(),
            start + BigInt(index),
            BigInt(VANITY_SEARCH_CHUNK_SIZE),
          ],
        });
        if (result[0]) return result[1];
        setVanityProgress(
          Math.round(
            ((index + VANITY_SEARCH_CHUNK_SIZE) / VANITY_SEARCH_LIMIT) * 100,
          ),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    } else {
      setVanityProgress(0);
      for (
        let index = 0;
        index < VANITY_SEARCH_LIMIT;
        index += VANITY_SEARCH_CHUNK_SIZE
      ) {
        const result = await testnetPublicClient.readContract({
          address: testnetFactoryAddress,
          abi: factoryAbi,
          functionName: "findVanitySalt",
          args: [
            tokenName,
            tokenSymbol,
            start + BigInt(index),
            BigInt(VANITY_SEARCH_CHUNK_SIZE),
          ],
        });
        if (result[0]) return result[1];
        setVanityProgress(
          Math.round(
            ((index + VANITY_SEARCH_CHUNK_SIZE) / VANITY_SEARCH_LIMIT) * 100,
          ),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    }
    throw new Error("暂未找到 1111 靓号，请重新提交");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !factoryAddress) return;

    setUploadError("");
    setIsUploading(true);
    try {
      const metadataURI = await uploadMetadata();
      setIsUploading(false);
      setIsFindingVanity(true);
      setVanityProgress(0);
      const vanitySalt = await findVanitySalt();
      setIsFindingVanity(false);
      setVanityProgress(0);
      const initialBuyWei = parseEther(initialBuy || "0");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      if (template === "liquidity" || template === "holders" || template === "lp") {
        const isRewardsTemplate = template === "holders" || template === "lp";
        const selectedFactory = isRewardsTemplate
          ? rewardsFactoryAddress
          : autoLiquidityFactoryAddress;
        const selectedAbi = isRewardsTemplate
          ? rewardsFactoryAbi
          : autoLiquidityFactoryAbi;
        if (!selectedFactory) {
          throw new Error("所选模板主网 Factory 尚未配置");
        }
        const marketing =
          marketingWallet.trim() === "" ? address : marketingWallet.trim();
        if (!isAddress(marketing)) throw new Error("营销钱包地址格式错误");
        const request = {
          name: name.trim(),
          symbol: symbol.trim(),
          graduationTargetBNB: target,
          metadataURI,
          vanitySalt,
          marketingWallet: marketing,
          taxes: configuredTaxes(),
          ...(isRewardsTemplate
            ? {
                template: template === "holders" ? 2 : 3,
                minimumRewardShare: parseEther(minimumRewardBalance || "0"),
              }
            : {}),
        };
        if (initialBuyWei === 0n) {
          writeContract({
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityToken",
            args: [request],
            value: CREATION_FEE_WEI,
            gas: CREATE_GAS_LIMIT,
            chain: bsc,
            account: address,
          });
        } else {
          writeContract({
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityTokenAndBuy",
            args: [
              request,
              {
                minTokensOut: 0n,
                deadline,
                refundRecipient: address,
              },
            ],
            value: CREATION_FEE_WEI + initialBuyWei,
            gas: CREATE_GAS_LIMIT,
            chain: bsc,
            account: address,
          });
        }
        return;
      }
      if (initialBuyWei === 0n) {
        writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "createVanityToken",
          args: [{
            name: name.trim(),
            symbol: symbol.trim(),
            graduationTargetBNB: target,
            metadataURI,
            vanitySalt,
          }],
          value: CREATION_FEE_WEI,
          gas: CREATE_GAS_LIMIT,
          chain: bsc,
          account: address,
        });
        return;
      }

      writeContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createVanityTokenAndBuy",
        args: [{
          name: name.trim(),
          symbol: symbol.trim(),
          graduationTargetBNB: target,
          metadataURI,
          vanitySalt,
        }, {
          minTokensOut: 0n,
          deadline,
          refundRecipient: address,
        }],
        value: CREATION_FEE_WEI + initialBuyWei,
        gas: CREATE_GAS_LIMIT,
        chain: bsc,
        account: address,
      });
    } catch (metadataError) {
      setUploadError(
        readableWalletError(metadataError),
      );
    } finally {
      setIsUploading(false);
      setIsFindingVanity(false);
      setVanityProgress(0);
    }
  }

  const wrongChain = isConnected && chainId !== bsc.id;
  const advancedTemplate = template !== "standard";
  const unavailableTemplate =
    ((template === "holders" || template === "lp") && !rewardsFactoryAddress) ||
    (template === "liquidity" && !autoLiquidityFactoryAddress);
  const buyTaxTotal = Object.values(buyTaxes).reduce((sum, value) => sum + value, 0);
  const sellTaxTotal = Object.values(sellTaxes).reduce((sum, value) => sum + value, 0);
  const taxInvalid =
    buyTaxTotal > MAX_SIDE_TAX || sellTaxTotal > MAX_SIDE_TAX;
  const canSubmit =
    isConnected &&
    !wrongChain &&
    !unavailableTemplate &&
    !taxInvalid &&
    (!(template === "holders" || template === "lp") ||
      (buyTaxes.rewards + sellTaxes.rewards > 0 &&
        Number(minimumRewardBalance) > 0)) &&
    Boolean(factoryAddress) &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    safeInitialBuy(initialBuy);

  return (
    <main>
      <header className="topbar">
        <Link className="brand" href="/">
          BNBX
        </Link>
        <WalletButton />
      </header>

      <section className="form-shell">
        <p className="eyebrow">02 / CONFIGURE · BNB MAINNET</p>
        <h1 className="form-title">{t("createTitle")}</h1>
        <p className="lead">
          {language === "zh"
            ? "零代码创建固定 10 亿供应的干净代币。永久 0 税、无增发权限，创建者首笔买入可与部署在同一笔交易内完成。"
            : language === "ko"
              ? "코딩 없이 10억 고정 공급, 영구 0% 세금 토큰을 생성합니다. 생성과 최초 구매를 한 거래에서 처리할 수 있습니다."
              : language === "ja"
                ? "コード不要で10億固定供給・永久税率0%のトークンを作成。作成と初回購入を同一取引で実行できます。"
                : "Create a fixed 1B supply, permanently zero-tax token without code. Creation and the initial buy can run atomically."}
        </p>

        <form className="launch-form" onSubmit={submit}>
          <fieldset className="template-picker">
            <legend>{language === "zh" ? "选择代币模板" : "Token template"}</legend>
            <div className="template-grid">
              {templateIds.map((id) => {
                const content = {
                  standard: {
                    name: language === "zh" ? "标准 0 税" : "Standard 0% Tax",
                    text:
                      language === "zh"
                        ? "固定供应、无增发、无黑名单，推荐默认选择。"
                        : "Fixed supply with no mint, blacklist, or token tax.",
                  },
                  liquidity: {
                    name: language === "zh" ? "自动回流" : "Auto Liquidity",
                    text:
                      language === "zh"
                        ? "可配置销毁、自动加池和营销税。"
                        : "Configurable burn, auto-liquidity, and marketing tax.",
                  },
                  holders: {
                    name: language === "zh" ? "持币分红" : "Holder Rewards",
                    text:
                      language === "zh"
                        ? "按合格持币数量分配指定奖励代币。"
                        : "Distribute a selected reward token to eligible holders.",
                  },
                  lp: {
                    name: language === "zh" ? "LP 分红" : "LP Rewards",
                    text:
                      language === "zh"
                        ? "毕业后按 Pancake LP 持仓分配奖励。"
                        : "Reward qualifying Pancake LP holders after graduation.",
                  },
                }[id];
                const preview = id !== "standard";
                return (
                  <button
                    aria-pressed={template === id}
                    className={`template-card ${template === id ? "selected" : ""}`}
                    key={id}
                    onClick={() => {
                      setTemplate(id);
                      if (id === "standard") {
                        setBuyTaxes({ ...emptyTaxes });
                        setSellTaxes({ ...emptyTaxes });
                      }
                    }}
                    type="button"
                  >
                    <span>{preview ? "V2 MAINNET PREVIEW" : "LIVE"}</span>
                    <strong>{content.name}</strong>
                    <small>{content.text}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {advancedTemplate && (
            <fieldset className="tax-config">
              <legend>
                {language === "zh" ? "毕业后的代币税配置" : "Post-graduation taxes"}
              </legend>
              <p className="field-help">
                {language === "zh"
                  ? "代币税在内盘和创建流动性时保持关闭，只在毕业进入 Pancake V2 后启用。买入和卖出分别最多 10%。"
                  : "Token taxes stay disabled during the bonding curve and graduation. Each side is capped at 10% after Pancake V2 migration."}
              </p>
              {(["buy", "sell"] as const).map((side) => {
                const values = side === "buy" ? buyTaxes : sellTaxes;
                const update = side === "buy" ? setBuyTaxes : setSellTaxes;
                const total = side === "buy" ? buyTaxTotal : sellTaxTotal;
                return (
                  <section className="tax-side" key={side}>
                    <div className="tax-heading">
                      <strong>
                        {side === "buy"
                          ? language === "zh" ? "买入税" : "Buy tax"
                          : language === "zh" ? "卖出税" : "Sell tax"}
                      </strong>
                      <b className={total > MAX_SIDE_TAX ? "over-limit" : ""}>
                        {total.toFixed(2)}% / {MAX_SIDE_TAX}%
                      </b>
                    </div>
                    <div className="tax-grid">
                      {(Object.keys(values) as TaxKey[]).map((key) => {
                        const hidden =
                          template === "liquidity" && key === "rewards";
                        if (hidden) return null;
                        const labels: Record<TaxKey, string> = {
                          burn: language === "zh" ? "销毁" : "Burn",
                          liquidity: language === "zh" ? "自动加池" : "Liquidity",
                          marketing: language === "zh" ? "营销" : "Marketing",
                          rewards: language === "zh" ? "分红" : "Rewards",
                        };
                        const otherTotal = Object.entries(values).reduce(
                          (sum, [taxKey, value]) =>
                            taxKey === key ? sum : sum + value,
                          0,
                        );
                        const maximum = Math.max(0, MAX_SIDE_TAX - otherTotal);
                        return (
                          <label className="tax-slider-control" key={key}>
                            <span>
                              {labels[key]}
                              <strong>{values[key].toFixed(2)}%</strong>
                            </span>
                            <input
                              aria-label={`${labels[key]} ${values[key].toFixed(2)}%`}
                              max={maximum}
                              min="0"
                              step="0.01"
                              type="range"
                              value={Math.min(values[key], maximum)}
                              style={{
                                "--range-progress": `${maximum === 0 ? 0 : (values[key] / maximum) * 100}%`,
                              } as CSSProperties}
                              onChange={(event) =>
                                update({
                                  ...values,
                                  [key]: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              <label>
                {language === "zh" ? "营销钱包" : "Marketing wallet"}
                <input
                  value={marketingWallet}
                  placeholder={
                    address
                      ? `${address} (${language === "zh" ? "默认创建者" : "creator default"})`
                      : "0x..."
                  }
                  onChange={(event) => setMarketingWallet(event.target.value)}
                />
              </label>
              {(template === "holders" || template === "lp") && (
                <label>
                  {language === "zh"
                    ? template === "holders"
                      ? "最低参与分红持币量"
                      : "最低参与分红 LP 数量"
                    : template === "holders"
                      ? "Minimum token balance for rewards"
                      : "Minimum LP balance for rewards"}
                  <input
                    inputMode="decimal"
                    min="0"
                    type="number"
                    value={minimumRewardBalance}
                    placeholder="10000"
                    onChange={(event) =>
                      setMinimumRewardBalance(event.target.value)
                    }
                  />
                  <span className="field-help">
                    {language === "zh"
                      ? "分红税自动兑换为 BNB，符合门槛的用户可主动领取；黑洞、曲线和交易对不参与。"
                      : "Reward tax is converted to BNB and claimed by eligible users. Burn, curve, and pair addresses are excluded."}
                  </span>
                </label>
              )}
              {unavailableTemplate && (
                <p className="preview-lock">
                  {language === "zh"
                    ? "安全锁定：对应主网 Factory 未配置时不会允许真实创建，避免误部署。"
                    : "Safety lock: creation is disabled until the corresponding mainnet Factory is configured."}
                </p>
              )}
            </fieldset>
          )}

          <label>
            {t("tokenName")}
            <input
              required
              maxLength={40}
              value={name}
              placeholder="例如 BNBX Cat"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            {t("tokenSymbol")}
            <input
              required
              maxLength={10}
              value={symbol}
              placeholder="例如 BCAT 或 bcat"
              onChange={(event) => setSymbol(event.target.value)}
            />
          </label>

          <label>
            {t("tokenIntro")}
            <textarea
              maxLength={500}
              value={description}
              placeholder="介绍代币、社区和 Meme 故事（最多 500 字）"
              onChange={(event) => setDescription(event.target.value)}
            />
            <small>{description.length}/500</small>
          </label>

          <label>
            {t("tokenLogo")}
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              type="file"
              onChange={(event) => setImage(event.target.files?.[0] ?? null)}
            />
            <small>支持 JPG、PNG、WebP、GIF，最大 2MB。</small>
          </label>

          <fieldset className="social-fields">
            <legend>{t("socialLinks")}</legend>
            <input
              type="text"
              maxLength={100}
              value={website}
              placeholder={t("websitePlaceholder")}
              onChange={(event) => setWebsite(event.target.value)}
            />
            <input
              type="text"
              maxLength={100}
              value={telegram}
              placeholder={t("telegramPlaceholder")}
              onChange={(event) => setTelegram(event.target.value)}
            />
            <input
              type="text"
              maxLength={100}
              value={twitter}
              placeholder={t("twitterPlaceholder")}
              onChange={(event) => setTwitter(event.target.value)}
            />
            <input
              type="text"
              maxLength={100}
              value={debox}
              placeholder={t("deboxPlaceholder")}
              onChange={(event) => setDebox(event.target.value)}
            />
            <input
              type="text"
              aria-label={t("qqGroupNumber")}
              maxLength={100}
              value={qqGroupNumber}
              placeholder={t("qqPlaceholder")}
              onChange={(event) => setQqGroupNumber(event.target.value)}
            />
          </fieldset>

          <fieldset className="graduation-control">
            <legend>{t("graduationTarget")}</legend>
            <div className="graduation-value" aria-live="polite">
              <span>{(target / 100).toFixed(2)}</span>
              <small>BNB</small>
            </div>
            <div className="graduation-presets" aria-label={`${t("graduationTarget")} presets`}>
              {[1, 10, 18].map((value) => (
                <button
                  className={target === value ? "active" : ""}
                  key={value}
                  type="button"
                  onClick={() => setTarget(value)}
                >
                  {(value / 100).toFixed(2)} BNB
                </button>
              ))}
            </div>
            <div className="graduation-slider-row">
              <button
                type="button"
                aria-label="减少 0.01 BNB"
                disabled={target <= 1}
                onClick={() => setTarget((current) => Math.max(1, current - 1))}
              >
                −
              </button>
              <input
                type="range"
                min="1"
                max="18"
                step="1"
                aria-label={t("graduationTarget")}
                aria-valuetext={`${(target / 100).toFixed(2)} BNB`}
                value={target}
                style={{ "--range-progress": `${((target - 1) / 17) * 100}%` } as CSSProperties}
                onChange={(event) => setTarget(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="增加 0.01 BNB"
                disabled={target >= 18}
                onClick={() => setTarget((current) => Math.min(18, current + 1))}
              >
                +
              </button>
            </div>
            <div className="graduation-scale" aria-hidden="true">
              <span>0.01 BNB</span>
              <span>0.01–0.18 BNB</span>
              <span>0.18 BNB</span>
            </div>
          </fieldset>

          <label>
            {t("creatorBuy")}
            <input
              min="0"
              step="0.000000001"
              inputMode="decimal"
              placeholder="输入 BNB 金额"
              value={initialBuy}
              onChange={(event) => setInitialBuy(event.target.value)}
            />
            <small>
              留空或填写 0 表示只创建、不首购。部署费 0.001 BNB。首购与创建在
              同一笔交易完成，可避免创建后被抢跑；达到毕业额度时自动毕业并销毁
              LP，超额 BNB 自动退回。
            </small>
          </label>

          {!factoryAddress && (
            <p className="notice">
              主网 Factory 合约地址尚未配置。完成合约部署和验证后，
              创建按钮将自动解锁。
            </p>
          )}

          {taxInvalid && (
            <p className="error">
              {language === "zh"
                ? "买入税或卖出税合计超过 10%，请降低税率。"
                : "Buy or sell tax exceeds the 10% maximum."}
            </p>
          )}

          {wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bsc.id })}
            >
              切换到 BNB 主网
            </button>
          ) : (
            <button
              className="button wide"
              type="submit"
              disabled={!canSubmit || isPending || receipt.isLoading || isUploading || isFindingVanity}
            >
              {isUploading
                ? "正在上传到 IPFS…"
                : isFindingVanity
                ? `正在准备 1111 尾号合约地址… ${vanityProgress}%`
                : isPending
                ? "请在钱包确认…"
                : receipt.isLoading
                ? "交易已提交，等待链上确认…"
                : t("createToken")}
            </button>
          )}

          {hash && <p className="notice">交易哈希：{hash}</p>}
          {receipt.isSuccess && (
            <p className="success">代币已成功创建在 BNB 主网。</p>
          )}
          {receipt.isError && (
            <p className="error">交易已提交，但链上执行失败。请不要重复点击，并保存交易哈希以便诊断。</p>
          )}
          {uploadError && <p className="error">{uploadError}</p>}
          {error && <p className="error">{readableWalletError(error)}</p>}
        </form>
      </section>
    </main>
  );
}
