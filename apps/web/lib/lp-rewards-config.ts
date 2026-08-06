import { zeroAddress, type Hex } from "viem";

type TaxSide = {
  burn: string;
  liquidity: string;
  marketing: string;
  rewards: string;
};

function taxSideToBps(side: TaxSide) {
  const parse = (value: string) => {
    const normalized = value.trim();
    if (!/^(?:\d+|\d*\.\d{1,2})$/.test(normalized)) {
      throw new Error("Tax fields must be non-negative numbers");
    }
    const percentage = Number(normalized);
    if (!Number.isFinite(percentage) || percentage < 0) {
      throw new Error("Tax fields must be non-negative numbers");
    }
    return Math.round(percentage * 100);
  };
  return {
    liquidity: parse(side.liquidity),
    rewards: parse(side.rewards),
    burn: parse(side.burn),
  };
}

export function lpRewardTokenAddress(value: string) {
  const normalized = value.trim();
  return normalized === "" ? zeroAddress : normalized;
}

export function buildLPRewardsCreateRequest({
  name,
  symbol,
  graduationTargetBNB,
  metadataURI,
  vanitySalt,
  rewardToken,
  buyTaxes,
  sellTaxes,
}: {
  name: string;
  symbol: string;
  graduationTargetBNB: number;
  metadataURI: string;
  vanitySalt: Hex;
  rewardToken: string;
  buyTaxes: TaxSide;
  sellTaxes: TaxSide;
}) {
  return {
    name: name.trim(),
    symbol: symbol.trim(),
    graduationTargetBNB,
    metadataURI,
    vanitySalt,
    rewardToken: lpRewardTokenAddress(rewardToken),
    taxes: {
      buy: taxSideToBps(buyTaxes),
      sell: taxSideToBps(sellTaxes),
    },
  } as const;
}
