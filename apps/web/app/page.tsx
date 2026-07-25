import Link from "next/link";
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

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">BNB CHAIN TESTNET</p>
          <h1>
            发现、创建、
            <br />
            交易下一轮热点。
          </h1>
          <p className="lead">
            0 税公平发射 · 固定 10 亿供应 · 8 亿联合曲线
            <br />
            达标后自动迁移 PancakeSwap V2 并永久销毁 LP
          </p>
          <div className="hero-actions">
            <Link className="button" href="/create">
              ＋ 创建代币
            </Link>
            <a className="text-link" href="#protocol">
              查看测试协议 ↗
            </a>
          </div>
        </div>
        <aside className="hero-panel">
          <span>BNBX 生态</span>
          <strong>公平发射，<br />从内盘到 V2</strong>
          <p>0 税代币、透明联合曲线、自动迁移与 LP 销毁。</p>
          <div className="hero-orbit">BNBX</div>
        </aside>
      </section>

      <section className="stats" id="protocol" aria-label="协议参数">
        {facts.map(([value, label]) => (
          <article key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="market-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIVE MARKET</p>
            <h2>实时内盘</h2>
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
