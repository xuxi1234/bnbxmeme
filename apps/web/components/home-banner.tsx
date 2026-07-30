"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "./language-provider";
import { accessibilityCopy, interpolate } from "@/lib/localization-copy";

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
    description: "合约地址统一以 1111 结尾；标准模板永久 0 税，高级模板公开展示税费配置。",
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
  const { language, t } = useLanguage();
  const a11y = accessibilityCopy[language];

  useEffect(() => {
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const translatedSlides = language === "zh" ? slides : [
    {
      eyebrow: "BNBX · BNB CHAIN LAUNCHPAD",
      title: language === "ko" ? "다음 BNB\n트렌드를 시작하세요." : language === "ja" ? "次のBNB\nトレンドを発射。" : "Launch the next\nBNB trend.",
      description: language === "ko" ? "10억 고정 공급, 본딩 커브 거래 후 PancakeSwap V2로 자동 이전됩니다." : language === "ja" ? "10億の固定供給。ボンディングカーブ完了後、PancakeSwap V2へ自動移行。" : "Fixed 1B supply, bonding-curve trading and automatic PancakeSwap V2 migration.",
      badge: "FAIR LAUNCH",
    },
    {
      eyebrow: "1111 VANITY CONTRACT",
      title: language === "ko" ? "모든 토큰에\nBNBX 시그니처." : language === "ja" ? "すべてのトークンに\nBNBXの印。" : "Every token bears\nthe BNBX signature.",
      description: language === "ko" ? "모든 주소는 1111로 끝납니다. 표준 템플릿은 영구 0% 세금이며 고급 템플릿은 세금 설정을 공개합니다." : language === "ja" ? "全アドレスは1111で終了。標準テンプレートは永久0%税、高機能テンプレートは税設定を公開します。" : "Every address ends in 1111. The standard template is permanently zero-tax; advanced templates disclose their tax settings.",
      badge: "ENDS IN 1111",
    },
    {
      eyebrow: "ATOMIC GRADUATION",
      title: language === "ko" ? "목표 달성 즉시\n자동 졸업." : language === "ja" ? "目標達成と同時に\n自動卒業。" : "Hit the target.\nGraduate atomically.",
      description: language === "ko" ? "목표 달성 시 자동으로 유동성을 추가하고 LP를 소각 주소로 보냅니다." : language === "ja" ? "目標達成時に流動性を自動追加し、LPをバーンアドレスへ送ります。" : "At the target, liquidity is added automatically and LP is sent to the burn address.",
      badge: "LP BURNED",
    },
  ];
  const slide = translatedSlides[active];
  return (
    <section className="home-banner" aria-label={a11y.homeBanner}>
      <div className="banner-grid" aria-hidden="true" />
      <div className="banner-glow" aria-hidden="true" />
      <div className="banner-copy">
        <p className="eyebrow">{slide.eyebrow}</p>
        <h1>{slide.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p>{slide.description}</p>
        <div className="banner-actions">
          <Link className="button" href="/create">{t("deploy")}</Link>
          <a className="banner-outline" href="#market">{t("browse")}</a>
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
          aria-label={a11y.previousBanner}
          onClick={() => setActive((active - 1 + slides.length) % slides.length)}
        >
          ‹
        </button>
        <div>
          {translatedSlides.map((item, index) => (
            <button
              className={index === active ? "active" : ""}
              key={item.eyebrow}
              type="button"
              aria-label={interpolate(a11y.bannerSlide, { index: index + 1 })}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={a11y.nextBanner}
          onClick={() => setActive((active + 1) % slides.length)}
        >
          ›
        </button>
      </div>
      <div className="banner-foot">
        <span>VERIFIED TOKEN TEMPLATES</span>
        <span>ON-CHAIN BONDING CURVE</span>
        <span>AUTO PANCAKE V2</span>
      </div>
    </section>
  );
}
