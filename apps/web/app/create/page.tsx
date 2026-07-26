"use client";

import { FormEvent, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { factoryAbi, testnetFactoryAddress } from "@/lib/web3";

const CREATION_FEE_WEI = parseEther("0.001");
const BPS = 10_000n;
const NET_BPS = 9_950n;

function grossForNet(net: bigint) {
  return (net * BPS + NET_BPS - 1n) / NET_BPS;
}

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
  const [target, setTarget] = useState(5);
  const [initialBuy, setInitialBuy] = useState("0");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const factoryAddress = testnetFactoryAddress;

  function fillCurve() {
    setInitialBuy(formatEther(grossForNet(parseEther(String(target)))));
  }

  async function uploadMetadata() {
    if (!description && !image && !website && !telegram && !twitter && !debox) {
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !factoryAddress) return;

    setUploadError("");
    setIsUploading(true);
    try {
      const metadataURI = await uploadMetadata();
      const initialBuyWei = parseEther(initialBuy || "0");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      if (initialBuyWei === 0n) {
        writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: "createToken",
          args: [name.trim(), symbol.trim().toUpperCase(), target, metadataURI],
          value: CREATION_FEE_WEI,
          chain: bscTestnet,
          account: address,
        });
        return;
      }

      writeContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createTokenAndBuy",
        args: [
          name.trim(),
          symbol.trim().toUpperCase(),
          target,
          metadataURI,
          0n,
          deadline,
          address,
        ],
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
    }
  }

  const wrongChain = isConnected && chainId !== bscTestnet.id;
  const graduationGross = grossForNet(parseEther(String(target)));
  let fillsCurve = false;
  try {
    fillsCurve = parseEther(initialBuy || "0") >= graduationGross;
  } catch {
    // Validation below keeps submission disabled.
  }
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
            创建者原子首购
            <div className="input-action">
              <input
                min="0"
                step="0.000000001"
                inputMode="decimal"
                value={initialBuy}
                onChange={(event) => setInitialBuy(event.target.value)}
              />
              <button type="button" onClick={fillCurve}>
                精确填入一键毕业金额
              </button>
            </div>
            <small>
              可填写 0 表示只创建、不首购。部署费 0.001 BNB，首购手续费
              0.5%。可手动填写任意首购金额；扣除手续费后的净买入达到剩余毕业额度时，
              创建、买满、毕业和 LP 销毁会在同一笔交易完成，超额 BNB 自动退回。
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
              disabled={!canSubmit || isPending || isUploading}
            >
              {isUploading
                ? "正在上传到 IPFS…"
                : isPending
                ? "请在钱包确认…"
                : fillsCurve
                  ? `创建并一键打满 ${target} BNB 毕业`
                  : Number(initialBuy) > 0
                  ? "创建代币并执行首购"
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
