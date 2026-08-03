"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  decodeEventLog,
  formatEther,
  isAddress,
  parseEther,
  zeroAddress,
} from "viem";
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
  factoryAbi,
  pancakeFactoryAddress,
  pancakeRouterAddress,
  rewardsFactoryAbi,
  rewardsFactoryAddress,
  testnetPublicClient,
  v3StandardFactoryAddress,
} from "@/lib/web3";
import { useLanguage } from "@/components/language-provider";
import {
  getCommunityLinkErrors,
  validateCommunityLinks,
  type CommunityLinkField,
} from "@/lib/community-links";
import { resolveCreateSubmitBlocker } from "@/lib/create-validation-core";
import { tokenProjectPath } from "@/lib/project-paths";
import {
  DEFAULT_HOLDER_MINIMUM_REWARD_BALANCE,
  DEFAULT_LP_MINIMUM_REWARD_BALANCE,
  DEFAULT_REWARD_TOKEN_ADDRESS,
  STANDARD_CREATE_GAS_LIMIT,
  advancedCreateGasLimit,
  advancedTemplateValue,
  emptyTaxSide,
  normalizeTaxesForTemplate,
  parseMinimumRewardShare,
  parseTaxPercent,
  parseTaxSide,
  taxSideToBps,
  type TaxKey,
  type TaxSide,
  type TemplateId,
} from "@/lib/advanced-template-config";
import {
  accessibilityCopy,
  createCopy,
  localizeCreateErrorMessage,
} from "@/lib/localization-copy";
import { MAX_TEMPLATE_SIDE_TAX_PERCENT as MAX_SIDE_TAX } from "@/lib/template-rules";

const CREATION_FEE_WEI = parseEther("0.001");
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

const templateIds: TemplateId[] = ["standard", "holders", "lp"];
const ZERO_SALT = `0x${"00".repeat(32)}` as const;
const rewardPoolFactoryAbi = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;
const rewardPoolRouterAbi = [
  {
    type: "function",
    name: "WETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
const rewardPoolPairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }],
  },
] as const;

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
  const newVirtualToken = ceilDiv(invariant, virtualBNBReserve + netBNB);
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

function readableWalletError(
  error: unknown,
  language: "zh" | "en" | "ko" | "ja",
) {
  const localized = {
    zh: {
      fallback: "钱包交易发送失败",
      gas: "钱包生成的 Gas 限额为 0。请刷新后重新提交。",
      rejected: "你已在钱包中取消操作，没有发送交易。",
      timeout: "RPC 节点响应超时。请先检查链上记录，不要连续重复点击。",
      reverted: "合约模拟或链上执行回滚。请保存参数和交易哈希以便诊断。",
    },
    en: {
      fallback: "Wallet transaction failed",
      gas: "The wallet generated an invalid gas limit. Refresh and submit again.",
      rejected:
        "You cancelled this action in your wallet. No transaction was sent.",
      timeout:
        "The RPC timed out. Check for an existing on-chain transaction before retrying.",
      reverted:
        "Contract simulation or execution reverted. Save the parameters and transaction hash for diagnosis.",
    },
    ko: {
      fallback: "지갑 거래 전송 실패",
      gas: "지갑이 잘못된 Gas 한도를 생성했습니다. 새로고침 후 다시 제출하세요.",
      rejected: "지갑에서 작업을 취소했습니다. 거래는 전송되지 않았습니다.",
      timeout:
        "RPC 응답 시간이 초과되었습니다. 재시도 전 온체인 거래 기록을 확인하세요.",
      reverted:
        "컨트랙트 시뮬레이션 또는 실행이 되돌려졌습니다. 진단을 위해 설정과 거래 해시를 저장하세요.",
    },
    ja: {
      fallback: "ウォレット取引の送信に失敗しました",
      gas: "ウォレットが無効なGas上限を生成しました。更新して再送信してください。",
      rejected:
        "ウォレットで操作をキャンセルしました。取引は送信されていません。",
      timeout:
        "RPCがタイムアウトしました。再試行前にオンチェーン履歴を確認してください。",
      reverted:
        "コントラクトのシミュレーションまたは実行がリバートしました。診断用に設定と取引ハッシュを保存してください。",
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
  const translated = localizeCreateErrorMessage(message, language);
  if (
    translated !== message ||
    Object.values(createCopy[language].errors).includes(message) ||
    language === "en"
  ) {
    return translated;
  }
  return localized.fallback;
}

function walletErrorDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return "";
  const coded = error as Error & { code?: number | string };
  const code = coded.code === undefined ? "" : ` [${String(coded.code)}]`;
  const summary =
    error.message.split("\n").find((line) => line.trim() !== "") ?? error.name;
  return `${error.name}${code}: ${summary}`.slice(0, 360);
}

export default function CreateTokenPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const copy = createCopy[language];
  const a11y = accessibilityCopy[language];
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
  const [buyTaxes, setBuyTaxes] = useState<TaxSide>(emptyTaxSide);
  const [sellTaxes, setSellTaxes] = useState<TaxSide>(emptyTaxSide);
  const [marketingWallet, setMarketingWallet] = useState("");
  const [rewardToken, setRewardToken] = useState(DEFAULT_REWARD_TOKEN_ADDRESS);
  const [minimumRewardBalances, setMinimumRewardBalances] = useState({
    holders: DEFAULT_HOLDER_MINIMUM_REWARD_BALANCE,
    lp: DEFAULT_LP_MINIMUM_REWARD_BALANCE,
  });
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isFindingVanity, setIsFindingVanity] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [vanityProgress, setVanityProgress] = useState(0);
  const [walletDiagnostic, setWalletDiagnostic] = useState("");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const {
    data: hash,
    error,
    isPending,
    writeContract,
    writeContractAsync,
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  const factoryAddress =
    template === "standard" ? v3StandardFactoryAddress : rewardsFactoryAddress;
  const minimumRewardBalance =
    template === "holders"
      ? minimumRewardBalances.holders
      : minimumRewardBalances.lp;

  useEffect(() => {
    if (!receipt.isSuccess || !receipt.data || !factoryAddress) return;
    for (const log of receipt.data.logs) {
      if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: template === "standard" ? factoryAbi : rewardsFactoryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "TokenCreated") continue;
        const args = decoded.args as { token?: `0x${string}` };
        if (args.token && isAddress(args.token)) {
          router.push(tokenProjectPath(args.token));
          return;
        }
      } catch {
        // The receipt contains Transfer and Pancake events too. Only a
        // successfully decoded TokenCreated event is eligible for navigation.
      }
    }
  }, [factoryAddress, receipt.data, receipt.isSuccess, router, template]);

  function configuredTaxes() {
    return {
      buy: taxSideToBps(buyTaxes),
      sell: taxSideToBps(sellTaxes),
    };
  }

  function minimumRewardShareOrThrow(
    selectedTemplate: Exclude<TemplateId, "standard">,
  ) {
    const minimumShare = parseMinimumRewardShare(
      selectedTemplate,
      minimumRewardBalance,
    );
    if (minimumShare !== null) return minimumShare;
    throw new Error(
      selectedTemplate === "holders"
        ? copy.errors.minimumHolderBalanceInvalid
        : copy.errors.minimumLpBalanceInvalid,
    );
  }

  async function validateRewardPool(rewardTokenAddress: `0x${string}`) {
    const [code, wbnb] = await Promise.all([
      testnetPublicClient.getCode({ address: rewardTokenAddress }),
      testnetPublicClient.readContract({
        address: pancakeRouterAddress,
        abi: rewardPoolRouterAbi,
        functionName: "WETH",
      }),
    ]);
    if (
      !code ||
      code === "0x" ||
      rewardTokenAddress.toLowerCase() === wbnb.toLowerCase()
    ) {
      throw new Error(copy.errors.rewardPoolMissing);
    }
    const pair = await testnetPublicClient.readContract({
      address: pancakeFactoryAddress,
      abi: rewardPoolFactoryAbi,
      functionName: "getPair",
      args: [rewardTokenAddress, wbnb],
    });
    if (pair === zeroAddress) {
      throw new Error(copy.errors.rewardPoolMissing);
    }
    const [reserve0, reserve1] = await testnetPublicClient.readContract({
      address: pair,
      abi: rewardPoolPairAbi,
      functionName: "getReserves",
    });
    if (reserve0 === 0n || reserve1 === 0n) {
      throw new Error(copy.errors.rewardPoolMissing);
    }
  }

  async function uploadMetadata() {
    if (
      !description &&
      !image &&
      !website &&
      !telegram &&
      !twitter &&
      !debox &&
      !qqGroupNumber
    ) {
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

    const response = await fetch("/api/metadata", {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as {
      metadataURI?: string;
      error?: string;
    };
    if (!response.ok || !result.metadataURI) {
      throw new Error(result.error ?? copy.errors.metadataUploadFailed);
    }
    return result.metadataURI;
  }

  async function findVanitySalt() {
    if (!address) throw new Error(copy.errors.walletRequired);
    const tokenName = name.trim();
    const tokenSymbol = symbol.trim();
    const start = (BigInt(Date.now()) << 160n) | BigInt(address ?? 0);
    const marketing =
      marketingWallet.trim() === "" ? address : marketingWallet.trim();
    if (template !== "standard" && (!marketing || !isAddress(marketing))) {
      throw new Error(copy.errors.marketingWalletInvalid);
    }
    const marketingAddress = marketing as `0x${string}`;
    if (template === "holders" || template === "lp") {
      if (!rewardsFactoryAddress) {
        throw new Error(copy.errors.rewardsFactoryMissing);
      }
      const templateValue = advancedTemplateValue(template);
      const minimumShare = minimumRewardShareOrThrow(template);
      const rewardTokenAddress = rewardToken.trim();
      if (!isAddress(rewardTokenAddress)) {
        throw new Error(copy.errors.rewardTokenInvalid);
      }
      const saltRequest = {
        name: tokenName,
        symbol: tokenSymbol,
        graduationTargetBNB: target,
        metadataURI: "",
        vanitySalt: ZERO_SALT,
        marketingWallet: marketingAddress,
        rewardToken: rewardTokenAddress,
        taxes: configuredTaxes(),
        template: templateValue,
        minimumRewardShare: minimumShare,
      };
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
            saltRequest,
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
      throw new Error(copy.errors.vanityUnavailable);
    } else {
      setVanityProgress(0);
      for (
        let index = 0;
        index < VANITY_SEARCH_LIMIT;
        index += VANITY_SEARCH_CHUNK_SIZE
      ) {
        const result = await testnetPublicClient.readContract({
          address: v3StandardFactoryAddress!,
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
    throw new Error(copy.errors.vanityUnavailable);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !factoryAddress) return;

    setUploadError("");
    setWalletDiagnostic("");
    setIsUploading(true);
    try {
      if (advancedTemplate) {
        const rewardTokenAddress = rewardToken.trim();
        if (!isAddress(rewardTokenAddress)) {
          throw new Error(copy.errors.rewardTokenInvalid);
        }
        await validateRewardPool(rewardTokenAddress);
      }
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
      if (template !== "standard") {
        const selectedFactory = rewardsFactoryAddress;
        const selectedAbi = rewardsFactoryAbi;
        if (!selectedFactory) {
          throw new Error(copy.errors.selectedFactoryMissing);
        }
        const marketing =
          marketingWallet.trim() === "" ? address : marketingWallet.trim();
        if (!isAddress(marketing)) {
          throw new Error(copy.errors.marketingWalletInvalid);
        }
        const rewardTokenAddress = rewardToken.trim();
        if (!isAddress(rewardTokenAddress)) {
          throw new Error(copy.errors.rewardTokenInvalid);
        }
        const request = {
          name: name.trim(),
          symbol: symbol.trim(),
          graduationTargetBNB: target,
          metadataURI,
          vanitySalt,
          marketingWallet: marketing,
          rewardToken: rewardTokenAddress,
          taxes: configuredTaxes(),
          template: advancedTemplateValue(template),
          minimumRewardShare: minimumRewardShareOrThrow(template),
        };
        if (initialBuyWei === 0n) {
          setIsPreflighting(true);
          const estimatedGas = await testnetPublicClient.estimateContractGas({
            account: address,
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityToken",
            args: [request],
            value: CREATION_FEE_WEI,
          });
          const gas = advancedCreateGasLimit(estimatedGas);
          setIsPreflighting(false);
          await writeContractAsync({
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityToken",
            args: [request],
            value: CREATION_FEE_WEI,
            gas,
            chain: bsc,
            account: address,
          });
        } else {
          const buyRequest = {
            minTokensOut: minimumInitialTokens,
            deadline,
            refundRecipient: address,
          };
          setIsPreflighting(true);
          const estimatedGas = await testnetPublicClient.estimateContractGas({
            account: address,
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityTokenAndBuy",
            args: [request, buyRequest],
            value: CREATION_FEE_WEI + initialBuyWei,
          });
          const gas = advancedCreateGasLimit(estimatedGas);
          setIsPreflighting(false);
          await writeContractAsync({
            address: selectedFactory,
            abi: selectedAbi,
            functionName: "createVanityTokenAndBuy",
            args: [request, buyRequest],
            value: CREATION_FEE_WEI + initialBuyWei,
            gas,
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
          args: [
            {
              name: name.trim(),
              symbol: symbol.trim(),
              graduationTargetBNB: target,
              metadataURI,
              vanitySalt,
            },
          ],
          value: CREATION_FEE_WEI,
          gas: STANDARD_CREATE_GAS_LIMIT,
          chain: bsc,
          account: address,
        });
        return;
      }

      writeContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createVanityTokenAndBuy",
        args: [
          {
            name: name.trim(),
            symbol: symbol.trim(),
            graduationTargetBNB: target,
            metadataURI,
            vanitySalt,
          },
          {
            minTokensOut: minimumInitialTokens,
            deadline,
            refundRecipient: address,
          },
        ],
        value: CREATION_FEE_WEI + initialBuyWei,
        gas: STANDARD_CREATE_GAS_LIMIT,
        chain: bsc,
        account: address,
      });
    } catch (metadataError) {
      setUploadError(readableWalletError(metadataError, language));
      setWalletDiagnostic(walletErrorDiagnostic(metadataError));
    } finally {
      setIsUploading(false);
      setIsFindingVanity(false);
      setIsPreflighting(false);
      setVanityProgress(0);
    }
  }

  const wrongChain = isConnected && chainId !== bsc.id;
  const advancedTemplate = template !== "standard";
  const unavailableTemplate = advancedTemplate && !rewardsFactoryAddress;
  const parsedBuyTaxes = parseTaxSide(buyTaxes);
  const parsedSellTaxes = parseTaxSide(sellTaxes);
  const buyTaxTotal = parsedBuyTaxes
    ? Object.values(parsedBuyTaxes).reduce((sum, value) => sum + value, 0)
    : Number.NaN;
  const sellTaxTotal = parsedSellTaxes
    ? Object.values(parsedSellTaxes).reduce((sum, value) => sum + value, 0)
    : Number.NaN;
  const taxInvalid =
    !parsedBuyTaxes ||
    !parsedSellTaxes ||
    buyTaxTotal > MAX_SIDE_TAX ||
    sellTaxTotal > MAX_SIDE_TAX;
  const rawCommunityLinkErrors = getCommunityLinkErrors({
    website,
    telegram,
    twitter,
    debox,
    qqGroupNumber,
  });
  const communityLinkErrors = Object.fromEntries(
    Object.entries(rawCommunityLinkErrors).map(([field, message]) => [
      field,
      localizeCreateErrorMessage(message, language),
    ]),
  ) as Partial<Record<CommunityLinkField, string>>;
  const communityLinkError =
    Object.values(communityLinkErrors).find(Boolean) ?? "";
  const previewInitialBuyWei = safeInitialBuy(initialBuy)
    ? parseEther(initialBuy || "0")
    : 0n;
  const previewMinimumTokens = quoteFreshCurveBuy(target, previewInitialBuyWei);
  const previewTotalValue = CREATION_FEE_WEI + previewInitialBuyWei;
  const rewardsValid =
    !advancedTemplate ||
    (isAddress(rewardToken.trim()) &&
      parseMinimumRewardShare(template, minimumRewardBalance) !== null);
  const submitBlocker = resolveCreateSubmitBlocker({
    isConnected,
    factoryAvailable: Boolean(factoryAddress),
    templateAvailable: !unavailableTemplate,
    name,
    symbol,
    communityValid: !communityLinkError,
    initialBuyValid: safeInitialBuy(initialBuy),
    taxValid: !taxInvalid,
    rewardsValid,
  });
  const submitBlockerText = submitBlocker
    ? copy.submitBlockers[submitBlocker]
    : "";
  const canSubmit = !wrongChain && submitBlocker === null;

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
        <p className="lead">{copy.lead}</p>

        <form className="launch-form" onSubmit={submit}>
          <fieldset className="template-picker">
            <legend>{t("templateSelect")}</legend>
            <div className="template-grid">
              {templateIds.map((id) => {
                const content = copy.templates[id];
                const enabled =
                  id === "standard"
                    ? Boolean(v3StandardFactoryAddress)
                    : Boolean(rewardsFactoryAddress);
                return (
                  <button
                    aria-pressed={template === id}
                    className={`template-card ${template === id ? "selected" : ""} ${enabled ? "" : "disabled"}`}
                    key={id}
                    onClick={() => {
                      const normalizedTaxes = normalizeTaxesForTemplate(
                        id,
                        buyTaxes,
                        sellTaxes,
                      );
                      setTemplate(id);
                      setUploadError("");
                      setBuyTaxes(normalizedTaxes.buy);
                      setSellTaxes(normalizedTaxes.sell);
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
              <strong>{copy.advancedWarningTitle}</strong>
              <p>{copy.advancedWarningBody}</p>
            </div>
          )}

          {advancedTemplate && (
            <fieldset className="tax-config">
              <legend>{copy.taxTitle}</legend>
              <p className="field-help">{copy.taxHelp}</p>
              {(["buy", "sell"] as const).map((side) => {
                const values = side === "buy" ? buyTaxes : sellTaxes;
                const update = side === "buy" ? setBuyTaxes : setSellTaxes;
                const total = side === "buy" ? buyTaxTotal : sellTaxTotal;
                return (
                  <section className="tax-side" key={side}>
                    <div className="tax-heading">
                      <strong>
                        {side === "buy" ? copy.buyTax : copy.sellTax}
                      </strong>
                      <b
                        className={
                          !Number.isFinite(total) || total > MAX_SIDE_TAX
                            ? "over-limit"
                            : ""
                        }
                      >
                        {Number.isFinite(total) ? total.toFixed(2) : "—"}% /{" "}
                        {MAX_SIDE_TAX}%
                      </b>
                    </div>
                    <div className="tax-grid">
                      {(Object.keys(values) as TaxKey[]).map((key) => {
                        const labels = copy.taxLabels;
                        const invalid = parseTaxPercent(values[key]) === null;
                        return (
                          <label className="tax-number-control" key={key}>
                            <span>{labels[key]}</span>
                            <div className="tax-number-input">
                              <input
                                aria-label={`${side === "buy" ? copy.buyTax : copy.sellTax} ${labels[key]}`}
                                aria-invalid={invalid}
                                inputMode="decimal"
                                max={MAX_SIDE_TAX}
                                min="0"
                                step="0.01"
                                type="number"
                                value={values[key]}
                                onChange={(event) =>
                                  update({
                                    ...values,
                                    [key]: event.target.value,
                                  })
                                }
                              />
                              <span>%</span>
                            </div>
                            {invalid && (
                              <small className="field-error">
                                {copy.taxNumberInvalid}
                              </small>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {(!Number.isFinite(total) || total > MAX_SIDE_TAX) && (
                      <p className="field-error">{copy.taxInvalid}</p>
                    )}
                  </section>
                );
              })}
              <label>
                {copy.rewardToken}
                <input
                  required
                  aria-invalid={
                    rewardToken.trim() !== "" && !isAddress(rewardToken.trim())
                  }
                  value={rewardToken}
                  placeholder="0x..."
                  onChange={(event) => setRewardToken(event.target.value)}
                />
                <span className="field-help">{copy.rewardTokenHelp}</span>
              </label>
              <label>
                {copy.marketingWallet}
                <input
                  value={marketingWallet}
                  placeholder={
                    address ? `${address} (${copy.creatorDefault})` : "0x..."
                  }
                  onChange={(event) => setMarketingWallet(event.target.value)}
                />
              </label>
              <label>
                {template === "holders"
                  ? copy.minimumHolderBalance
                  : copy.minimumLpBalance}
                <input
                  required
                  aria-invalid={
                    parseMinimumRewardShare(template, minimumRewardBalance) ===
                    null
                  }
                  inputMode="decimal"
                  min={template === "holders" ? "1000" : "0"}
                  step="any"
                  type="number"
                  value={minimumRewardBalance}
                  placeholder={
                    template === "holders"
                      ? DEFAULT_HOLDER_MINIMUM_REWARD_BALANCE
                      : DEFAULT_LP_MINIMUM_REWARD_BALANCE
                  }
                  onChange={(event) => {
                    const key = template === "holders" ? "holders" : "lp";
                    setMinimumRewardBalances((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }));
                  }}
                />
                {parseMinimumRewardShare(template, minimumRewardBalance) ===
                  null && (
                  <small className="field-error">
                    {template === "holders"
                      ? copy.errors.minimumHolderBalanceInvalid
                      : copy.errors.minimumLpBalanceInvalid}
                  </small>
                )}
                <span className="field-help">{copy.rewardsHelp}</span>
              </label>
              {unavailableTemplate && (
                <p className="preview-lock">{copy.factorySafetyLock}</p>
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
            <div className="social-field">
              <input
                id="website"
                type="text"
                inputMode="url"
                aria-label={t("websitePlaceholder")}
                aria-invalid={Boolean(communityLinkErrors.website)}
                aria-describedby={
                  communityLinkErrors.website ? "website-error" : undefined
                }
                maxLength={100}
                value={website}
                placeholder={t("websitePlaceholder")}
                onChange={(event) => setWebsite(event.target.value)}
              />
              {communityLinkErrors.website && (
                <small className="field-error" id="website-error">
                  {communityLinkErrors.website}
                </small>
              )}
            </div>
            <div className="social-field">
              <input
                id="telegram"
                type="text"
                aria-label={t("telegramPlaceholder")}
                aria-invalid={Boolean(communityLinkErrors.telegram)}
                aria-describedby={
                  communityLinkErrors.telegram ? "telegram-error" : undefined
                }
                maxLength={100}
                value={telegram}
                placeholder={t("telegramPlaceholder")}
                onChange={(event) => setTelegram(event.target.value)}
              />
              {communityLinkErrors.telegram && (
                <small className="field-error" id="telegram-error">
                  {communityLinkErrors.telegram}
                </small>
              )}
            </div>
            <div className="social-field">
              <input
                id="twitter"
                type="text"
                aria-label={t("twitterPlaceholder")}
                aria-invalid={Boolean(communityLinkErrors.twitter)}
                aria-describedby={
                  communityLinkErrors.twitter ? "twitter-error" : undefined
                }
                maxLength={100}
                value={twitter}
                placeholder={t("twitterPlaceholder")}
                onChange={(event) => setTwitter(event.target.value)}
              />
              {communityLinkErrors.twitter && (
                <small className="field-error" id="twitter-error">
                  {communityLinkErrors.twitter}
                </small>
              )}
            </div>
            <div className="social-field">
              <input
                id="debox"
                type="text"
                aria-label={t("deboxPlaceholder")}
                aria-invalid={Boolean(communityLinkErrors.debox)}
                aria-describedby={
                  communityLinkErrors.debox ? "debox-error" : undefined
                }
                maxLength={100}
                value={debox}
                placeholder={t("deboxPlaceholder")}
                onChange={(event) => setDebox(event.target.value)}
              />
              {communityLinkErrors.debox && (
                <small className="field-error" id="debox-error">
                  {communityLinkErrors.debox}
                </small>
              )}
            </div>
            <div className="social-field">
              <input
                id="qq-group-number"
                type="text"
                aria-label={t("qqGroupNumber")}
                aria-invalid={Boolean(communityLinkErrors.qqGroupNumber)}
                aria-describedby={
                  communityLinkErrors.qqGroupNumber
                    ? "qq-group-number-error"
                    : undefined
                }
                maxLength={100}
                value={qqGroupNumber}
                placeholder={t("qqPlaceholder")}
                onChange={(event) => setQqGroupNumber(event.target.value)}
              />
              {communityLinkErrors.qqGroupNumber && (
                <small className="field-error" id="qq-group-number-error">
                  {communityLinkErrors.qqGroupNumber}
                </small>
              )}
            </div>
          </fieldset>

          <fieldset className="graduation-control">
            <legend>{t("graduationTarget")}</legend>
            <div className="graduation-value" aria-live="polite">
              <span>{(target / 100).toFixed(2)}</span>
              <small>BNB</small>
            </div>
            <div
              className="graduation-presets"
              aria-label={a11y.graduationPresets}
            >
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
                style={
                  {
                    "--range-progress": `${((target - 1) / 17) * 100}%`,
                  } as CSSProperties
                }
                onChange={(event) => setTarget(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label={t("increaseTarget")}
                disabled={target >= 18}
                onClick={() =>
                  setTarget((current) => Math.min(18, current + 1))
                }
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
              {
                {
                  zh: "留空或填写 0 表示只创建、不首购。部署费 0.001 BNB。首购与创建在同一笔交易完成；达到额度时自动毕业并销毁 LP，超额 BNB 自动退回。",
                  en: "Leave blank or enter 0 to create without buying. The creation fee is 0.001 BNB. Creation and the initial buy are atomic; graduation burns LP and refunds excess BNB.",
                  ko: "비워두거나 0을 입력하면 구매 없이 생성합니다. 생성 수수료는 0.001 BNB입니다. 생성과 최초 구매는 한 거래로 처리되며, 졸업 시 LP 소각 및 초과 BNB 환불이 자동 실행됩니다.",
                  ja: "空欄または0で購入せず作成します。作成手数料は0.001 BNBです。作成と初回購入は同一取引で行われ、卒業時にLPをバーンし超過BNBを返金します。",
                }[language]
              }
            </small>
          </label>

          {!factoryAddress && <p className="notice">{t("factoryMissing")}</p>}

          {taxInvalid && <p className="error">{copy.taxInvalid}</p>}

          <section
            className="transaction-preview"
            aria-label={t("transactionPreview")}
          >
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
              aria-describedby={
                submitBlocker ? "create-submit-blocker" : undefined
              }
              disabled={
                !canSubmit ||
                isPending ||
                receipt.isLoading ||
                isUploading ||
                isFindingVanity ||
                isPreflighting
              }
              title={submitBlockerText || undefined}
            >
              {isUploading
                ? t("uploading")
                : isFindingVanity
                  ? `${t("preparingAddress")} ${vanityProgress}%`
                  : isPreflighting
                    ? t("walletConfirm")
                    : isPending
                      ? t("walletConfirm")
                      : receipt.isLoading
                        ? t("confirming")
                        : t("createToken")}
            </button>
          )}
          {!wrongChain && submitBlockerText && (
            <p
              className="submit-blocker"
              id="create-submit-blocker"
              role="status"
            >
              {submitBlockerText}
            </p>
          )}

          {hash && (
            <a
              className="trade-tx-link"
              href={`https://bscscan.com/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
            >
              <span>{t("txHash")}</span>
              <strong>
                {hash.slice(0, 12)}…{hash.slice(-8)} ↗
              </strong>
            </a>
          )}
          {(isPending || hash || receipt.isLoading || receipt.isSuccess) && (
            <div
              className="transaction-status"
              role="status"
              aria-live="polite"
            >
              <strong>{t("txStatus")}</strong>
              <ol>
                <li className={hash ? "done" : "active"}>{t("walletStep")}</li>
                <li className={hash ? "done" : ""}>{t("broadcastStep")}</li>
                <li
                  className={receipt.isSuccess ? "done" : hash ? "active" : ""}
                >
                  {t("confirmStep")}
                </li>
                <li className={receipt.isSuccess ? "done" : ""}>
                  {t("syncStep")}
                </li>
              </ol>
            </div>
          )}
          {receipt.isSuccess && (
            <p className="success">{t("creationSuccess")}</p>
          )}
          {receipt.isError && <p className="error">{t("creationFailed")}</p>}
          {uploadError && <p className="error">{uploadError}</p>}
          {walletDiagnostic && (
            <p className="error">
              <code>{walletDiagnostic}</code>
            </p>
          )}
          {error && !uploadError && (
            <p className="error">{readableWalletError(error, language)}</p>
          )}
        </form>
      </section>
    </main>
  );
}
