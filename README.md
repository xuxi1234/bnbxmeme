# BNBX

BNBX is a BNB Chain meme-token launchpad with an internal bonding-curve market
and automatic graduation to PancakeSwap V2.

The current release target is a limited BNB Smart Chain Mainnet canary. New
contract deployments must pass the local EVM suite, the complete graduation
target matrix, source verification, and a separate deployment review before
any production address is changed.

## Confirmed launch rules

- Fixed token supply: 1,000,000,000 tokens
- Bonding-curve allocation: 800,000,000 tokens
- PancakeSwap V2 allocation: 200,000,000 tokens
- Creator-selected canary graduation target: 0.01–0.18 BNB in 0.01 BNB steps
- Token creation fee: 0.001 BNB
- Internal buy fee: 0.5%
- Internal sell fee: 0.5%
- Standard tokens: immutable, non-upgradeable, permanently zero-tax
- Advanced templates: independently configurable buy and sell tax, each
  capped on-chain at 10%
- No mint, blacklist, pause, or hidden balance controls
- Graduation LP tokens: sent directly to the burn address

See [docs/token-economics.md](docs/token-economics.md) and
[docs/bonding-curve-spec.md](docs/bonding-curve-spec.md) for the normative
specification.

## Workspace

```text
apps/web        Next.js DApp
packages/contracts  Foundry smart contracts
packages/chain-config shared chain addresses and IDs
```

## BSC Mainnet canary

- Chain ID: `56`
- PancakeSwap V2 Router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- Fee recipient: `0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`
- Advanced token deployer: `0xe7061e64991855a474ba29ad8adf7b6984c29cb4`
- Rewards Factory: `0xde844f36a3bab42ae23158de5c3e8f0ac31e6af8`
- Advanced token deployer deployment:
  `0x76acc2ac3407d9dd68f5ec3ccc56ecb6471bb35ae09c26a0522c764764721a6c`
- Rewards Factory deployment:
  `0x25fd96e9562b42a7b8e6b52b7bd7fbf4438ee35981253809be94f68a0b772c58`
- Deployer manager configuration:
  `0x843d747e99275ce20183da0a4bb11a834f2581e2b3f42563c83da0d8abc29623`

The web deployment uses server-only `PINATA_JWT`, `BSC_MAINNET_RPC_URL`, and
`BSC_LOG_RPC_URL` environment variables. `BSC_LOG_RPC_URL` must be
archive-capable so historical project indexes can backfill from the official
Factory deployment blocks. Never expose these values through a
`NEXT_PUBLIC_*` variable, print them in logs, or commit them to this
repository.

See [docs/web-data-release-runbook.md](docs/web-data-release-runbook.md) before
applying Supabase migrations or promoting a Web Preview.

## Safety

Never commit private keys, RPC credentials, deployer mnemonics, or production
admin secrets. Passing the automated suite is necessary but is not a claim of
formal verification or a guarantee that a contract has no vulnerabilities.
No deployment script should be run against Mainnet without an explicit
address-by-address review and signer confirmation.
