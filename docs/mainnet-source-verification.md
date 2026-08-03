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

The active standard zero-tax Factory exactly matches the current reviewed V4
source. The currently deployed advanced token deployer and holder/LP rewards
Factory were created from the generated artifact at commit
[`d8d953db9cd151d7b130b22f347aba4c9d513d92`](https://github.com/xuxi1234/bnbxmeme/tree/d8d953db9cd151d7b130b22f347aba4c9d513d92).
That artifact predates security commit
[`8d3188f586261a2812af8963bf75acda208099cf`](https://github.com/xuxi1234/bnbxmeme/commit/8d3188f586261a2812af8963bf75acda208099cf),
which corrected tax-allocation rounding and zero-marketing-wallet CREATE2
prediction. The deployed rewards addresses therefore must not be represented
as matching the current reviewed source and should not be used for additional
launches. Replacement deployment addresses will supersede them after the
reviewed artifact is deployed and verified.

The verification workflow intentionally compiles the existing deployed
rewards infrastructure from the pinned deployment-source commit, so BscScan
shows the code that is actually on-chain. The repository's generated web
artifact is built from the current reviewed source for the replacement
deployment.

## Active BSC Mainnet deployments

| Component                                                 | Address                                      | Deployment transaction                                               |
| --------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Standard zero-tax Factory                                 | `0x6012aa2eb5164c8ed31f2a01950c3b5037211181` | `0x8aa33936ad714c17b900b29d92271a8f6ed8d1832172670ba414f88c81b2455c` |
| Advanced token deployer (pre-fix; replacement required)   | `0xbCf50926684726DA1C3674f110fCAb755E181525` | `0x00486285029bcb6ee32849380b648c897a50aba051cdc1e8ec3179b47ee64364` |
| Holder/LP rewards Factory (pre-fix; replacement required) | `0xe4aAF8066bf1063CFd73dc9a784598DFFa412014` | `0xaae7031d8547bad975987709e7fe5b1430aeb1ebbecde5f01d6f002847ff629d` |

The advanced deployer's one-time manager binding to the rewards Factory was
confirmed in transaction
`0xc70eff63aec72f75480a07c37174f867d73ce2fa0a9076eaca83f77c7d76a149`.
The fixed fee recipient is
`0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`, and the fixed PancakeSwap V2
Router is `0x10ED43C718714eb63d5aA57B78B54704E256024E`.

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
BNBX_V4_REWARDS_FACTORY_ADDRESS=0xe4aAF8066bf1063CFd73dc9a784598DFFa412014 \
BNBX_V4_TOKEN_DEPLOYER_ADDRESS=0xbCf50926684726DA1C3674f110fCAb755E181525 \
pnpm --filter @bnbx/contracts verify-source:mainnet:v4
```

After launches exist, rerun with `VERIFY_LAUNCHED_TOKENS=1`. The default safety
limit is 250 tokens per Factory; increase `BNBX_VERIFY_MAX_TOKENS` explicitly
when a complete Factory contains more entries.

Compiler settings are fixed to Solidity `0.8.30`, optimizer 200 runs, EVM
version `shanghai`, and SPDX license `MIT`. The GitHub Actions workflow pins
the deployed source snapshot by full commit SHA; changing that SHA requires a
reviewed workflow change.
