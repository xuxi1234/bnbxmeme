type Address = `0x${string}`;

export type TradeDestination = "loading" | "curve" | "migrating" | "pancake";

export function resolveTradeDestination(curveState?: number) {
  if (curveState === 0) return "curve" as const;
  if (curveState === 1) return "migrating" as const;
  if (curveState === 2) return "pancake" as const;
  return "loading" as const;
}

export function buildPancakeSwapTradeLinks(tokenAddress: Address) {
  const base = "https://pancakeswap.finance/swap?chain=bsc";
  return {
    buy: `${base}&inputCurrency=BNB&outputCurrency=${tokenAddress}`,
    sell: `${base}&inputCurrency=${tokenAddress}&outputCurrency=BNB`,
  } as const;
}
