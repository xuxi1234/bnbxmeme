export const standardFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined) ?? "0xdb189396ae2a350c484ddd749a6af96baebc124b";

export const autoLiquidityFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined) ?? "0x9f572dc9d582ec8347d2a803f766652982220539";

export const rewardsFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS as
    | `0x${string}`
    | undefined) ?? "0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8";

export const officialFactoryAddresses = [
  standardFactoryAddress,
  autoLiquidityFactoryAddress,
  rewardsFactoryAddress,
] as const;

export const blockExplorerUrl = "https://bscscan.com";

export const lpBurnAddress =
  "0x000000000000000000000000000000000000dEaD" as const;

export const pancakeRouterAddress =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
