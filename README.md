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
- Standard zero-tax Factory: `0x26f43D62E1CfAdC3d89ff0fFe58375ECbdED7330`
- Holder rewards Factory: `0x31cE11E80875e1D698089f71F06Acbb27726dB95`
- LP rewards Factory: `0xA887212925AAA9DEe93C1379f7A8119384cf9157`
- Standard Factory deployment:
  `0xdcb85f657af7c7845fc1416468907a4e3eeafa4056c04d2eaf9330933950cda1`
- Holder rewards Factory deployment:
  `0x3f36f04e9f9c9ce7e407cd244b0c09ac1c8b4d215356c2655c49158702605687`
- LP rewards Factory deployment:
  `0x8d92589c9fc07c0a3990b4a76acc3ec848eb9a7cb0a5e0cb793e736b49664872`

All Solidity sources are public under the MIT License. The three user-facing
templates are permanent zero tax, holder rewards, and LP rewards. The deployed
three independent Factories match the current reviewed source and generated
deployment artifacts. The superseded pre-fix rewards
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
