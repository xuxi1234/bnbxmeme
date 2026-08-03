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

// Audited V4 holder/LP rewards Factory. The advanced deployer's immutable
// one-time manager binding points to this address on BSC mainnet.
export const v4RewardsFactoryAddress =
  "0xe4aaf8066bf1063cfd73dc9a784598dffa412014" as const;

// V3 Standard 0-tax Factory deployed by the authorized platform wallet. Its
// constructor values are immutable chain facts, so this fallback also protects
// production from an empty or stale V1 environment variable.
const deployedV3StandardFactoryAddress =
  "0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d" as const;

// Audited V4 Standard 0-tax Factory deployed by the authorized platform
// wallet with the production fee recipient and Pancake V2 Router.
export const v4StandardFactoryAddress =
  "0x6012aa2eb5164c8ed31f2a01950c3b5037211181" as const;

const configuredStandardFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as `0x${string}` | undefined;

export const v3StandardFactoryAddress =
  configuredStandardFactoryAddress &&
  ![
    legacyStandardFactoryAddress.toLowerCase(),
    deployedV3StandardFactoryAddress.toLowerCase(),
  ].includes(configuredStandardFactoryAddress.toLowerCase())
    ? configuredStandardFactoryAddress
    : v4StandardFactoryAddress;

export const standardFactoryAddress =
  v3StandardFactoryAddress ?? legacyStandardFactoryAddress;

export const autoLiquidityFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS as
    `0x${string}` | undefined) ?? legacyAutoLiquidityFactoryAddress;

const configuredRewardsFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS as `0x${string}` | undefined;

// Legacy and V3 rewards factories remain read-only. Treat either stale Vercel
// value as V4 so a cached environment variable cannot re-enable old bytecode.
export const rewardsFactoryAddress =
  configuredRewardsFactoryAddress &&
  ![
    legacyRewardsFactoryAddress.toLowerCase(),
    v3RewardsFactoryAddress.toLowerCase(),
  ].includes(configuredRewardsFactoryAddress.toLowerCase())
    ? configuredRewardsFactoryAddress
    : v4RewardsFactoryAddress;

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
