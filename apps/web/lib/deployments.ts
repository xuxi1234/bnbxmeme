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

// Pre-fix V4 rewards infrastructure remains readable for historical launches,
// but must never be selected for new holder/LP-rewards deployments.
export const preFixV4RewardsFactoryAddress =
  "0xe4aaf8066bf1063cfd73dc9a784598dffa412014" as const;

// Superseded 0.5% V4 factories remain readable for historical launches, but
// must never be selected for new 1% launches.
export const halfPercentV4StandardFactoryAddress =
  "0x6012aa2eb5164c8ed31f2a01950c3b5037211181" as const;

export const halfPercentV4RewardsFactoryAddress =
  "0x6c72ece4f7aa05f3b2099ef9dd2d668e7e3f688e" as const;

// Audited 1% V4 holder/LP rewards Factory. Its advanced deployer was generated
// from the reviewed source and permanently bound to this address on Mainnet.
export const v4RewardsFactoryAddress =
  "0x28100dbfa3f1a3d563e1667259433adfa3aac4bb" as const;

// V3 Standard 0-tax Factory deployed by the authorized platform wallet. Its
// constructor values are immutable chain facts, so this fallback also protects
// production from an empty or stale V1 environment variable.
const deployedV3StandardFactoryAddress =
  "0xc5f6d2b221dfd950f919b82c77d82fc427f31b3d" as const;

// Superseded 1% V4 Standard 0-tax Factory remains an immutable chain fact for
// audits, but must never be selected for new launches.
export const v4StandardFactoryAddress =
  "0x510dbbe270b2f009619bcbcf757ae2e2d48734ad" as const;

// Clean zero-tax Factory deployed from the isolated BNBXZeroTaxFactory source
// by the authorized platform wallet. Constructor arguments and runtime
// bytecode were matched against the audited build before activation.
export const zeroTaxFactoryAddress =
  "0xcdb3bb57cb27eab36a7c39685afcb93abfec326f" as const;

export const holderRewardsFactoryAddress =
  "0xcc1ffca6985658de357f3f5763fd1ff690074625" as const;

const configuredStandardFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_FACTORY_ADDRESS as `0x${string}` | undefined;

export const v3StandardFactoryAddress =
  configuredStandardFactoryAddress &&
  ![
    legacyStandardFactoryAddress.toLowerCase(),
    deployedV3StandardFactoryAddress.toLowerCase(),
    halfPercentV4StandardFactoryAddress.toLowerCase(),
    v4StandardFactoryAddress.toLowerCase(),
  ].includes(configuredStandardFactoryAddress.toLowerCase())
    ? configuredStandardFactoryAddress
    : zeroTaxFactoryAddress;

export const standardFactoryAddress =
  v3StandardFactoryAddress ?? legacyStandardFactoryAddress;

export const autoLiquidityFactoryAddress =
  (process.env.NEXT_PUBLIC_BNBX_AUTO_LIQUIDITY_FACTORY_ADDRESS as
    `0x${string}` | undefined) ?? legacyAutoLiquidityFactoryAddress;

const configuredRewardsFactoryAddress = process.env
  .NEXT_PUBLIC_BNBX_REWARDS_FACTORY_ADDRESS as `0x${string}` | undefined;

// Legacy, V3, and pre-fix V4 rewards factories remain read-only. Treat any
// stale Vercel value as current V4 so a cached environment variable cannot
// re-enable older bytecode.
export const rewardsFactoryAddress =
  configuredRewardsFactoryAddress &&
  ![
    legacyRewardsFactoryAddress.toLowerCase(),
    v3RewardsFactoryAddress.toLowerCase(),
    preFixV4RewardsFactoryAddress.toLowerCase(),
    halfPercentV4RewardsFactoryAddress.toLowerCase(),
  ].includes(configuredRewardsFactoryAddress.toLowerCase())
    ? configuredRewardsFactoryAddress
    : v4RewardsFactoryAddress;

// Historical factories remain documented above for contract audits and
// deployment provenance, but their projects are intentionally no longer part
// of the public BNBX catalog. Only launches made through the current audited
// 1% factories are displayed, searchable, or accepted as platform projects.
export const officialFactoryAddresses = Array.from(
  new Set<`0x${string}`>([
    standardFactoryAddress,
    ...(rewardsFactoryAddress ? [rewardsFactoryAddress] : []),
    holderRewardsFactoryAddress,
  ]),
);

export const blockExplorerUrl = "https://bscscan.com";

export const lpBurnAddress =
  "0x000000000000000000000000000000000000dEaD" as const;

export const pancakeRouterAddress =
  "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;

export const pancakeFactoryAddress =
  "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as const;
