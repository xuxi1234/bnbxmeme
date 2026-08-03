"use client";

import { Suspense } from "react";
import { HomeBanner } from "@/components/home-banner";
import { TokenMarket } from "@/components/token-market";
import { useLanguage } from "@/components/language-provider";

export function HomePage() {
  const { language } = useLanguage();
  const content = {
    zh: {
      assurances: [
        [
          "独立合约",
          "一币一合约",
          "每个项目部署独立、不可升级的代币合约，模板与税费公开。",
        ],
        [
          "链上开源",
          "交易公开可验",
          "创建、买卖、毕业和 LP 销毁全部保留链上记录。",
        ],
        [
          "资金安全",
          "超额自动退款",
          "买入超过毕业所需金额时，多余 BNB 在同笔交易中退回。",
        ],
      ],
    },
    en: {
      assurances: [
        [
          "INDEPENDENT",
          "One token, one contract",
          "Every project uses an immutable contract with a disclosed template and fees.",
        ],
        [
          "ON-CHAIN",
          "Publicly verifiable",
          "Creation, trading, graduation and LP burn remain on-chain.",
        ],
        [
          "PROTECTION",
          "Automatic refund",
          "Excess BNB is refunded in the same transaction.",
        ],
      ],
    },
    ko: {
      assurances: [
        [
          "독립 계약",
          "토큰별 독립 계약",
          "각 프로젝트는 템플릿과 수수료가 공개된 변경 불가능한 계약을 사용합니다.",
        ],
        [
          "온체인",
          "공개 검증",
          "생성, 거래, 졸업 및 LP 소각을 온체인에서 확인할 수 있습니다.",
        ],
        [
          "자금 보호",
          "초과금 자동 환불",
          "목표를 초과한 BNB는 같은 거래에서 환불됩니다.",
        ],
      ],
    },
    ja: {
      assurances: [
        [
          "独立契約",
          "1トークン1契約",
          "各プロジェクトはテンプレートと手数料が公開された変更不能な契約を使用します。",
        ],
        [
          "オンチェーン",
          "公開検証可能",
          "作成・取引・卒業・LPバーンをチェーン上で確認できます。",
        ],
        [
          "資金保護",
          "超過分を自動返金",
          "目標を超えたBNBは同一取引で返金されます。",
        ],
      ],
    },
  }[language];

  return (
    <main className="home">
      <section className="market-section" id="market">
        <Suspense fallback={null}>
          <TokenMarket />
        </Suspense>
      </section>

      <HomeBanner />

      <section className="assurance-grid" aria-label="BNBX">
        {content.assurances.map(([eyebrow, title, description]) => (
          <article key={title}>
            <small>{eyebrow}</small>
            <strong>{title}</strong>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
