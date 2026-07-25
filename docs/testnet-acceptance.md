# BNB Testnet Acceptance

The Testnet release is accepted only when all items below have reproducible
transaction hashes and automated test coverage.

## Creation

- Create launches for every graduation target from 1 through 18 BNB.
- Verify exact one-billion fixed supply.
- Verify 800/200 million allocation.
- Verify the token exposes no privileged management method.
- Verify collection of the 0.001 BNB creation fee.

## Trading

- Buy and sell with a 0.5% fee in both directions.
- Verify fee recipient balance and emitted accounting events.
- Verify slippage, deadline, zero-value, and insufficient-reserve reverts.
- Verify sells reduce graduation progress.
- Verify all UI quotes match contract execution.

## Atomic creator buy

- Create without an initial buy.
- Create with a partial initial buy.
- Create and fill a curve in one transaction.
- Overpay the fill and verify exact excess refund.
- Verify no public trade can execute between creation and creator buy.

## Graduation

- Graduate every integer target from 1 through 18 BNB.
- Verify internal trading permanently closes.
- Verify exactly 200 million tokens and all net principal seed the V2 pool.
- Verify the LP balance is held by the burn address.
- Verify a second graduation fails.
- Force router failure and verify the complete transition reverts.

Automated local EVM coverage currently executes all 18 graduation targets and
verifies exact principal, the 800/200 million allocation, graduated state, and
burn-address LP ownership for each target.

## Release gate

- All unit, fuzz, invariant, and fork tests pass.
- Static analysis has no unresolved high or critical findings.
- Source verification is reproducible.
- Mainnet address configuration remains disabled.
## Required secrets

Secrets must be supplied through a local secret manager or the deployment
platform. Never paste them into source files or commit them.

- `BSC_TESTNET_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `BSC_SCAN_API_KEY` for source verification
- `PINATA_JWT` for public IPFS token metadata

The deployment script records the Factory deployment block. Configure it as
`NEXT_PUBLIC_BNBX_DEPLOYMENT_BLOCK` so the frontend can query logs from the
exact start of the protocol instead of scanning an arbitrary range.
