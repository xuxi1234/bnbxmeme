import type { Metadata } from "next";
import type { Language } from "@/components/language-provider";

export const SITE_URL = "https://www.bnbx.meme";
export const SITE_NAME = "BNBX";
export const SHARE_IMAGE_PATH = "/opengraph-image";
export const SHARE_IMAGE_ALT = "BNBX — BNB Chain Meme Token Launchpad";
const MAX_TOKEN_NAME_LENGTH = 48;
const MAX_TOKEN_SYMBOL_LENGTH = 20;
const MAX_META_DESCRIPTION_LENGTH = 160;

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

const tokenDescriptionCopy: Record<Language, (identity: string) => string> = {
  zh: (identity) =>
    `在 BNBX 查看 ${identity} 的 BNB Chain 合约信息、链上交易、持仓分布与 PancakeSwap V2 状态。`,
  en: (identity) =>
    `View ${identity} on BNBX: BNB Chain contract details, on-chain trades, holders, and PancakeSwap V2 status.`,
  ko: (identity) =>
    `BNBX에서 ${identity}의 BNB Chain 컨트랙트 정보, 온체인 거래, 보유자 분포 및 PancakeSwap V2 상태를 확인하세요.`,
  ja: (identity) =>
    `BNBXで${identity}のBNB Chainコントラクト情報、オンチェーン取引、保有者分布、PancakeSwap V2の状態を確認できます。`,
};

function normalizeTokenIdentity(
  value: string | null | undefined,
  limit: number,
) {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return [...normalized].slice(0, limit).join("");
}

export function buildTokenIdentityLabel(
  name: string | null | undefined,
  symbol: string | null | undefined,
) {
  const safeName = normalizeTokenIdentity(name, MAX_TOKEN_NAME_LENGTH);
  const safeSymbol = normalizeTokenIdentity(symbol, MAX_TOKEN_SYMBOL_LENGTH);
  if (!safeName && !safeSymbol) return null;

  const identity =
    safeName &&
    safeSymbol &&
    safeName.toLocaleLowerCase("en-US") !==
      safeSymbol.toLocaleLowerCase("en-US")
      ? `${safeName} (${safeSymbol})`
      : (safeName ?? safeSymbol);

  return identity;
}

export function buildTokenSeoTitle(
  name: string | null | undefined,
  symbol: string | null | undefined,
) {
  const identity = buildTokenIdentityLabel(name, symbol);
  return identity ? `${identity} — BNBX` : null;
}

export function buildTokenShareImageAlt(
  name: string | null | undefined,
  symbol: string | null | undefined,
) {
  const identity = buildTokenIdentityLabel(name, symbol);
  return identity
    ? `${identity} — BNB Chain token project on BNBX`
    : "BNBX token project on BNB Chain";
}

export function buildTokenSeoDescription(
  name: string | null | undefined,
  symbol: string | null | undefined,
  language: Language = "zh",
) {
  const identity = buildTokenIdentityLabel(name, symbol);
  if (!identity) return null;

  const description = tokenDescriptionCopy[language](identity);
  const characters = [...description];
  return characters.length > MAX_META_DESCRIPTION_LENGTH
    ? `${characters.slice(0, MAX_META_DESCRIPTION_LENGTH - 1).join("")}…`
    : description;
}

export function buildTokenStructuredData(
  token: `0x${string}`,
  name: string | null | undefined,
  symbol: string | null | undefined,
) {
  const identity = buildTokenIdentityLabel(name, symbol);
  if (!identity) return null;

  const contractAddress = token.toLowerCase();
  const url = `${SITE_URL}/token/${contractAddress}`;

  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: identity,
    description: `${identity} 的 BNB Chain 代币项目页面与链上合约信息。`,
    url,
    mainEntityOfPage: url,
    sameAs: `https://bscscan.com/token/${contractAddress}`,
    category: "Cryptocurrency",
    identifier: [
      {
        "@type": "PropertyValue",
        propertyID: "contractAddress",
        value: contractAddress,
      },
      {
        "@type": "PropertyValue",
        propertyID: "blockchain",
        value: "BNB Chain",
      },
    ],
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

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
          alt: SHARE_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [
        {
          url: SHARE_IMAGE_PATH,
          alt: SHARE_IMAGE_ALT,
        },
      ],
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

export function buildTokenPageMetadata(
  path: string,
  name: string | null | undefined,
  symbol: string | null | undefined,
  language: Language = "zh",
): Metadata {
  const metadata = buildPageMetadata(path, language);
  const title = buildTokenSeoTitle(name, symbol);
  const description = buildTokenSeoDescription(name, symbol, language);
  if (!title || !description) return metadata;

  return {
    ...metadata,
    title,
    description,
    openGraph: {
      ...metadata.openGraph,
      title,
      description,
    },
    twitter: {
      ...metadata.twitter,
      title,
      description,
    },
  };
}
