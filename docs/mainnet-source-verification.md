# BNBX V4 Mainnet open source and verification

BNBX V4 exposes exactly three creation templates. All source files are public
under the repository's MIT License.

## Current reviewed source

- Standard permanent zero-tax uses
  [`BNBXTokenV4`](../packages/contracts/src/BNBXTokenV4.sol) and
  [`BNBXFactoryV4`](../packages/contracts/src/BNBXFactoryV4.sol).
- Holder rewards and LP rewards use
  [`BNBXDividendTokenV4`](../packages/contracts/src/BNBXDividendTokenV4.sol),
  [`BNBXRewardVaultV4`](../packages/contracts/src/BNBXRewardVaultV4.sol),
  [`BNBXAdvancedTokenDeployerV4`](../packages/contracts/src/BNBXAdvancedTokenDeployerV4.sol),
  and [`BNBXRewardsFactoryV4`](../packages/contracts/src/BNBXRewardsFactoryV4.sol).
- Every template uses the public
  [`BondingCurve`](../packages/contracts/src/BondingCurve.sol),
  [`FeeMath`](../packages/contracts/src/libraries/FeeMath.sol), and
  [`TemplateConfigV4`](../packages/contracts/src/libraries/TemplateConfigV4.sol)
  implementations.

## Deployment-source status

The active standard zero-tax Factory, advanced token deployer, and holder/LP
rewards Factory exactly match the current reviewed V4 source and generated web
artifacts. The superseded advanced token deployer and rewards Factory were
created from the generated artifact at commit
[`d8d953db9cd151d7b130b22f347aba4c9d513d92`](https://github.com/xuxi1234/bnbxmeme/tree/d8d953db9cd151d7b130b22f347aba4c9d513d92).
That artifact predates security commit
[`8d3188f586261a2812af8963bf75acda208099cf`](https://github.com/xuxi1234/bnbxmeme/commit/8d3188f586261a2812af8963bf75acda208099cf),
which corrected tax-allocation rounding and zero-marketing-wallet CREATE2
prediction. Those historical rewards addresses do not match the current
reviewed source and must not be used for additional launches.

The verification workflow compiles the current reviewed source. The historical
pre-fix infrastructure remains Exact Match verified against its pinned source
snapshot on BscScan.

## Active BSC Mainnet deployments

| Component                 | Address                                      | Deployment transaction                                               |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Standard zero-tax Factory | `0x6012aa2eb5164c8ed31f2a01950c3b5037211181` | `0x8aa33936ad714c17b900b29d92271a8f6ed8d1832172670ba414f88c81b2455c` |
| Advanced token deployer   | `0x1c6354eBf4B7BC4e3da65C2B718a36e7C2A81707` | `0x614acd272d4ce00d168fc48e7d6354ed82c7e7479db44e309ee9db423b8a6b2f` |
| Holder/LP rewards Factory | `0x6C72ECE4F7AA05F3b2099Ef9dD2d668E7e3f688E` | `0xd3682b2c51840a818d992e50c165428fa91844ede696bc2a4e3d85b272b940de` |

The advanced deployer's one-time manager binding to the rewards Factory was
confirmed in transaction
`0x8e4cc30ec9908596510e4135641457f46fafd679ca6532622aacedfa9a111d41`.
The fixed fee recipient is
`0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`, and the fixed PancakeSwap V2
Router is `0x10ED43C718714eb63d5aA57B78B54704E256024E`.

## Historical pre-fix rewards infrastructure

| Component                 | Address                                      | Deployment/configuration transaction                                 |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Advanced token deployer   | `0xbCf50926684726DA1C3674f110fCAb755E181525` | `0x00486285029bcb6ee32849380b648c897a50aba051cdc1e8ec3179b47ee64364` |
| Holder/LP rewards Factory | `0xe4aAF8066bf1063CFd73dc9a784598DFFa412014` | `0xaae7031d8547bad975987709e7fe5b1430aeb1ebbecde5f01d6f002847ff629d` |
| One-time manager binding  | —                                            | `0xc70eff63aec72f75480a07c37174f867d73ce2fa0a9076eaca83f77c7d76a149` |

These addresses remain public and Exact Match verified for provenance, but
are read-only and are not selected by the production creation flow.

The standalone Auto Liquidity creation template is removed. Its previously
deployed Factory remains listed as historical/read-only so old projects remain
discoverable.

The verification command compiles the exact deployed-source standard JSON
input, reads the constructor arguments from BSC, checks the fixed
router/revenue recipient,
checks the authorized deployer and one-time manager binding, and submits the
three V4 infrastructure contracts to BscScan. With
`VERIFY_LAUNCHED_TOKENS=1`, it also reconstructs and verifies every V4 token,
BondingCurve, and reward vault registered by those Factories. It is read-only
and never signs or sends a transaction.

## Required secrets and addresses

- `BSC_SCAN_API_KEY`
- `BSC_MAINNET_RPC_URL` (optional; a public read-only endpoint is the fallback)
- `BNBX_V4_STANDARD_FACTORY_ADDRESS`
- `BNBX_V4_REWARDS_FACTORY_ADDRESS`
- `BNBX_V4_TOKEN_DEPLOYER_ADDRESS` (optional cross-check)

Do not expose the API key or a private RPC URL through `NEXT_PUBLIC_` variables.

## Compile-only reproducibility check

```bash
VERIFY_DRY_RUN=1 \
pnpm --filter @bnbx/contracts verify-source:mainnet:v4
```

## Verify deployed V4 infrastructure

```bash
BNBX_V4_STANDARD_FACTORY_ADDRESS=0x6012aa2eb5164c8ed31f2a01950c3b5037211181 \
BNBX_V4_REWARDS_FACTORY_ADDRESS=0x6C72ECE4F7AA05F3b2099Ef9dD2d668E7e3f688E \
BNBX_V4_TOKEN_DEPLOYER_ADDRESS=0x1c6354eBf4B7BC4e3da65C2B718a36e7C2A81707 \
pnpm --filter @bnbx/contracts verify-source:mainnet:v4
```

After launches exist, rerun with `VERIFY_LAUNCHED_TOKENS=1`. The default safety
limit is 250 tokens per Factory; increase `BNBX_VERIFY_MAX_TOKENS` explicitly
when a complete Factory contains more entries.

Compiler settings are fixed to Solidity `0.8.30`, optimizer 200 runs, EVM
version `shanghai`, and SPDX license `MIT`.
