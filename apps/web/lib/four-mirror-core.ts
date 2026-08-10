export const FOUR_MIRROR_MIN_LIQUIDITY_USD = 10_000;
export const FOUR_MIRROR_MIN_VOLUME_24H_USD = 20_000;
export const FOUR_MIRROR_MIN_HOLDERS = 100;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BLOCKING_SECURITY_FIELDS = [
  "is_honeypot",
  "is_mintable",
  "is_blacklisted",
  "cannot_buy",
  "cannot_sell_all",
  "hidden_owner",
  "is_proxy",
  "selfdestruct",
  "transfer_pausable",
  "external_call",
] as const;

export type FourSearchCandidate = {
  tokenAddress?: unknown;
  name?: unknown;
  shortName?: unknown;
  img?: unknown;
  createDate?: unknown;
};

export type NormalizedFourCandidate = {
  sourceAddress: `0x${string}`;
  name: string;
  symbol: string;
  imageUrl: string;
  sourceUrl: string;
  createdAt: string | null;
};

export type MirrorSecurity = Record<string, unknown>;

export type DexPair = {
  chainId?: unknown;
  dexId?: unknown;
  pairAddress?: unknown;
  url?: unknown;
  liquidity?: { usd?: unknown } | null;
  volume?: { h24?: unknown } | null;
  baseToken?: { address?: unknown } | null;
};

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeFourCandidate(
  source: FourSearchCandidate,
): NormalizedFourCandidate | null {
  const rawAddress = cleanText(source.tokenAddress, 42);
  if (!ADDRESS_PATTERN.test(rawAddress)) return null;
  const sourceAddress = rawAddress.toLowerCase() as `0x${string}`;
  const name = cleanText(source.name, 40);
  const symbol = cleanText(source.shortName, 10);
  if (!name || !symbol) return null;

  const rawImage = cleanText(source.img, 500);
  const imageUrl = rawImage.startsWith("/")
    ? `https://static.four.meme${rawImage}`
    : rawImage.startsWith("https://")
      ? rawImage
      : "";
  const createdTime = finiteNumber(source.createDate);

  return {
    sourceAddress,
    name,
    symbol,
    imageUrl,
    sourceUrl: `https://four.meme/token/${sourceAddress}`,
    createdAt: createdTime > 0 ? new Date(createdTime).toISOString() : null,
  };
}

export function stableGraduationTarget(address: string) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error("Invalid Four token address");
  }
  let total = 0;
  for (let index = 0; index < hex.length; index += 2) {
    total = (total + Number.parseInt(hex.slice(index, index + 2), 16)) % 18;
  }
  return total + 1;
}

export function selectPancakePair(
  pairs: unknown,
  tokenAddress?: string,
): DexPair | null {
  if (!Array.isArray(pairs)) return null;
  return (
    pairs
      .filter((pair): pair is DexPair => {
        if (!pair || typeof pair !== "object") return false;
        const candidate = pair as DexPair;
        const matchesToken =
          !tokenAddress ||
          (typeof candidate.baseToken?.address === "string" &&
            candidate.baseToken.address.toLowerCase() === tokenAddress.toLowerCase());
        return (
          candidate.chainId === "bsc" &&
          candidate.dexId === "pancakeswap" &&
          matchesToken
        );
      })
      .sort(
        (left, right) =>
          finiteNumber(right.liquidity?.usd) -
          finiteNumber(left.liquidity?.usd),
      )[0] ?? null
  );
}

export function evaluateMirrorEligibility({
  liquidityUsd,
  volume24hUsd,
  security,
}: {
  liquidityUsd: unknown;
  volume24hUsd: unknown;
  security: MirrorSecurity | null;
}) {
  const reasons: string[] = [];
  if (finiteNumber(liquidityUsd) < FOUR_MIRROR_MIN_LIQUIDITY_USD) {
    reasons.push("liquidity");
  }
  if (finiteNumber(volume24hUsd) < FOUR_MIRROR_MIN_VOLUME_24H_USD) {
    reasons.push("volume24h");
  }
  if (!security) {
    reasons.push("security-unavailable");
    return { eligible: false, reasons };
  }
  if (finiteNumber(security.holder_count) < FOUR_MIRROR_MIN_HOLDERS) {
    reasons.push("holders");
  }
  if (security.is_open_source !== "1") reasons.push("not-open-source");
  for (const field of BLOCKING_SECURITY_FIELDS) {
    if (security[field] === "1") reasons.push(field);
  }
  return { eligible: reasons.length === 0, reasons };
}

export function mirrorMetric(value: unknown) {
  return finiteNumber(value);
}
