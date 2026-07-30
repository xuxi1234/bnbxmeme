export type CommunityLinkKind =
  | "website"
  | "telegram"
  | "twitter"
  | "debox";

export type CommunityLinkField = CommunityLinkKind | "qqGroupNumber";

export type CommunityLinkValues = {
  website: string;
  telegram: string;
  twitter: string;
  debox: string;
  qqGroupNumber: string;
};

type NormalizedCommunityLinks = CommunityLinkValues;

const MAX_LENGTH = 100;
const fieldOrder: CommunityLinkField[] = [
  "website",
  "telegram",
  "twitter",
  "debox",
  "qqGroupNumber",
];

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
  if (
    kind === "website" &&
    (!url.hostname.includes(".") || url.username || url.password)
  ) {
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

function inspectCommunityLinks(values: CommunityLinkValues) {
  const normalized: NormalizedCommunityLinks = {
    website: "",
    telegram: "",
    twitter: "",
    debox: "",
    qqGroupNumber: "",
  };
  const errors: Partial<Record<CommunityLinkField, string>> = {};

  for (const kind of ["website", "telegram", "twitter", "debox"] as const) {
    try {
      normalized[kind] = normalizeCommunityLink(values[kind], kind);
    } catch (error) {
      errors[kind] =
        error instanceof Error ? error.message : "社区链接格式无效";
    }
  }
  try {
    normalized.qqGroupNumber = normalizeQQGroupNumber(values.qqGroupNumber);
  } catch (error) {
    errors.qqGroupNumber =
      error instanceof Error ? error.message : "社区链接格式无效";
  }

  const firstFieldByLink = new Map<string, CommunityLinkKind>();
  for (const field of [
    "website",
    "telegram",
    "twitter",
    "debox",
  ] as const) {
    const link = normalized[field].toLowerCase();
    if (!link) continue;
    const firstField = firstFieldByLink.get(link);
    if (firstField) {
      const message = "不同社区栏目不能填写完全相同的链接";
      errors[firstField] = message;
      errors[field] = message;
    } else {
      firstFieldByLink.set(link, field);
    }
  }

  return { normalized, errors };
}

export function getCommunityLinkErrors(values: CommunityLinkValues) {
  return inspectCommunityLinks(values).errors;
}

export function validateCommunityLinks(values: CommunityLinkValues) {
  const { normalized, errors } = inspectCommunityLinks(values);
  const firstError = fieldOrder
    .map((field) => errors[field])
    .find((message): message is string => Boolean(message));
  if (firstError) throw new Error(firstError);
  return normalized;
}
