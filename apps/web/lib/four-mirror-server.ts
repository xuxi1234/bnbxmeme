import {
  evaluateMirrorEligibility,
  FOUR_MIRROR_MIN_LIQUIDITY_USD,
  FOUR_MIRROR_MIN_VOLUME_24H_USD,
  mirrorMetric,
  normalizeFourCandidate,
  selectPancakePair,
  stableGraduationTarget,
  type FourSearchCandidate,
  type MirrorSecurity,
  type NormalizedFourCandidate,
} from "./four-mirror-core.ts";

const FOUR_API_BASE = "https://four.meme/meme-api/v1";
const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/tokens";
const GOPLUS_API = "https://api.gopluslabs.io/api/v1/token_security/56";
const DISCOVERY_CACHE_MS = 60_000;
const MAX_DISCOVERY_CANDIDATES = 20;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FourDetail = {
  address?: unknown;
  image?: unknown;
  name?: unknown;
  shortName?: unknown;
  descr?: unknown;
  telegramUrl?: unknown;
  twitterUrl?: unknown;
  status?: unknown;
  createDate?: unknown;
};

export type FourMirrorCandidate = NormalizedFourCandidate & {
  description: string;
  telegram: string;
  twitter: string;
  graduationTargetBNB: number;
  liquidityUsd: number;
  volume24hUsd: number;
  holderCount: number;
  pairUrl: string;
  eligible: boolean;
  reasons: string[];
  warnings: string[];
};

type PrepareDependencies = {
  fetcher: Fetcher;
  pinImage: (imageUrl: string) => Promise<string>;
  pinJson: (metadata: Record<string, unknown>) => Promise<string>;
};

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeHttps(value: unknown) {
  const raw = text(value, 200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function json(fetcher: Fetcher, url: string, init?: RequestInit) {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`Upstream request failed: ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

function securityFor(
  payload: Record<string, unknown>,
  address: string,
): MirrorSecurity | null {
  const result = payload.result;
  if (!result || typeof result !== "object") return null;
  const entries = result as Record<string, unknown>;
  const direct = entries[address.toLowerCase()];
  if (direct && typeof direct === "object") return direct as MirrorSecurity;
  const matched = Object.entries(entries).find(
    ([key]) => key.toLowerCase() === address.toLowerCase(),
  )?.[1];
  return matched && typeof matched === "object"
    ? (matched as MirrorSecurity)
    : null;
}

function detailCandidate(detail: FourDetail) {
  return normalizeFourCandidate({
    tokenAddress: detail.address,
    name: detail.name,
    shortName: detail.shortName,
    img: detail.image,
    createDate: detail.createDate,
  });
}

async function enrichCandidate(
  base: NormalizedFourCandidate,
  fetcher: Fetcher,
): Promise<FourMirrorCandidate> {
  try {
    const detailUrl = `${FOUR_API_BASE}/private/token/get/v2?address=${encodeURIComponent(base.sourceAddress)}`;
    const dexUrl = `${DEXSCREENER_API}/${base.sourceAddress}`;
    const securityUrl = `${GOPLUS_API}?contract_addresses=${base.sourceAddress}`;
    const [detailPayload, dexPayload, securityPayload] = await Promise.all([
      json(fetcher, detailUrl),
      json(fetcher, dexUrl),
      json(fetcher, securityUrl),
    ]);
    return assembleCandidate(base, detailPayload, dexPayload, securityPayload);
  } catch {
    return unavailableCandidate(base);
  }
}

function unavailableCandidate(base: NormalizedFourCandidate): FourMirrorCandidate {
  return {
    ...base,
    description: "",
    telegram: "",
    twitter: "",
    graduationTargetBNB: stableGraduationTarget(base.sourceAddress),
    liquidityUsd: 0,
    volume24hUsd: 0,
    holderCount: 0,
    pairUrl: "",
    eligible: true,
    reasons: [],
    warnings: ["security-unavailable"],
  };
}

function assembleCandidate(
  base: NormalizedFourCandidate,
  detailPayload: Record<string, unknown> | null,
  dexPayload: Record<string, unknown>,
  securityPayload: Record<string, unknown>,
): FourMirrorCandidate {
  const detail =
    detailPayload?.data && typeof detailPayload.data === "object"
      ? (detailPayload.data as FourDetail)
      : null;
  if (!detail || detail.status !== "TRADE") {
    return unavailableCandidate(base);
  }
  const normalizedDetail = detailCandidate(detail);
  if (!normalizedDetail || normalizedDetail.sourceAddress !== base.sourceAddress) {
    return unavailableCandidate(base);
  }
  const pair = selectPancakePair(dexPayload.pairs, base.sourceAddress);
  const security = securityFor(securityPayload, base.sourceAddress);
  const liquidityUsd = mirrorMetric(pair?.liquidity?.usd);
  const volume24hUsd = mirrorMetric(pair?.volume?.h24);
  const holderCount = mirrorMetric(security?.holder_count);
  const eligibility = evaluateMirrorEligibility({
    liquidityUsd,
    volume24hUsd,
    security,
  });

  return {
    ...normalizedDetail,
    description: text(detail.descr, 500),
    telegram: safeHttps(detail.telegramUrl),
    twitter: safeHttps(detail.twitterUrl),
    graduationTargetBNB: stableGraduationTarget(base.sourceAddress),
    liquidityUsd,
    volume24hUsd,
    holderCount,
    pairUrl: safeHttps(pair?.url),
    ...eligibility,
  };
}

export async function discoverFourMirrorsWith(
  fetcher: Fetcher,
  { securityDelayMs = 0 }: { securityDelayMs?: number } = {},
) {
  const searchPayload = await json(fetcher, `${FOUR_API_BASE}/public/token/search`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "NEW",
      listType: "NOR_DEX",
      pageIndex: 1,
      pageSize: 30,
      status: "TRADE",
      sort: "DESC",
    }),
  });
  const rows = Array.isArray(searchPayload.data) ? searchPayload.data : [];
  const candidates = rows
    .map((row) =>
      normalizeFourCandidate(
        row && typeof row === "object" ? (row as FourSearchCandidate) : {},
      ),
    )
    .filter((candidate): candidate is NormalizedFourCandidate => Boolean(candidate))
    .slice(0, MAX_DISCOVERY_CANDIDATES);

  if (candidates.length === 0) return [];
  const addresses = candidates.map((candidate) => candidate.sourceAddress).join(",");
  const [details, dexPayload] = await Promise.all([
    Promise.all(
      candidates.map((candidate) =>
        json(
          fetcher,
          `${FOUR_API_BASE}/private/token/get/v2?address=${encodeURIComponent(candidate.sourceAddress)}`,
        ).catch(() => null),
      ),
    ),
    json(fetcher, `${DEXSCREENER_API}/${addresses}`).catch(
      () => ({} as Record<string, unknown>),
    ),
  ]);
  const qualifyingAddresses = candidates
    .filter((candidate) => {
      const pair = selectPancakePair(dexPayload.pairs, candidate.sourceAddress);
      return (
        mirrorMetric(pair?.liquidity?.usd) >= FOUR_MIRROR_MIN_LIQUIDITY_USD &&
        mirrorMetric(pair?.volume?.h24) >= FOUR_MIRROR_MIN_VOLUME_24H_USD
      );
    })
    .map((candidate) => candidate.sourceAddress);
  const combinedSecurity: Record<string, unknown> = {};
  for (const [index, sourceAddress] of qualifyingAddresses.entries()) {
    if (index > 0 && securityDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, securityDelayMs));
    }
    const payload = await json(
      fetcher,
      `${GOPLUS_API}?contract_addresses=${sourceAddress}`,
    ).catch(() => ({}));
    const security = securityFor(payload, sourceAddress);
    if (security) combinedSecurity[sourceAddress] = security;
  }
  const securityPayload = { result: combinedSecurity };
  return candidates.map((candidate, index) =>
    assembleCandidate(candidate, details[index], dexPayload, securityPayload),
  );
}

let discoveryCache:
  | { expiresAt: number; value: Promise<FourMirrorCandidate[]> }
  | undefined;

export function discoverFourMirrors() {
  const now = Date.now();
  if (discoveryCache && discoveryCache.expiresAt > now) {
    return discoveryCache.value;
  }
  const value = discoverFourMirrorsWith(fetch, { securityDelayMs: 400 });
  discoveryCache = { expiresAt: now + DISCOVERY_CACHE_MS, value };
  void value.catch(() => {
    discoveryCache = undefined;
  });
  return value;
}

async function fetchEligibleMirror(address: string, fetcher: Fetcher) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid Four token address");
  }
  const sourceAddress = address.toLowerCase() as `0x${string}`;
  const detailPayload = await json(
    fetcher,
    `${FOUR_API_BASE}/private/token/get/v2?address=${encodeURIComponent(sourceAddress)}`,
  );
  const detail =
    detailPayload.data && typeof detailPayload.data === "object"
      ? (detailPayload.data as FourDetail)
      : null;
  if (!detail || detail.status !== "TRADE") {
    throw new Error("Four token is not graduated");
  }
  const normalized = detailCandidate(detail);
  if (!normalized || normalized.sourceAddress !== sourceAddress) {
    throw new Error("Four detail identity mismatch");
  }
  return enrichCandidate(normalized, fetcher);
}

export async function prepareFourMirrorMetadataWith(
  address: string,
  dependencies: PrepareDependencies,
) {
  const candidate = await fetchEligibleMirror(address, dependencies.fetcher);
  const image = candidate.imageUrl
    ? await dependencies.pinImage(candidate.imageUrl)
    : "";
  const disclosure = "社区镜像 / 非原项目官方发行";
  const sourceStatement = `原始 Four.meme 合约：${candidate.sourceAddress}`;
  const description = [disclosure, sourceStatement, candidate.description]
    .filter(Boolean)
    .join("。")
    .slice(0, 500);
  const metadata = {
    name: candidate.name,
    symbol: candidate.symbol,
    description,
    image,
    website: candidate.sourceUrl,
    telegram: candidate.telegram,
    twitter: candidate.twitter,
    createdBy: "BNBX Four Mirror",
    createdAt: new Date().toISOString(),
    chainId: 56,
    sourcePlatform: "Four.meme",
    sourceContract: candidate.sourceAddress,
    sourceUrl: candidate.sourceUrl,
    mirrorDisclosure: disclosure,
  };
  const metadataURI = await dependencies.pinJson(metadata);
  return {
    metadataURI,
    name: candidate.name,
    symbol: candidate.symbol,
    graduationTargetBNB: candidate.graduationTargetBNB,
  };
}

async function pinRemoteImage(imageUrl: string, jwt: string) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Four logo download failed");
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!IMAGE_TYPES.has(contentType)) throw new Error("Unsupported Four logo type");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Four logo exceeds 2MB");
  const extension = contentType.split("/")[1] ?? "img";
  const form = new FormData();
  form.set("network", "public");
  form.set("name", `bnbx-four-mirror-${Date.now()}.${extension}`);
  form.set("file", new File([bytes], `mirror.${extension}`, { type: contentType }));
  const upload = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!upload.ok) throw new Error("Four logo IPFS upload failed");
  const result = (await upload.json()) as { data?: { cid?: string } };
  if (!result.data?.cid) throw new Error("Four logo upload returned no CID");
  return `ipfs://${result.data.cid}`;
}

async function pinMetadata(metadata: Record<string, unknown>, jwt: string) {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: `bnbx-four-mirror-${String(metadata.symbol)}` },
      pinataContent: metadata,
    }),
  });
  if (!response.ok) throw new Error("Four metadata IPFS upload failed");
  const result = (await response.json()) as { IpfsHash?: string };
  if (!result.IpfsHash) throw new Error("Four metadata upload returned no CID");
  return `ipfs://${result.IpfsHash}`;
}

export function prepareFourMirrorMetadata(address: string) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("IPFS upload service is not configured");
  return prepareFourMirrorMetadataWith(address, {
    fetcher: fetch,
    pinImage: (imageUrl) => pinRemoteImage(imageUrl, jwt),
    pinJson: (metadata) => pinMetadata(metadata, jwt),
  });
}
