export type MetadataCommunityLinkField =
  | "website"
  | "telegram"
  | "twitter"
  | "debox";

export type MetadataCommunityLinks = Partial<
  Record<MetadataCommunityLinkField, string>
>;

const socialHosts: Record<
  Exclude<MetadataCommunityLinkField, "website">,
  readonly string[]
> = {
  telegram: ["t.me", "telegram.me"],
  twitter: ["x.com", "twitter.com"],
  debox: ["debox.pro"],
};

function isHostOrSubdomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function parseHttpsLink(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname.includes(".") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isPlatformPlaceholder(url: URL) {
  return isHostOrSubdomain(url.hostname.toLowerCase(), "bnbx.meme");
}

function sanitizeSocialLink(
  value: unknown,
  field: Exclude<MetadataCommunityLinkField, "website">,
) {
  const url = parseHttpsLink(value);
  if (!url || isPlatformPlaceholder(url)) return undefined;
  const hostname = url.hostname.toLowerCase();
  if (!socialHosts[field].some((host) => isHostOrSubdomain(hostname, host))) {
    return undefined;
  }
  if (!url.pathname.split("/").some(Boolean)) return undefined;
  return url.toString();
}

function duplicateKey(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString().toLowerCase();
}

export function sanitizeMetadataCommunityLinks(values: {
  website?: unknown;
  telegram?: unknown;
  twitter?: unknown;
  debox?: unknown;
}): MetadataCommunityLinks {
  const websiteUrl = parseHttpsLink(values.website);
  const links: MetadataCommunityLinks = {
    website:
      websiteUrl && !isPlatformPlaceholder(websiteUrl)
        ? websiteUrl.toString()
        : undefined,
    telegram: sanitizeSocialLink(values.telegram, "telegram"),
    twitter: sanitizeSocialLink(values.twitter, "twitter"),
    debox: sanitizeSocialLink(values.debox, "debox"),
  };

  if (links.website) {
    const websiteKey = duplicateKey(links.website);
    const duplicatesSocialLink = (
      ["telegram", "twitter", "debox"] as const
    ).some(
      (field) =>
        links[field] !== undefined &&
        duplicateKey(links[field]) === websiteKey,
    );
    if (duplicatesSocialLink) links.website = undefined;
  }

  return links;
}
