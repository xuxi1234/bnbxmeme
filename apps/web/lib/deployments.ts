export const legacyStandardFactoryAddress =
  "0xdb189396ae2a350c484ddd749a6af96baebc124b" as const;

export const legacyAutoLiquidityFactoryAddress =
  "0x9f572dc9d582ec8347d2a803f766652982220539" as const;

export const legacyRewardsFactoryAddress =
  "0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8" as const;

// V3 holder/LP rewards Factory deployed by the authorized platform wallet.
// Its constructor values and one-time manager binding are immutable chain
// facts, so this fallback also protects production from a stale V2 env value.
export const v3RewardsFactoryAddress =
  "0xef95ead95292408090e61112580f62e4d556c550" as const;

// V3 Standard 0-tax Factory deployed by the authorized platform wallet. Its
// constructor values are immutable chain facts, so this fallback also protects
// production from an empty or stale V1 environment variable.
const deployedV3StandardFactoryAddress =
  "0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d" as const;

const configuredStandardFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as `0x${string}` | undefined;

export const v3StandardFactoryAddress =
  configuredStandardFactoryAddress?.toLowerCase() ===
  legacyStandardFactoryAddress.toLowerCase()
    ? deployedV3StandardFactoryAddress
    : (configuredStandardFactoryAddress ?? deployedV3StandardFactoryAddress);

export const standardFactoryAddress =
  v3StandardFactoryAddress ?? legacyStandardFactoryAddress;

export const autoLiquidityFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS as
    `0x${string}` | undefined) ?? legacyAutoLiquidityFactoryAddress;

const configuredRewardsFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS as `0x${string}` | undefined;

// The legacy rewards Factory is intentionally read-only. New advanced
// creation stays disabled until a distinct V3 address is configured.
export const rewardsFactoryAddress =
  configuredRewardsFactoryAddress?.toLowerCase() ===
  legacyRewardsFactoryAddress.toLowerCase()
    ? v3RewardsFactoryAddress
    : (configuredRewardsFactoryAddress ?? v3RewardsFactoryAddress);

export const officialFactoryAddresses = Array.from(
  new Set<`0x${string}`>([
    standardFactoryAddress,
    ...(rewardsFactoryAddress ? [rewardsFactoryAddress] : []),
    legacyStandardFactoryAddress,
    legacyAutoLiquidityFactoryAddress,
    legacyRewardsFactoryAddress,
  ]),
);

export const blockExplorerUrl = "https://bscscan.com";

export const lpBurnAddress =
  "0x000000000000000000000000000000000000dEaD" as const;

export const pancakeRouterAddress =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;

export const pancakeFactoryAddress =
  "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as const;
