export const MAX_CHAIN_DATA_BACKFILL_BLOCKS = 20_000n;
export const CHAIN_DATA_CACHE_MAX_AGE_MS = 60_000;
export const CHAIN_DATA_REFRESH_LEASE_MS = 360_000;

export type ChainDataMode = "refresh" | "cache";
export type CacheTimestampState = "fresh" | "stale" | "leased";

export function normalizeChainDataMode(value: string | null): ChainDataMode {
  if (value === null || value === "") return "refresh";
  if (value === "cache") return "cache";
  throw new Error("Unsupported mode");
}

export function classifyCacheTimestamp(
  refreshedAt: string,
  now = Date.now(),
): CacheTimestampState {
  const timestamp = Date.parse(refreshedAt);
  if (!Number.isFinite(timestamp)) return "stale";
  if (timestamp > now) return "leased";
  return now - timestamp <= CHAIN_DATA_CACHE_MAX_AGE_MS ? "fresh" : "stale";
}
