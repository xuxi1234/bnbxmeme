export const FLAP_MIRROR_MIN_LIQUIDITY_USD = 3_000;
export const FLAP_MIRROR_MIN_VOLUME_24H_USD = 5_000;
export const FLAP_MIRROR_MIN_HOLDERS = 30;
export const FLAP_MIRROR_LIMIT = 20;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const IPFS_GATEWAY = "https://flap.mypinata.cloud/ipfs/";
const SECURITY_WARNING_FIELDS = [
  "is_honeypot",
  "cannot_buy",
  "cannot_sell_all",
  "is_mintable",
  "is_blacklisted",
  "hidden_owner",
  "is_proxy",
  "selfdestruct",
  "transfer_pausable",
  "external_call",
] as const;

export type FlapBoardRecord = {
  coin?: {
    address?: unknown;
    name?: unknown;
    symbol?: unknown;
    image?: unknown;
  } | null;
  listed?: unknown;
  progress?: unknown;
  marketCap?: unknown;
  volume24h?: unknown;
  holders?: unknown;
  liquidity?: unknown;
  createdAt?: unknown;
  tax?: {
    hasTax?: unknown;
    buyTaxBps?: unknown;
    sellTaxBps?: unknown;
  } | null;
  vault?: unknown;
};

export type NormalizedFlapCandidate = {
  sourceAddress: `0x${string}`;
  name: string;
  symbol: string;
  imageUrl: string;
  sourceUrl: string;
  createdAt: string | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  holderCount: number | null;
  liquidityUsd: number | null;
  buyTaxPercent: number | null;
  sellTaxPercent: number | null;
  graduationTargetBNB: number;
};

export type FlapSecurity = Record<string, unknown>;

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function taxPercent(hasTax: unknown, basisPoints: unknown) {
  if (hasTax === false) return 0;
  const value = optionalNonNegativeNumber(basisPoints);
  return value === null ? null : value / 100;
}

function isGraduatedProgress(value: unknown) {
  return value === 100 || (typeof value === "string" && /^100\.0+$/.test(value));
}

function normalizedCreatedAt(value: unknown) {
  const numeric = finiteNumber(value);
  if (numeric <= 0) return null;
  const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ipfsImage(value: unknown) {
  const raw = cleanText(value, 500);
  if (!raw) return "";
  const cid = raw.startsWith("ipfs://")
    ? raw.slice(7)
    : raw.startsWith(IPFS_GATEWAY)
      ? raw.slice(IPFS_GATEWAY.length)
      : /^[A-Za-z0-9]+$/.test(raw)
        ? raw
        : "";
  return cid && /^[A-Za-z0-9]+$/.test(cid) ? `${IPFS_GATEWAY}${cid}` : "";
}

export function stableFlapGraduationTarget(address: string) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error("Invalid Flap token address");
  }
  let total = 0;
  for (let index = 0; index < hex.length; index += 2) {
    total = (total + Number.parseInt(hex.slice(index, index + 2), 16)) % 18;
  }
  return total + 1;
}

export function normalizeFlapCandidate(
  record: FlapBoardRecord,
): NormalizedFlapCandidate | null {
  if (record.listed !== true || !isGraduatedProgress(record.progress)) return null;
  if (record.vault !== null) return null;
  const rawAddress = cleanText(record.coin?.address, 42);
  if (!ADDRESS_PATTERN.test(rawAddress)) return null;
  const sourceAddress = rawAddress.toLowerCase() as `0x${string}`;
  const name = cleanText(record.coin?.name, 40);
  const symbol = cleanText(record.coin?.symbol, 10);
  if (!name || !symbol) return null;
  const holders = optionalNonNegativeNumber(record.holders);

  return {
    sourceAddress,
    name,
    symbol,
    imageUrl: ipfsImage(record.coin?.image),
    sourceUrl: `https://flap.sh/bnb/${sourceAddress}`,
    createdAt: normalizedCreatedAt(record.createdAt),
    marketCapUsd: optionalNonNegativeNumber(record.marketCap),
    volume24hUsd: optionalNonNegativeNumber(record.volume24h),
    holderCount: holders === null ? null : Math.floor(holders),
    liquidityUsd: optionalNonNegativeNumber(record.liquidity),
    buyTaxPercent: taxPercent(record.tax?.hasTax, record.tax?.buyTaxBps),
    sellTaxPercent: taxPercent(record.tax?.hasTax, record.tax?.sellTaxBps),
    graduationTargetBNB: stableFlapGraduationTarget(sourceAddress),
  };
}

export function sortNewestFlapCandidates<T extends { createdAt: string | null }>(
  candidates: readonly T[],
) {
  return [...candidates]
    .sort((left, right) => {
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      return rightTime - leftTime;
    })
    .slice(0, FLAP_MIRROR_LIMIT);
}

export function evaluateFlapMirrorWarnings({
  liquidityUsd,
  volume24hUsd,
  holderCount,
  security,
}: {
  liquidityUsd: unknown;
  volume24hUsd: unknown;
  holderCount: unknown;
  security: FlapSecurity | null;
}) {
  const warnings: string[] = [];
  if (finiteNumber(liquidityUsd) < FLAP_MIRROR_MIN_LIQUIDITY_USD) {
    warnings.push("liquidity");
  }
  if (finiteNumber(volume24hUsd) < FLAP_MIRROR_MIN_VOLUME_24H_USD) {
    warnings.push("volume24h");
  }
  if (finiteNumber(holderCount) < FLAP_MIRROR_MIN_HOLDERS) {
    warnings.push("holders");
  }
  if (!security) return [...warnings, "security-unavailable"];
  if (security.is_open_source !== "1") warnings.push("not-open-source");
  for (const field of SECURITY_WARNING_FIELDS) {
    if (security[field] === "1") warnings.push(field);
  }
  return warnings;
}
