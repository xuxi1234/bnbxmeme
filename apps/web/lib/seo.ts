import type { Metadata } from "next";
import type { Language } from "@/components/language-provider";

export const SITE_URL = "https://www.bnbx.meme";
export const SITE_NAME = "BNBX";
export const SHARE_IMAGE_PATH = "/opengraph-image";

type SeoCopy = {
  title: string;
  description: string;
  locale: string;
};

export const seoCopy: Record<Language, SeoCopy> = {
  zh: {
    title: "BNBX — BNB Chain Meme 代币发射平台",
    description:
      "在 BNB Chain 创建和交易固定 10 亿供应的 Meme 代币，公开查看模板税费、联合曲线、PancakeSwap V2 迁移与 LP 销毁凭证。",
    locale: "zh_CN",
  },
  en: {
    title: "BNBX — BNB Chain Meme Token Launchpad",
    description:
      "Create and trade fixed-supply Meme tokens on BNB Chain with disclosed template taxes, bonding curves, PancakeSwap V2 migration, and verifiable LP burns.",
    locale: "en_US",
  },
  ko: {
    title: "BNBX — BNB Chain 밈 토큰 런치패드",
    description:
      "BNB Chain에서 고정 공급 밈 토큰을 만들고 거래하세요. 템플릿 세금, 본딩 커브, PancakeSwap V2 이전 및 LP 소각 증명을 투명하게 확인할 수 있습니다.",
    locale: "ko_KR",
  },
  ja: {
    title: "BNBX — BNB Chain Memeトークン・ローンチパッド",
    description:
      "BNB Chainで固定供給のMemeトークンを作成・取引。テンプレート税、ボンディングカーブ、PancakeSwap V2移行、LPバーン証明を公開します。",
    locale: "ja_JP",
  },
};

const alternateLocales = Object.values(seoCopy).map(({ locale }) => locale);

function socialMetadata(language: Language, path?: string): Metadata {
  const copy = seoCopy[language];
  return {
    title: copy.title,
    description: copy.description,
    openGraph: {
      title: copy.title,
      description: copy.description,
      siteName: SITE_NAME,
      type: "website",
      locale: copy.locale,
      alternateLocale: alternateLocales.filter(
        (locale) => locale !== copy.locale,
      ),
      url: path,
      images: [
        {
          url: SHARE_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: "BNBX — BNB Chain Meme Token Launchpad",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [SHARE_IMAGE_PATH],
    },
  };
}

export function buildSiteMetadata(language: Language = "zh"): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    ...socialMetadata(language),
  };
}

export function buildPageMetadata(
  path: string,
  language: Language = "zh",
): Metadata {
  return {
    ...socialMetadata(language, path),
    alternates: {
      canonical: path,
    },
  };
}
