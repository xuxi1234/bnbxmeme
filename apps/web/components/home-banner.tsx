"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const slides = [
  {
    eyebrow: "BNBX · BNB CHAIN LAUNCHPAD",
    title: "发射下一轮\nBNB 热点。",
    description: "固定 10 亿供应，8 亿联合曲线内盘，达标自动迁移 PancakeSwap V2。",
    badge: "FAIR LAUNCH",
  },
  {
    eyebrow: "1111 VANITY CONTRACT",
    title: "每一枚代币，\n都有 BNBX 标记。",
    description: "平台部署的代币合约地址统一以 1111 结尾，合约永久 0 税。",
    badge: "ENDS IN 1111",
  },
  {
    eyebrow: "ATOMIC GRADUATION",
    title: "买至毕业，\n一笔交易完成。",
    description: "创建者可原子首购；达到阈值后自动加池，LP 直接发送至销毁地址。",
    badge: "LP BURNED",
  },
] as const;

export function HomeBanner() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const slide = slides[active];
  return (
    <section className="home-banner" aria-label="BNBX 平台横幅">
      <div className="banner-grid" aria-hidden="true" />
      <div className="banner-glow" aria-hidden="true" />
      <div className="banner-copy">
        <p className="eyebrow">{slide.eyebrow}</p>
        <h1>{slide.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p>{slide.description}</p>
        <div className="banner-actions">
          <Link className="button" href="/create">部署代币</Link>
          <a className="banner-outline" href="#market">浏览内盘</a>
        </div>
      </div>
      <div className="banner-emblem" aria-hidden="true">
        <i />
        <strong>BNBX</strong>
        <span>{slide.badge}</span>
      </div>
      <div className="banner-controls">
        <button
          type="button"
          aria-label="上一张横幅"
          onClick={() => setActive((active - 1 + slides.length) % slides.length)}
        >
          ‹
        </button>
        <div>
          {slides.map((item, index) => (
            <button
              className={index === active ? "active" : ""}
              key={item.eyebrow}
              type="button"
              aria-label={`切换到第 ${index + 1} 张横幅`}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="下一张横幅"
          onClick={() => setActive((active + 1) % slides.length)}
        >
          ›
        </button>
      </div>
      <div className="banner-foot">
        <span>ZERO TAX TOKEN</span>
        <span>ON-CHAIN BONDING CURVE</span>
        <span>AUTO PANCAKE V2</span>
      </div>
    </section>
  );
}
