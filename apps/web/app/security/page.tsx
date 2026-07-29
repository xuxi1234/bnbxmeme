"use client";

import Link from "next/link";
import {
  autoLiquidityFactoryAddress,
  blockExplorerUrl,
  rewardsFactoryAddress,
  testnetFactoryAddress,
} from "@/lib/web3";
import { useLanguage } from "@/components/language-provider";

const factories = [
  ["STANDARD · ZERO TAX", testnetFactoryAddress],
  ["AUTO LIQUIDITY", autoLiquidityFactoryAddress],
  ["HOLDER / LP REWARDS", rewardsFactoryAddress],
] as const;

export default function SecurityPage() {
  const { language, t } = useLanguage();
  const content = {
    zh: {
      eyebrow: "BNBX TRUST CENTER",
      title: "安全、费用与正式合约",
      lead: "本页公开 BNBX 正式域名、合约、费用和钱包交互规则。未知数据不会显示成 0；交易前请同时核对钱包预览与 BscScan。",
      domain: "唯一正式域名",
      contracts: "BNB Chain Mainnet 正式 Factory",
      fees: "固定费用",
      feeItems: [
        ["创建代币", "0.001 BNB"],
        ["内盘买入", "0.5%"],
        ["内盘卖出", "0.5%"],
        ["报价保护", "界面默认最低收到保护 1%"],
      ],
      wallet: "钱包交互规则",
      walletItems: [
        "BNBX 永远不会索取助记词、私钥或钱包密码。",
        "创建、买入、授权和卖出只会在用户主动点击后请求钱包。",
        "创建前会展示交互合约、部署费、首购额、总发送额和最低收到。",
        "卖出首次授权后使用同一笔已锁定报价继续卖出；授权失败不会自动重试。",
      ],
      source: "链上验证说明",
      sourceText: "合约源码可在 BscScan 核验。源码验证提高透明度，但不等同于独立安全审计或收益保证。",
      report: "遇到钱包误报？请展开警告详情并保存警告类别与交易哈希，再联系官方社区。不要关闭钱包安全功能。",
    },
    en: {
      eyebrow: "BNBX TRUST CENTER",
      title: "Safety, fees and official contracts",
      lead: "This page publishes BNBX official domains, contracts, fees and wallet interaction rules. Unknown data is never shown as zero; verify wallet previews and BscScan before trading.",
      domain: "Only official domains",
      contracts: "Official BNB Chain Mainnet Factories",
      fees: "Fixed fees",
      feeItems: [["Token creation", "0.001 BNB"], ["Bonding-curve buy", "0.5%"], ["Bonding-curve sell", "0.5%"], ["Quote protection", "1% minimum-output protection by default"]],
      wallet: "Wallet interaction rules",
      walletItems: ["BNBX never asks for a recovery phrase, private key or wallet password.", "Wallet requests only follow an explicit create, buy, approve or sell action.", "The contract, creation fee, initial buy, total value and minimum output are shown before creation.", "A first sell approval continues with the locked order; failed approvals are never retried automatically."],
      source: "On-chain verification",
      sourceText: "Contract source can be checked on BscScan. Source verification improves transparency but is not an independent audit or a profit guarantee.",
      report: "If a wallet warns incorrectly, expand the warning and save its category and transaction hash before contacting the official community. Do not disable wallet security.",
    },
    ko: {
      eyebrow: "BNBX TRUST CENTER", title: "보안, 수수료 및 공식 컨트랙트",
      lead: "BNBX 공식 도메인, 컨트랙트, 수수료와 지갑 상호작용 원칙을 공개합니다. 알 수 없는 데이터를 0으로 표시하지 않으며 거래 전 지갑 미리보기와 BscScan을 확인하세요.",
      domain: "유일한 공식 도메인", contracts: "BNB Chain Mainnet 공식 Factory", fees: "고정 수수료",
      feeItems: [["토큰 생성", "0.001 BNB"], ["본딩 커브 구매", "0.5%"], ["본딩 커브 판매", "0.5%"], ["호가 보호", "기본 최소 수령 보호 1%"]],
      wallet: "지갑 상호작용 원칙",
      walletItems: ["BNBX는 복구 문구, 개인 키 또는 지갑 비밀번호를 요구하지 않습니다.", "지갑 요청은 사용자가 생성, 구매, 승인 또는 판매를 직접 클릭한 뒤에만 발생합니다.", "생성 전 컨트랙트, 생성 수수료, 최초 구매, 총액과 최소 수령량을 표시합니다.", "최초 판매 승인은 고정된 주문으로 이어지며 실패한 승인은 자동 재시도하지 않습니다."],
      source: "온체인 검증", sourceText: "BscScan에서 컨트랙트 소스를 확인할 수 있습니다. 소스 검증은 투명성을 높이지만 독립 감사나 수익 보장을 의미하지 않습니다.",
      report: "지갑 오탐이 발생하면 경고 상세를 펼쳐 분류와 거래 해시를 저장한 뒤 공식 커뮤니티에 문의하세요. 지갑 보안 기능을 끄지 마세요.",
    },
    ja: {
      eyebrow: "BNBX TRUST CENTER", title: "安全性・手数料・公式コントラクト",
      lead: "BNBXの公式ドメイン、コントラクト、手数料、ウォレット連携ルールを公開します。不明なデータを0として表示せず、取引前にウォレットのプレビューとBscScanを確認してください。",
      domain: "唯一の公式ドメイン", contracts: "BNB Chain Mainnet公式Factory", fees: "固定手数料",
      feeItems: [["トークン作成", "0.001 BNB"], ["カーブ購入", "0.5%"], ["カーブ売却", "0.5%"], ["価格保護", "最低受取保護1%（初期値）"]],
      wallet: "ウォレット連携ルール",
      walletItems: ["BNBXがリカバリーフレーズ、秘密鍵、ウォレットパスワードを求めることはありません。", "ウォレット要求は作成・購入・承認・売却をユーザーが明示的に操作した後だけ発生します。", "作成前にコントラクト、作成手数料、初回購入、合計送信額、最低受取量を表示します。", "初回売却承認後は固定した注文を続行し、失敗した承認を自動再試行しません。"],
      source: "オンチェーン検証", sourceText: "BscScanでコントラクトソースを確認できます。ソース検証は透明性を高めますが、独立監査や利益保証ではありません。",
      report: "ウォレットの誤検知があれば、警告詳細を開き分類と取引ハッシュを保存して公式コミュニティへ連絡してください。セキュリティ機能は無効にしないでください。",
    },
  }[language];

  return (
    <main className="security-page">
      <section className="security-hero">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.lead}</p>
      </section>
      <section className="trust-grid">
        <article>
          <h2>{content.domain}</h2>
          <a href="https://www.bnbx.meme/">https://www.bnbx.meme/</a>
          <a href="https://bnbx.meme/">https://bnbx.meme/</a>
        </article>
        <article>
          <h2>{content.fees}</h2>
          <dl>
            {content.feeItems.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </article>
      </section>
      <section className="official-contracts">
        <h2>{content.contracts}</h2>
        {factories.map(([label, address]) => (
          <a key={address} href={`${blockExplorerUrl}/address/${address}#code`} target="_blank" rel="noreferrer">
            <span>{label}</span><strong>{address}</strong><b>BSCSCAN ↗</b>
          </a>
        ))}
      </section>
      <section className="trust-grid">
        <article>
          <h2>{content.wallet}</h2>
          <ul>{content.walletItems.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article>
          <h2>{content.source}</h2>
          <p>{content.sourceText}</p>
          <p className="trust-warning">{content.report}</p>
          <Link className="button secondary" href="/create">{t("createToken")}</Link>
        </article>
      </section>
    </main>
  );
}
