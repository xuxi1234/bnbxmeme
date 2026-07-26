"use client";

import { useLanguage } from "./language-provider";

export function AnnouncementBar() {
  const { language } = useLanguage();
  const copy = {
    zh: "BNBX.MEME是一个全新的内盘发射平台，更低的费用，更高的收益，BNBX是你在BSC链发行MEME代币的首选平台。",
    en: "BNBX.MEME is a new bonding-curve launchpad with lower fees and greater potential. BNBX is your first choice for launching MEME tokens on BSC.",
    ko: "BNBX.MEME는 더 낮은 수수료와 더 높은 잠재력을 제공하는 새로운 본딩 커브 런치패드입니다. BSC에서 MEME 토큰을 발행할 때 BNBX를 선택하세요.",
    ja: "BNBX.MEMEは、より低い手数料と高い可能性を提供する新しいボンディングカーブ型ローンチパッドです。BSCでMEMEトークンを発行するならBNBX。",
  }[language];
  return (
    <div className="announcement-bar" aria-label="BNBX protocol">
      <div><span>{copy}</span><span aria-hidden="true">{copy}</span></div>
    </div>
  );
}
