"use client";

import { HomeBanner } from "@/components/home-banner";
import { TokenMarket } from "@/components/token-market";
import { useLanguage } from "@/components/language-provider";

export default function Home() {
  const { language, t } = useLanguage();
  const content = {
    zh: {
      assurances: [["独立合约", "一币一合约", "每个项目部署独立、不可升级的 0 税代币合约。"], ["链上开源", "交易公开可验", "创建、买卖、毕业和 LP 销毁全部保留链上记录。"], ["资金安全", "超额自动退款", "买入超过毕业所需金额时，多余 BNB 在同笔交易中退回。"]],
    },
    en: {
      assurances: [["INDEPENDENT", "One token, one contract", "Every project uses an immutable zero-tax token contract."], ["ON-CHAIN", "Publicly verifiable", "Creation, trading, graduation and LP burn remain on-chain."], ["PROTECTION", "Automatic refund", "Excess BNB is refunded in the same transaction."]],
    },
    ko: {
      assurances: [["독립 계약", "토큰별 독립 계약", "각 프로젝트는 변경 불가능한 0% 세금 계약을 사용합니다."], ["온체인", "공개 검증", "생성, 거래, 졸업 및 LP 소각을 온체인에서 확인할 수 있습니다."], ["자금 보호", "초과금 자동 환불", "목표를 초과한 BNB는 같은 거래에서 환불됩니다."]],
    },
    ja: {
      assurances: [["独立契約", "1トークン1契約", "各プロジェクトは変更不能な税率0%契約を使用します。"], ["オンチェーン", "公開検証可能", "作成・取引・卒業・LPバーンをチェーン上で確認できます。"], ["資金保護", "超過分を自動返金", "目標を超えたBNBは同一取引で返金されます。"]],
    },
  }[language];
  return (
    <main className="home">
      <HomeBanner />

      <section className="quick-paths" aria-label="BNBX launch workflow">
        <article><span>01</span><div><strong>{t("create")}</strong><p>1111 CA · 0% TAX</p></div></article>
        <article><span>02</span><div><strong>{t("curveTrading")}</strong><p>800M TOKENS</p></div></article>
        <article><span>03</span><div><strong>{t("graduating")}</strong><p>0.01–0.18 BNB</p></div></article>
        <article><span>04</span><div><strong>PANCAKE V2</strong><p>LP BURNED</p></div></article>
      </section>

      <section className="assurance-grid" aria-label="平台安全机制">
        {content.assurances.map(([eyebrow, title, description]) => (
          <article key={title}>
            <small>{eyebrow}</small>
            <strong>{title}</strong>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="market-section" id="market">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PROJECT LIST</p>
            <h2>{t("projects")}</h2>
          </div>
        </div>
        <TokenMarket />
      </section>
    </main>
  );
}
