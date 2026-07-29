"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decodeEventLog, formatEther, isAddress, parseEther } from "viem";
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
import { validateCommunityLinks } from "@/lib/community-links";

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
const TRADE_FEE_BPS = 50n;
const SLIPPAGE_BPS = 100n;
const BPS = 10_000n;
const CURVE_TOKEN_SUPPLY = parseEther("800000000");
const INITIAL_VIRTUAL_TOKEN_RESERVE = parseEther("3200000000") / 3n;

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

function ceilDiv(value: bigint, divisor: bigint) {
  if (value === 0n) return 0n;
  return (value - 1n) / divisor + 1n;
}

function feeOn(gross: bigint) {
  return ceilDiv(gross * TRADE_FEE_BPS, BPS);
}

function grossForExactNet(requiredNet: bigint) {
  if (requiredNet === 0n) return 0n;
  let gross = ceilDiv(requiredNet * BPS, BPS - TRADE_FEE_BPS);
  while (gross - feeOn(gross) > requiredNet) gross -= 1n;
  while (gross - feeOn(gross) < requiredNet) gross += 1n;
  return gross;
}

function quoteFreshCurveBuy(targetStep: number, offeredGross: bigint) {
  if (offeredGross <= 0n) return 0n;
  const graduationTarget = parseEther((targetStep / 100).toFixed(2));
  const acceptedGross =
    offeredGross < grossForExactNet(graduationTarget)
      ? offeredGross
      : grossForExactNet(graduationTarget);
  const netBNB = acceptedGross - feeOn(acceptedGross);
  const virtualBNBReserve = graduationTarget / 3n;
  const invariant = virtualBNBReserve * INITIAL_VIRTUAL_TOKEN_RESERVE;
  const newVirtualToken = ceilDiv(
    invariant,
    virtualBNBReserve + netBNB,
  );
  const tokensOut =
    netBNB === graduationTarget
      ? CURVE_TOKEN_SUPPLY
      : INITIAL_VIRTUAL_TOKEN_RESERVE - newVirtualToken;
  return (tokensOut * (BPS - SLIPPAGE_BPS)) / BPS;
}

function formatPreviewTokens(value: bigint) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 3,
  }).format(Number(formatEther(value)));
}

function readableWalletError(error: unknown, language: "zh" | "en" | "ko" | "ja") {
  const localized = {
    zh: {
      fallback: "钱包交易发送失败", gas: "钱包生成的 Gas 限额为 0。请刷新后重新提交。",
      rejected: "你已在钱包中取消操作，没有发送交易。", timeout: "RPC 节点响应超时。请先检查链上记录，不要连续重复点击。",
      reverted: "合约模拟或链上执行回滚。请保存参数和交易哈希以便诊断。",
    },
    en: {
      fallback: "Wallet transaction failed", gas: "The wallet generated an invalid gas limit. Refresh and submit again.",
      rejected: "You cancelled this action in your wallet. No transaction was sent.", timeout: "The RPC timed out. Check for an existing on-chain transaction before retrying.",
      reverted: "Contract simulation or execution reverted. Save the parameters and transaction hash for diagnosis.",
    },
    ko: {
      fallback: "지갑 거래 전송 실패", gas: "지갑이 잘못된 Gas 한도를 생성했습니다. 새로고침 후 다시 제출하세요.",
      rejected: "지갑에서 작업을 취소했습니다. 거래는 전송되지 않았습니다.", timeout: "RPC 응답 시간이 초과되었습니다. 재시도 전 온체인 거래 기록을 확인하세요.",
      reverted: "컨트랙트 시뮬레이션 또는 실행이 되돌려졌습니다. 진단을 위해 설정과 거래 해시를 저장하세요.",
    },
    ja: {
      fallback: "ウォレット取引の送信に失敗しました", gas: "ウォレットが無効なGas上限を生成しました。更新して再送信してください。",
      rejected: "ウォレットで操作をキャンセルしました。取引は送信されていません。", timeout: "RPCがタイムアウトしました。再試行前にオンチェーン履歴を確認してください。",
      reverted: "コントラクトのシミュレーションまたは実行がリバートしました。診断用に設定と取引ハッシュを保存してください。",
    },
  }[language];
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : localized.fallback;
  if (message.includes("gas limit is too low") || message.includes("given 0")) {
    return localized.gas;
  }
  if (
    message.includes("User rejected") ||
    message.includes("User denied") ||
    message.includes("rejected the request")
  ) {
    return localized.rejected;
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("HTTP request failed")
  ) {
    return localized.timeout;
  }
  if (message.includes("revert") || message.includes("execution reverted")) {
    return localized.reverted;
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
    const community = validateCommunityLinks({
      website,
      telegram,
      twitter,
      debox,
      qqGroupNumber,
    });

    const form = new FormData();
    form.set("name", name.trim());
    form.set("symbol", symbol.trim());
    form.set("description", description.trim());
    form.set("website", community.website);
    form.set("telegram", community.telegram);
    form.set("twitter", community.twitter);
    form.set("debox", community.debox);
    form.set("qqGroupNumber", community.qqGroupNumber);
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
      const minimumInitialTokens = quoteFreshCurveBuy(target, initialBuyWei);
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
                minTokensOut: minimumInitialTokens,
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
          minTokensOut: minimumInitialTokens,
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
        readableWalletError(metadataError, language),
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
  let communityLinkError = "";
  try {
    validateCommunityLinks({
      website,
      telegram,
      twitter,
      debox,
      qqGroupNumber,
    });
  } catch (linkError) {
    communityLinkError =
      linkError instanceof Error ? linkError.message : "社区链接格式无效";
  }
  const previewInitialBuyWei = safeInitialBuy(initialBuy)
    ? parseEther(initialBuy || "0")
    : 0n;
  const previewMinimumTokens = quoteFreshCurveBuy(
    target,
    previewInitialBuyWei,
  );
  const previewTotalValue = CREATION_FEE_WEI + previewInitialBuyWei;
  const canSubmit =
    isConnected &&
    !wrongChain &&
    !unavailableTemplate &&
    !taxInvalid &&
    !communityLinkError &&
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
        <p className="eyebrow">01 / CONFIGURE · BNB MAINNET</p>
        <h1 className="form-title">{t("createTitle")}</h1>
        <p className="lead">
          {language === "zh"
            ? "零代码创建固定 10 亿供应的代币。先选择公开模板与税费规则，创建者首笔买入可与部署在同一笔交易内完成。"
            : language === "ko"
              ? "코딩 없이 10억 고정 공급 토큰을 생성합니다. 공개 템플릿과 수수료 규칙을 선택하고 생성과 최초 구매를 한 거래에서 처리할 수 있습니다."
              : language === "ja"
                ? "コード不要で10億固定供給トークンを作成。公開テンプレートと税設定を選択し、作成と初回購入を同一取引で実行できます。"
                : "Create a fixed 1B supply token without code. Choose a disclosed template and fee model; creation and the initial buy can run atomically."}
        </p>

        <form className="launch-form" onSubmit={submit}>
          <fieldset className="template-picker">
            <legend>{t("templateSelect")}</legend>
            <div className="template-grid">
              {templateIds.map((id) => {
                const content = {
                  standard: {
                    name: language === "zh" ? "标准 0 税" : "Standard 0% Tax",
                    badge: language === "zh" ? "推荐新手 · 永久 0 税" : "RECOMMENDED · PERMANENT 0%",
                    text:
                      language === "zh"
                        ? "低复杂度 · 无增发、无黑名单 · 创建费 0.001 BNB。"
                        : "Low complexity · no mint or blacklist · 0.001 BNB creation fee.",
                  },
                  liquidity: {
                    name: language === "zh" ? "自动回流" : "Auto Liquidity",
                    badge: language === "zh" ? "进阶 · 毕业后有税" : "ADVANCED · POST-GRAD TAX",
                    text:
                      language === "zh"
                        ? "中等复杂度 · 配置销毁、加池和营销税 · 创建费 0.001 BNB。"
                        : "Medium complexity · burn, liquidity and marketing tax · 0.001 BNB fee.",
                  },
                  holders: {
                    name: language === "zh" ? "持币分红" : "Holder Rewards",
                    badge: language === "zh" ? "高级 · 分红税" : "ADVANCED · REWARD TAX",
                    text:
                      language === "zh"
                        ? "高复杂度 · 按合格持币数量分配 BNB 奖励 · 创建费 0.001 BNB。"
                        : "High complexity · BNB rewards for eligible holders · 0.001 BNB fee.",
                  },
                  lp: {
                    name: language === "zh" ? "LP 分红" : "LP Rewards",
                    badge: language === "zh" ? "高级 · LP 分红税" : "ADVANCED · LP REWARDS",
                    text:
                      language === "zh"
                        ? "高复杂度 · 毕业后按 Pancake LP 份额分配 BNB 奖励 · 创建费 0.001 BNB。"
                        : "High complexity · BNB rewards by Pancake LP share · 0.001 BNB fee.",
                  },
                }[id];
                const enabled =
                  id === "standard" ||
                  (id === "liquidity" && Boolean(autoLiquidityFactoryAddress)) ||
                  ((id === "holders" || id === "lp") && Boolean(rewardsFactoryAddress));
                return (
                  <button
                    aria-pressed={template === id}
                    className={`template-card ${template === id ? "selected" : ""} ${enabled ? "" : "disabled"}`}
                    disabled={!enabled}
                    key={id}
                    onClick={() => {
                      setTemplate(id);
                      setUploadError("");
                      if (id === "standard") {
                        setBuyTaxes({ ...emptyTaxes });
                        setSellTaxes({ ...emptyTaxes });
                      }
                    }}
                    type="button"
                  >
                    <span>{enabled ? content.badge : t("unavailable")}</span>
                    <strong>{content.name}</strong>
                    <small>{content.text}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {advancedTemplate && (
            <div className="advanced-template-warning" role="status">
              <strong>
                {{
                  zh: "你选择的是毕业后有税模板",
                  en: "You selected a post-graduation tax template",
                  ko: "졸업 후 세금이 적용되는 템플릿을 선택했습니다",
                  ja: "卒業後に税が適用されるテンプレートです",
                }[language]}
              </strong>
              <p>
                {{
                  zh: "内盘交易和毕业加池期间不收代币税；进入 PancakeSwap V2 后，才按下方公开配置启用买入税和卖出税。请确认税率、营销钱包和分红门槛后再创建。",
                  en: "Token tax remains off during the bonding curve and migration. The disclosed buy and sell taxes activate only after the PancakeSwap V2 launch. Confirm every tax, the marketing wallet, and any reward threshold before creating.",
                  ko: "본딩 커브와 유동성 이전 중에는 토큰 세금이 없습니다. 아래 공개된 매수·매도 세금은 PancakeSwap V2 출시 후에만 적용됩니다. 생성 전에 세율, 마케팅 지갑, 보상 기준을 확인하세요.",
                  ja: "ボンディングカーブと流動性移行中はトークン税がかかりません。下記の公開された売買税はPancakeSwap V2移行後のみ有効です。作成前に税率、マーケティングウォレット、報酬条件を確認してください。",
                }[language]}
              </p>
            </div>
          )}

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
              placeholder={t("namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            {t("tokenSymbol")}
            <input
              required
              maxLength={10}
              value={symbol}
              placeholder={t("symbolPlaceholder")}
              onChange={(event) => setSymbol(event.target.value)}
            />
          </label>

          <label>
            {t("tokenIntro")}
            <textarea
              maxLength={500}
              value={description}
              placeholder={t("descriptionPlaceholder")}
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
            <small>{t("logoHelp")}</small>
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
            {communityLinkError && (
              <p className="error" role="alert">
                {communityLinkError}
              </p>
            )}
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
                aria-label={t("decreaseTarget")}
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
                aria-label={t("increaseTarget")}
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
              placeholder={t("initialBuyPlaceholder")}
              value={initialBuy}
              onChange={(event) => setInitialBuy(event.target.value)}
            />
            <small>
              {{
                zh: "留空或填写 0 表示只创建、不首购。部署费 0.001 BNB。首购与创建在同一笔交易完成；达到额度时自动毕业并销毁 LP，超额 BNB 自动退回。",
                en: "Leave blank or enter 0 to create without buying. The creation fee is 0.001 BNB. Creation and the initial buy are atomic; graduation burns LP and refunds excess BNB.",
                ko: "비워두거나 0을 입력하면 구매 없이 생성합니다. 생성 수수료는 0.001 BNB입니다. 생성과 최초 구매는 한 거래로 처리되며, 졸업 시 LP 소각 및 초과 BNB 환불이 자동 실행됩니다.",
                ja: "空欄または0で購入せず作成します。作成手数料は0.001 BNBです。作成と初回購入は同一取引で行われ、卒業時にLPをバーンし超過BNBを返金します。",
              }[language]}
            </small>
          </label>

          {!factoryAddress && (
            <p className="notice">
              {t("factoryMissing")}
            </p>
          )}

          {taxInvalid && (
            <p className="error">
              {language === "zh"
                ? "买入税或卖出税合计超过 10%，请降低税率。"
                : "Buy or sell tax exceeds the 10% maximum."}
            </p>
          )}

          <section className="transaction-preview" aria-label={t("transactionPreview")}>
            <div className="transaction-preview-heading">
              <strong>{t("transactionPreview")}</strong>
              <span>{t("slippageProtected")}</span>
            </div>
            <dl>
              <div>
                <dt>{t("destination")}</dt>
                <dd title={factoryAddress}>
                  {factoryAddress
                    ? `${factoryAddress.slice(0, 8)}…${factoryAddress.slice(-6)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{t("creationFee")}</dt>
                <dd>{formatEther(CREATION_FEE_WEI)} BNB</dd>
              </div>
              <div>
                <dt>{t("initialBuyValue")}</dt>
                <dd>{formatEther(previewInitialBuyWei)} BNB</dd>
              </div>
              <div>
                <dt>{t("totalSend")}</dt>
                <dd>{formatEther(previewTotalValue)} BNB</dd>
              </div>
              <div>
                <dt>{t("minimumReceive")}</dt>
                <dd>
                  {previewMinimumTokens > 0n
                    ? `${formatPreviewTokens(previewMinimumTokens)} ${symbol.trim() || "TOKEN"}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          {wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bsc.id })}
            >
              {t("switchNetwork")}
            </button>
          ) : (
            <button
              className="button wide"
              type="submit"
              disabled={!canSubmit || isPending || receipt.isLoading || isUploading || isFindingVanity}
            >
              {isUploading
                ? t("uploading")
                : isFindingVanity
                ? `${t("preparingAddress")} ${vanityProgress}%`
                : isPending
                ? t("walletConfirm")
                : receipt.isLoading
                ? t("confirming")
                : t("createToken")}
            </button>
          )}

          {hash && (
            <a className="trade-tx-link" href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">
              <span>{t("txHash")}</span><strong>{hash.slice(0, 12)}…{hash.slice(-8)} ↗</strong>
            </a>
          )}
          {(isPending || hash || receipt.isLoading || receipt.isSuccess) && (
            <div className="transaction-status" role="status" aria-live="polite">
              <strong>{t("txStatus")}</strong>
              <ol>
                <li className={hash ? "done" : "active"}>{t("walletStep")}</li>
                <li className={hash ? "done" : ""}>{t("broadcastStep")}</li>
                <li className={receipt.isSuccess ? "done" : hash ? "active" : ""}>{t("confirmStep")}</li>
                <li className={receipt.isSuccess ? "done" : ""}>{t("syncStep")}</li>
              </ol>
            </div>
          )}
          {receipt.isSuccess && (
            <p className="success">{t("creationSuccess")}</p>
          )}
          {receipt.isError && (
            <p className="error">{t("creationFailed")}</p>
          )}
          {uploadError && <p className="error">{uploadError}</p>}
          {error && <p className="error">{readableWalletError(error, language)}</p>}
        </form>
      </section>
    </main>
  );
}
