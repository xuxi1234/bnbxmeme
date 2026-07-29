export type CommunityLinkKind =
  | "website"
  | "telegram"
  | "twitter"
  | "debox";

const MAX_LENGTH = 100;

const allowedHosts: Record<Exclude<CommunityLinkKind, "website">, RegExp> = {
  telegram: /(^|\.)t\.me$|(^|\.)telegram\.me$/i,
  twitter: /(^|\.)x\.com$|(^|\.)twitter\.com$/i,
  debox: /(^|\.)debox\.pro$/i,
};

function withServiceUrl(value: string, kind: CommunityLinkKind) {
  const trimmed = value.trim().slice(0, MAX_LENGTH);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  const handle = trimmed.replace(/^@/, "");
  const looksLikeUrl = handle.includes(".") || handle.includes("/");
  if (!looksLikeUrl && kind === "telegram") {
    return `https://t.me/${encodeURIComponent(handle)}`;
  }
  if (!looksLikeUrl && kind === "twitter") {
    return `https://x.com/${encodeURIComponent(handle)}`;
  }
  if (!looksLikeUrl && kind === "debox") {
    return `https://m.debox.pro/${encodeURIComponent(handle)}`;
  }
  return `https://${trimmed}`;
}

export function normalizeCommunityLink(
  value: string,
  kind: CommunityLinkKind,
) {
  const candidate = withServiceUrl(value, kind);
  if (!candidate) return "";
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("社区链接格式无效");
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new Error("社区链接必须使用有效的 HTTPS 地址");
  }
  if (kind !== "website" && !allowedHosts[kind].test(url.hostname)) {
    const service =
      kind === "telegram" ? "Telegram" : kind === "twitter" ? "X" : "DeBox";
    throw new Error(`${service} 栏只能填写对应平台的链接或用户名`);
  }
  return url.toString();
}

export function normalizeQQGroupNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\d{5,12}$/.test(trimmed)) {
    throw new Error("QQ群只能填写 5–12 位数字群号");
  }
  return trimmed;
}

export function validateCommunityLinks(values: {
  website: string;
  telegram: string;
  twitter: string;
  debox: string;
  qqGroupNumber: string;
}) {
  const normalized = {
    website: normalizeCommunityLink(values.website, "website"),
    telegram: normalizeCommunityLink(values.telegram, "telegram"),
    twitter: normalizeCommunityLink(values.twitter, "twitter"),
    debox: normalizeCommunityLink(values.debox, "debox"),
    qqGroupNumber: normalizeQQGroupNumber(values.qqGroupNumber),
  };
  const links = [
    normalized.website,
    normalized.telegram,
    normalized.twitter,
    normalized.debox,
  ].filter(Boolean);
  if (new Set(links.map((link) => link.toLowerCase())).size !== links.length) {
    throw new Error("不同社区栏目不能填写完全相同的链接");
  }
  return normalized;
}
