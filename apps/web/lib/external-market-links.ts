type Address = `0x${string}`;

export function buildExternalMarketLinks(
  tokenAddress: Address,
  pairAddress?: Address,
) {
  return {
    ave: `https://ave.ai/token/${tokenAddress}-bsc`,
    dexScreener: `https://dexscreener.com/bsc/${pairAddress ?? tokenAddress}`,
    dexTools: pairAddress
      ? `https://www.dextools.io/app/en/bnb/pair-explorer/${pairAddress}`
      : null,
    coinMarketCap: `https://dex.coinmarketcap.com/token/BSC/${tokenAddress}/`,
    gmgn: `https://gmgn.ai/bsc/token/bnbxmeme_${tokenAddress}`,
  };
}
