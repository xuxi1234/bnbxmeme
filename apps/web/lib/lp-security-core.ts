const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type LpBurnStatus = "pending" | "burned" | "missing" | "unknown";

export function resolveLpBurnStatus({
  curveState,
  pair,
  burnBalance,
}: {
  curveState: number | null | undefined;
  pair: `0x${string}` | null | undefined;
  burnBalance: bigint | null | undefined;
}): LpBurnStatus {
  if (curveState === 0 || curveState === 1) return "pending";
  if (
    curveState !== 2 ||
    !pair ||
    pair.toLowerCase() === ZERO_ADDRESS ||
    burnBalance == null
  ) {
    return "unknown";
  }
  return burnBalance > 0n ? "burned" : "missing";
}
