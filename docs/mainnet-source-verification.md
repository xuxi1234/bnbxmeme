# BNBX mainnet source verification

BNBX exposes four creation templates, backed by two token implementations:

- Standard zero-tax uses `BNBXToken`.
- Auto-liquidity, holder rewards, and LP rewards use
  `BNBXAutoLiquidityToken` with different immutable template parameters.

The verification job publishes the exact source and constructor arguments for
every Factory, advanced deployer, launched token, bonding curve, and reward
vault. It never sends a transaction and cannot change deployed bytecode.

## Required GitHub Actions secrets

Configure these in **Settings → Secrets and variables → Actions**:

- `BSC_SCAN_API_KEY`: Etherscan/BscScan API key with BNB Chain API access.
- `BSC_MAINNET_RPC_URL` (recommended): private or rate-limited BSC mainnet HTTPS
  RPC endpoint. When omitted, the job falls back to a public read-only endpoint.

Do not use `NEXT_PUBLIC_` variables for either secret.

## Run

Open **Actions → Verify BNBX contracts on BscScan → Run workflow**. The default
Factory list contains the active standard, auto-liquidity, and rewards
Factories. Holder-reward and LP-reward tokens share the rewards Factory and are
identified from each token's immutable `template` value.

To include a replacement Factory, add its address to the comma-separated
workflow input. Existing verified contracts are skipped safely.

For a local read-only constructor reconstruction check:

```bash
VERIFY_DRY_RUN=1 \
BSC_MAINNET_RPC_URL=https://your-bsc-rpc.example \
pnpm --filter @bnbx/contracts verify-source:mainnet
```

The compiler settings must continue matching the deployment build:

- Solidity `0.8.30`
- optimizer enabled with 200 runs
- EVM version `shanghai`
- SPDX license `MIT`
