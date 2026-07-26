"use client";

import { FormEvent, useState } from "react";
import { parseEther } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { factoryAbi, testnetFactoryAddress } from "@/lib/web3";

const CREATION_FEE_WEI = parseEther("0.001");

function safeInitialBuy(value: string) {
  try {
    return parseEther(value || "0") >= 0n;
  } catch {
    return false;
  }
}

export default function CreateTokenPage() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [telegram, setTelegram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [debox, setDebox] = useState("");
  const [qq, setQq] = useState("");
  const [target, setTarget] = useState(5);
  const [initialBuy, setInitialBuy] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isFindingVanity, setIsFindingVanity] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: bscTestnet.id });
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const factoryAddress = testnetFactoryAddress;

  async function uploadMetadata() {
    if (!description && !image && !website && !telegram && !twitter && !debox && !qq) {
      return "";
    }

    const form = new FormData();
    form.set("name", name.trim());
    form.set("symbol", symbol.trim().toUpperCase());
    form.set("description", description.trim());
    form.set("website", website.trim());
    form.set("telegram", telegram.trim());
    form.set("twitter", twitter.trim());
    form.set("debox", debox.trim());
    form.set("qq", qq.trim());
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
    if (!publicClient) throw new Error("测试网 RPC 尚未连接");
    const tokenName = name.trim();
    const tokenSymbol = symbol.trim().toUpperCase();
    const chunk = 20_000n;
    let start = (BigInt(Date.now()) << 160n) | BigInt(address ?? 0);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const [found, salt] = await publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "findVanitySalt",
        args: [tokenName, tokenSymbol, start, chunk],
      });
      if (found) return salt;
      start += chunk;
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
      const vanitySalt = await findVanitySalt();
      setIsFindingVanity(false);
      const initialBuyWei = parseEther(initialBuy || "0");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      if (initialBuyWei === 0n) {
        writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "createVanityToken",
          args: [{
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            graduationTargetBNB: target,
            metadataURI,
            vanitySalt,
          }],
          value: CREATION_FEE_WEI,
          chain: bscTestnet,
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
          symbol: symbol.trim().toUpperCase(),
          graduationTargetBNB: target,
          metadataURI,
          vanitySalt,
        }, {
          minTokensOut: 0n,
          deadline,
          refundRecipient: address,
        }],
        value: CREATION_FEE_WEI + initialBuyWei,
        chain: bscTestnet,
        account: address,
      });
    } catch (metadataError) {
      setUploadError(
        metadataError instanceof Error ? metadataError.message : "代币资料上传失败",
      );
    } finally {
      setIsUploading(false);
      setIsFindingVanity(false);
    }
  }

  const wrongChain = isConnected && chainId !== bscTestnet.id;
  const canSubmit =
    isConnected &&
    !wrongChain &&
    Boolean(factoryAddress) &&
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    safeInitialBuy(initialBuy);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">
          BNBX
        </a>
        <WalletButton />
      </header>

      <section className="form-shell">
        <p className="eyebrow">02 / CONFIGURE · BNB TESTNET</p>
        <h1 className="form-title">配置代币</h1>
        <p className="lead">
          零代码创建固定 10 亿供应的干净代币。永久 0 税、无增发权限，
          创建者首笔买入可与部署在同一笔交易内完成。
        </p>

        <form className="launch-form" onSubmit={submit}>
          <label>
            代币名称
            <input
              required
              maxLength={40}
              value={name}
              placeholder="例如 BNBX Cat"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label>
            代币符号
            <input
              required
              maxLength={10}
              value={symbol}
              placeholder="例如 BCAT"
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            />
          </label>

          <label>
            代币简介
            <textarea
              maxLength={500}
              value={description}
              placeholder="介绍代币、社区和 Meme 故事（最多 500 字）"
              onChange={(event) => setDescription(event.target.value)}
            />
            <small>{description.length}/500</small>
          </label>

          <label>
            代币 Logo
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              type="file"
              onChange={(event) => setImage(event.target.files?.[0] ?? null)}
            />
            <small>支持 JPG、PNG、WebP、GIF，最大 2MB。</small>
          </label>

          <fieldset className="social-fields">
            <legend>社区链接（选填）</legend>
            <input
              type="url"
              value={website}
              placeholder="官网 https://"
              onChange={(event) => setWebsite(event.target.value)}
            />
            <input
              type="url"
              value={telegram}
              placeholder="Telegram https://t.me/"
              onChange={(event) => setTelegram(event.target.value)}
            />
            <input
              type="url"
              value={twitter}
              placeholder="X / Twitter https://x.com/"
              onChange={(event) => setTwitter(event.target.value)}
            />
            <input
              type="url"
              value={debox}
              placeholder="DeBox https://debox.pro/"
              onChange={(event) => setDebox(event.target.value)}
            />
            <input
              type="url"
              value={qq}
              placeholder="QQ 群 https://qm.qq.com/"
              onChange={(event) => setQq(event.target.value)}
            />
          </fieldset>

          <label>
            毕业额度
            <select
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {Array.from({ length: 18 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value} BNB
                </option>
              ))}
            </select>
          </label>

          <label>
            创建者首购（选填）
            <input
              min="0"
              step="0.000000001"
              inputMode="decimal"
              placeholder="输入 BNB 金额"
              value={initialBuy}
              onChange={(event) => setInitialBuy(event.target.value)}
            />
            <small>
              留空或填写 0 表示只创建、不首购。部署费 0.001 BNB，首购手续费
              0.5%。首购与创建在同一笔交易完成，可避免创建后被抢跑。若扣除手续费后的
              净买入达到毕业额度，合约会自动毕业并销毁 LP，超额 BNB 自动退回。
            </small>
          </label>

          {!factoryAddress && (
            <p className="notice">
              测试网 Factory 合约地址尚未配置。完成合约部署和验证后，
              创建按钮将自动解锁。
            </p>
          )}

          {wrongChain ? (
            <button
              className="button wide"
              type="button"
              onClick={() => switchChain({ chainId: bscTestnet.id })}
            >
              切换到 BNB 测试网
            </button>
          ) : (
            <button
              className="button wide"
              type="submit"
              disabled={!canSubmit || isPending || isUploading || isFindingVanity}
            >
              {isUploading
                ? "正在上传到 IPFS…"
                : isFindingVanity
                ? "正在生成 1111 靓号地址…"
                : isPending
                ? "请在钱包确认…"
                : "创建代币"}
            </button>
          )}

          {hash && <p className="notice">交易哈希：{hash}</p>}
          {receipt.isSuccess && (
            <p className="success">代币已成功创建在 BNB 测试网。</p>
          )}
          {uploadError && <p className="error">{uploadError}</p>}
          {error && <p className="error">{error.message}</p>}
        </form>
      </section>
    </main>
  );
}
