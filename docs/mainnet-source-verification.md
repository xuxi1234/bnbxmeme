# BNBX V3 mainnet source verification

BNBX V3 exposes exactly three creation templates:

- Standard permanent zero-tax uses `BNBXTokenV3` and `BNBXFactory`.
- Holder rewards and LP rewards use `BNBXDividendTokenV3`,
  `BNBXRewardVaultV3`, `BNBXAdvancedTokenDeployer`, and
  `BNBXRewardsFactoryV3`.

The standalone Auto Liquidity creation template is removed. Its previously
deployed Factory remains listed as historical/read-only so old projects remain
discoverable.

The verification command compiles the exact standard JSON input, reads the
constructor arguments from BSC, checks the fixed router/revenue recipient,
checks the authorized deployer and one-time manager binding, and submits the
three V3 infrastructure contracts to BscScan. With
`VERIFY_LAUNCHED_TOKENS=1`, it also reconstructs and verifies every V3 token,
BondingCurve, and reward vault registered by those Factories. It is read-only
and never signs or sends a transaction.

## Required secrets and addresses

- `BSC_SCAN_API_KEY`
- `BSC_MAINNET_RPC_URL` (optional; a public read-only endpoint is the fallback)
- `BNBX_V3_STANDARD_FACTORY_ADDRESS`
- `BNBX_V3_REWARDS_FACTORY_ADDRESS`
- `BNBX_V3_TOKEN_DEPLOYER_ADDRESS` (optional cross-check)

Do not expose the API key or a private RPC URL through `NEXT_PUBLIC_` variables.

## Compile-only reproducibility check

```bash
VERIFY_DRY_RUN=1 \
pnpm --filter @bnbx/contracts verify-source:mainnet
```

## Verify deployed V3 infrastructure

```bash
BNBX_V3_STANDARD_FACTORY_ADDRESS=0x... \
BNBX_V3_REWARDS_FACTORY_ADDRESS=0x... \
BNBX_V3_TOKEN_DEPLOYER_ADDRESS=0x... \
pnpm --filter @bnbx/contracts verify-source:mainnet
```

After launches exist, rerun with `VERIFY_LAUNCHED_TOKENS=1`. The default safety
limit is 250 tokens per Factory; increase `BNBX_VERIFY_MAX_TOKENS` explicitly
when a complete Factory contains more entries.

Compiler settings are fixed to Solidity `0.8.30`, optimizer 200 runs, EVM
version `shanghai`, and SPDX license `MIT`.
