"use client";

import { HomeBanner } from "@/components/home-banner";
import { TokenMarket } from "@/components/token-market";
import { useLanguage } from "@/components/language-provider";

const facts = [
  ["10 亿", "固定供应 · 永不增发"],
  ["8 亿 / 2 亿", "联合曲线 / Pancake V2"],
  ["1–18 BNB", "创建者选择毕业额度"],
];

const assurances = [
  ["独立合约", "一币一合约", "每个项目部署独立、不可升级的 0 税代币合约。"],
  ["链上开源", "交易公开可验", "创建、买卖、毕业和 LP 销毁全部保留链上记录。"],
  ["资金安全", "超额自动退款", "买入超过毕业所需金额时，多余 BNB 在同笔交易中退回。"],
];

export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="home">
      <HomeBanner />

      <section className="stats" id="protocol" aria-label="协议参数">
        {facts.map(([value, label]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="assurance-grid" aria-label="平台安全机制">
        {assurances.map(([eyebrow, title, description]) => (
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
