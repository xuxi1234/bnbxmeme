import { HomeBanner } from "@/components/home-banner";
import { TokenMarket } from "@/components/token-market";

const facts = [
  ["10 亿", "固定供应 · 永不增发"],
  ["8 亿 / 2 亿", "联合曲线 / Pancake V2"],
  ["1–18 BNB", "创建者选择毕业额度"],
  ["0.5%", "内盘买入与卖出手续费"],
];

const migration = [
  ["01", "8 亿内盘售出"],
  ["02", "停止内盘交易"],
  ["03", "2 亿 + BNB 加入 V2"],
  ["04", "LP 永久销毁"],
];

const assurances = [
  ["独立合约", "一币一合约", "每个项目部署独立、不可升级的 0 税代币合约。"],
  ["链上开源", "交易公开可验", "创建、买卖、毕业和 LP 销毁全部保留链上记录。"],
  ["资金安全", "超额自动退款", "买入超过毕业所需金额时，多余 BNB 在同笔交易中退回。"],
];

export default function Home() {
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
            <h2>实时项目</h2>
          </div>
          <div className="market-tabs">
            <button className="active">热门</button>
            <button>最新</button>
            <button>即将毕业</button>
          </div>
        </div>
        <TokenMarket />
      </section>

      <section className="migration" id="graduated">
        <div>
          <p className="eyebrow">AUTOMATIC MIGRATION</p>
          <h2>打满即毕业，流动性永久销毁。</h2>
        </div>
        <div className="migration-flow">
          {migration.map(([index, label], position) => (
            <article key={label}>
              <small>{index}</small>
              <strong>{label}</strong>
              {position < migration.length - 1 && <span>→</span>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
