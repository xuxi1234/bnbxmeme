const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const PUBLIC_QUOTE_CHAIN_ID = 56 as const;

export function publicQuoteReadConfig({
  curveAddress,
  amountWei,
}: {
  curveAddress: `0x${string}`;
  amountWei: bigint;
}) {
  return {
    chainId: PUBLIC_QUOTE_CHAIN_ID,
    enabled: curveAddress.toLowerCase() !== ZERO_ADDRESS && amountWei > 0n,
  } as const;
}
