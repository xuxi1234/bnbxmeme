"use client";

import { useLanguage } from "./language-provider";

export function AnnouncementBar() {
  const { language } = useLanguage();
  const copy = {
    zh: "固定 10 亿供应  ·  0% 代币税  ·  合约地址 1111 结尾  ·  达标自动迁移 PancakeSwap V2  ·  LP 永久销毁",
    en: "FIXED 1B SUPPLY  ·  ZERO TOKEN TAX  ·  CONTRACTS END IN 1111  ·  AUTO PANCAKESWAP V2 MIGRATION  ·  LP PERMANENTLY BURNED",
    ko: "10억 고정 공급  ·  토큰 세금 0%  ·  1111 주소  ·  PancakeSwap V2 자동 이전  ·  LP 영구 소각",
    ja: "10億固定供給  ·  トークン税率0%  ·  アドレス末尾1111  ·  PancakeSwap V2自動移行  ·  LP永久バーン",
  }[language];
  return (
    <div className="announcement-bar" aria-label="BNBX protocol">
      <div><span>{copy}</span><span aria-hidden="true">{copy}</span></div>
    </div>
  );
}
