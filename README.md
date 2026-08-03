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
- Creator-selected graduation target: 0.01–0.18 BNB in 0.01 BNB steps
- Token creation fee: 0.001 BNB
- Internal buy fee: 1% for new launches (legacy curves remain immutable at 0.5%)
- Internal sell fee: 1% for new launches (legacy curves remain immutable at 0.5%)
- Standard tokens: immutable, non-upgradeable, permanently zero-tax
- Advanced templates: independently configurable buy and sell tax, each
  capped on-chain at 10%
- No mint, blacklist, pause, or hidden balance controls
- Graduation LP tokens: sent directly to the burn address

See [docs/token-economics.md](docs/token-economics.md) and
[docs/bonding-curve-spec.md](docs/bonding-curve-spec.md) for the normative
specification. The V4 templates, their exact source files, compiler settings,
Mainnet deployments, and BscScan verification procedure are published in
[docs/mainnet-source-verification.md](docs/mainnet-source-verification.md).
The automatic-reward security model and release gates are documented in
[docs/bnbx-v4-rewards-security.md](docs/bnbx-v4-rewards-security.md).

## Workspace

```text
apps/web        Next.js DApp
packages/contracts  Foundry smart contracts
packages/chain-config shared chain addresses and IDs
```

## BSC Mainnet V4

- Chain ID: `56`
- PancakeSwap V2 Router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- Fee recipient: `0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`
- Platform admin signing wallet:
  `0xbE37AB912De351B9312FA593C9f99e3279FDB0a2`
- Standard zero-tax Factory: `0x510dbBE270b2F009619BCbcF757aE2e2D48734Ad`
- Advanced token deployer: `0x6Be576ab1b2874641DE5Ac41069C57a16A5C892c`
- Holder/LP rewards Factory: `0x28100dBFA3F1a3D563e1667259433AdFA3aaC4BB`
- Standard Factory deployment:
  `0x31dcdb83a885f1a02d1a19656c988cd61e6744a7149900f89c71dd26c13d528f`
- Advanced token deployer deployment:
  `0xe75203f55eb924c5606ee0733b3eb17d509eb446c3b5e6fef9c5d9b9a73ede54`
- Rewards Factory deployment:
  `0x4700bf563aaa0d0c413962163ef0274a05daecf5789f664d43ff448a9fa4519e`
- Deployer manager configuration:
  `0xdbe5034667981942a2f2654480175daf7b98527e32f14b1913d411b8f873695a`

All Solidity sources are public under the MIT License. The three user-facing
templates are permanent zero tax, holder rewards, and LP rewards. The deployed
standard Factory, rewards Factory, and advanced deployer match the current V4
source and generated deployment artifacts. The superseded pre-fix rewards
infrastructure and the superseded 0.5% V4 factories are documented in
[docs/mainnet-source-verification.md](docs/mainnet-source-verification.md) and
remain public and readable only for historical launches.

The web deployment uses server-only `PINATA_JWT`, `BSC_MAINNET_RPC_URL`, and
`BSC_LOG_RPC_URL` environment variables. Platform management signatures use
the server-only `BNBX_ADMIN_SIGNING_WALLET` variable. The Factory fee
recipient remains the fixed platform revenue address and does not inherit
management access. `BSC_LOG_RPC_URL` must be
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
