# BNBX

BNBX is a BNB Chain meme-token launchpad with an internal bonding-curve market
and automatic graduation to PancakeSwap V2.

The first release target is BNB Smart Chain Testnet. Mainnet deployment is out
of scope until the contracts, accounting invariants, graduation flow, and
operational checklist have been independently reviewed.

## Confirmed launch rules

- Fixed token supply: 1,000,000,000 tokens
- Bonding-curve allocation: 800,000,000 tokens
- PancakeSwap V2 allocation: 200,000,000 tokens
- Creator-selected graduation target: an integer from 1 to 18 BNB
- Token creation fee: 0.001 BNB
- Internal buy fee: 0.5%
- Internal sell fee: 0.5%
- Token contracts: immutable, non-upgradeable, zero-tax, no owner controls
- Graduation LP tokens: sent directly to the burn address

See [docs/token-economics.md](docs/token-economics.md) and
[docs/bonding-curve-spec.md](docs/bonding-curve-spec.md) for the normative
specification.

## Workspace

```text
apps/web        Next.js DApp
apps/admin      acceptance and operations console
apps/api        public API
apps/indexer    reorg-aware BSC event indexer
packages/contracts  Foundry smart contracts
packages/chain-config shared chain addresses and IDs
packages/database PostgreSQL schema and client
packages/sdk     typed BNBX client
packages/ui      shared UI components
```

## BSC Testnet deployment

- Factory: `0x576b09d5672d0ca4d0fb4d65895157ee4c32c4b4`
- Chain ID: `97`
- Deployment block: `121342299`
- PancakeSwap V2 Router: `0xD99D1c33F9fC3444f8101754aBC46c52416550D1`

The web deployment requires a server-only `PINATA_JWT` environment variable
for token image and metadata uploads. Never expose it through a
`NEXT_PUBLIC_*` variable or commit it to this repository. Redeploy the web app
after adding or rotating this runtime secret.

## Safety

Never commit private keys, RPC credentials, deployer mnemonics, or production
admin secrets. Nothing in this repository is approved for mainnet use yet.
