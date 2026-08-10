import { CHAIN_DATA_REFRESH_LEASE_MS } from "./chain-data-cost-policy.ts";

export type RefreshLeaseCheckpoint = {
  latestBlock: string;
  refreshedAt: string;
};

export function buildRefreshLeaseFilters(
  checkpoint: RefreshLeaseCheckpoint,
) {
  return {
    latest_block: `eq.${checkpoint.latestBlock}`,
    refreshed_at: `eq.${checkpoint.refreshedAt}`,
  };
}

export function canAttemptRefreshLease(
  refreshedAt: string,
  now = Date.now(),
) {
  const timestamp = Date.parse(refreshedAt);
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function buildClaimedRefreshTimestamp(now = Date.now()) {
  return new Date(now + CHAIN_DATA_REFRESH_LEASE_MS).toISOString();
}
