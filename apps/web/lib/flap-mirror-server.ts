import {
  evaluateFlapMirrorWarnings,
  normalizeFlapCandidate,
  sortNewestFlapCandidates,
  type FlapBoardRecord,
  type FlapSecurity,
  type NormalizedFlapCandidate,
} from "./flap-mirror-core.ts";

const FLAP_API_BASE = "https://bnb.taxed.fun";
const GOPLUS_API = "https://api.gopluslabs.io/api/v1/token_security/56";
const DISCOVERY_CACHE_MS = 60_000;
const PREPARE_CACHE_MS = 60_000;
const FLAP_BOARD_PAGE_SIZE = 20;
const FLAP_BOARD_MAX_PAGES = 5;
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const FLAP_HEADERS = {
  Accept: "application/json",
  Origin: "https://flap.sh",
  Referer: "https://flap.sh/",
  "User-Agent": "Mozilla/5.0 (compatible; BNBX-Flap-Mirror/1.0)",
};

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FlapDetail = {
  address?: unknown;
  name?: unknown;
  symbol?: unknown;
  listed?: unknown;
  progress?: unknown;
  marketCap?: unknown;
  volume24h?: unknown;
  holdersCount?: unknown;
  liquidity?: unknown;
  createdAt?: unknown;
  tax?: FlapBoardRecord["tax"];
  vault?: unknown;
  metadata?: {
    image?: unknown;
    description?: unknown;
    website?: unknown;
    twitter?: unknown;
    telegram?: unknown;
  } | null;
};

export type FlapMirrorCandidate = NormalizedFlapCandidate & {
  eligible: true;
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
  const raw = text(value, 300);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function json(
  fetcher: Fetcher,
  url: string,
  label: string,
  init?: RequestInit,
) {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`${label} request failed: ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

function boardUrl(cursor: string) {
  const url = new URL(`${FLAP_API_BASE}/v3/board`);
  url.searchParams.set("listed", "true");
  url.searchParams.set("limit", String(FLAP_BOARD_PAGE_SIZE));
  url.searchParams.set("_refresh", "20260627");
  if (cursor) url.searchParams.set("cursor", cursor);
  return url.toString();
}

async function fetchBoardRows(fetcher: Fetcher) {
  const rows: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor = "";
  for (let page = 0; page < FLAP_BOARD_MAX_PAGES; page += 1) {
    const payload = await json(fetcher, boardUrl(cursor), "Flap board", {
      headers: FLAP_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const items = Array.isArray(payload.items) ? payload.items : [];
    rows.push(...items);
    const nextCursor = text(payload.nextCursor, 500);
    if (!nextCursor || items.length === 0 || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return rows;
}

function securityFor(
  payload: Record<string, unknown>,
  address: string,
): FlapSecurity | null {
  const result = payload.result;
  if (!result || typeof result !== "object") return null;
  const entries = result as Record<string, unknown>;
  const matched = Object.entries(entries).find(
    ([key]) => key.toLowerCase() === address.toLowerCase(),
  )?.[1];
  return matched && typeof matched === "object"
    ? (matched as FlapSecurity)
    : null;
}

function detailRecord(detail: FlapDetail): FlapBoardRecord {
  return {
    coin: {
      address: detail.address,
      name: detail.name,
      symbol: detail.symbol,
      image: detail.metadata?.image,
    },
    listed: detail.listed,
    progress: detail.progress,
    marketCap: detail.marketCap,
    volume24h: detail.volume24h,
    holders: detail.holdersCount,
    liquidity: detail.liquidity,
    createdAt: detail.createdAt,
    tax: detail.tax,
    vault: detail.vault,
  };
}

export async function discoverFlapMirrorsWith(fetcher: Fetcher) {
  const rows = await fetchBoardRows(fetcher);
  const normalized = rows
    .map((row) =>
      normalizeFlapCandidate(
        row && typeof row === "object" ? (row as FlapBoardRecord) : {},
      ),
    )
    .filter((candidate): candidate is NormalizedFlapCandidate => Boolean(candidate));
  const unique = Array.from(
    new Map(normalized.map((candidate) => [candidate.sourceAddress, candidate])).values(),
  );
  const candidates = sortNewestFlapCandidates(unique);
  if (candidates.length === 0) return [];

  const securityPayload = await json(
    fetcher,
    `${GOPLUS_API}?contract_addresses=${candidates
      .map((candidate) => candidate.sourceAddress)
      .join(",")}`,
    "GoPlus",
    { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
  ).catch(() => ({}));

  return candidates.map((candidate): FlapMirrorCandidate => ({
    ...candidate,
    eligible: true,
    reasons: [],
    warnings: evaluateFlapMirrorWarnings({
      liquidityUsd: candidate.liquidityUsd,
      volume24hUsd: candidate.volume24hUsd,
      holderCount: candidate.holderCount,
      security: securityFor(securityPayload, candidate.sourceAddress),
    }),
  }));
}

let discoveryCache:
  | { expiresAt: number; value: Promise<FlapMirrorCandidate[]> }
  | undefined;

export function discoverFlapMirrors() {
  const now = Date.now();
  if (discoveryCache && discoveryCache.expiresAt > now) {
    return discoveryCache.value;
  }
  const value = discoverFlapMirrorsWith(fetch);
  discoveryCache = { expiresAt: now + DISCOVERY_CACHE_MS, value };
  void value.catch(() => {
    discoveryCache = undefined;
  });
  return value;
}

async function fetchEligibleDetail(address: string, fetcher: Fetcher) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid Flap token address");
  }
  const sourceAddress = address.toLowerCase();
  const payload = await json(
    fetcher,
    `${FLAP_API_BASE}/v3/coin/${encodeURIComponent(sourceAddress)}?_refresh=20260627`,
    "Flap detail",
    {
      headers: FLAP_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  );
  const detail = payload as FlapDetail;
  const candidate = normalizeFlapCandidate(detailRecord(detail));
  if (!candidate || candidate.sourceAddress !== sourceAddress) {
    throw new Error("Source is not an eligible graduated Flap token");
  }
  return { detail, candidate };
}

export async function prepareFlapMirrorMetadataWith(
  address: string,
  dependencies: PrepareDependencies,
) {
  const { detail, candidate } = await fetchEligibleDetail(
    address,
    dependencies.fetcher,
  );
  const image = candidate.imageUrl
    ? await dependencies.pinImage(candidate.imageUrl)
    : "";
  const metadata = {
    name: candidate.name,
    symbol: candidate.symbol,
    description: text(detail.metadata?.description, 500),
    image,
    website: safeHttps(detail.metadata?.website) || candidate.sourceUrl,
    telegram: safeHttps(detail.metadata?.telegram),
    twitter: safeHttps(detail.metadata?.twitter),
    createdBy: "BNBX Flap Mirror",
    createdAt: new Date().toISOString(),
    chainId: 56,
    sourcePlatform: "Flap.sh",
    sourceContract: candidate.sourceAddress,
    sourceUrl: candidate.sourceUrl,
    mirrorDisclosure: "社区镜像 / 非原项目官方发行",
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
  if (!response.ok) throw new Error("Flap logo download failed");
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!IMAGE_TYPES.has(contentType)) throw new Error("Unsupported Flap logo type");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Flap logo exceeds 2MB");
  }
  if (!response.body) throw new Error("Flap logo returned no body");
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("Flap logo exceeds 2MB");
    }
    chunks.push(value.slice().buffer as ArrayBuffer);
  }
  const extension = contentType.split("/")[1] ?? "img";
  const form = new FormData();
  form.set("network", "public");
  form.set("name", `bnbx-flap-mirror-${Date.now()}.${extension}`);
  form.set("file", new File(chunks, `mirror.${extension}`, { type: contentType }));
  const upload = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!upload.ok) throw new Error("Flap logo IPFS upload failed");
  const result = (await upload.json()) as { data?: { cid?: string } };
  if (!result.data?.cid) throw new Error("Flap logo upload returned no CID");
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
      pinataMetadata: { name: `bnbx-flap-mirror-${String(metadata.symbol)}` },
      pinataContent: metadata,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Flap metadata IPFS upload failed");
  const result = (await response.json()) as { IpfsHash?: string };
  if (!result.IpfsHash) throw new Error("Flap metadata upload returned no CID");
  return `ipfs://${result.IpfsHash}`;
}

const prepareCache = new Map<
  string,
  {
    expiresAt: number;
    value: Promise<Awaited<ReturnType<typeof prepareFlapMirrorMetadataWith>>>;
  }
>();

export function prepareFlapMirrorMetadata(address: string) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("IPFS upload service is not configured");
  const normalizedAddress = address.toLowerCase();
  const now = Date.now();
  const cached = prepareCache.get(normalizedAddress);
  if (cached && cached.expiresAt > now) return cached.value;
  for (const [key, entry] of prepareCache) {
    if (entry.expiresAt <= now) prepareCache.delete(key);
  }
  const value = prepareFlapMirrorMetadataWith(normalizedAddress, {
    fetcher: fetch,
    pinImage: (imageUrl) => pinRemoteImage(imageUrl, jwt),
    pinJson: (metadata) => pinMetadata(metadata, jwt),
  });
  prepareCache.set(normalizedAddress, {
    expiresAt: now + PREPARE_CACHE_MS,
    value,
  });
  void value.catch(() => {
    if (prepareCache.get(normalizedAddress)?.value === value) {
      prepareCache.delete(normalizedAddress);
    }
  });
  return value;
}
