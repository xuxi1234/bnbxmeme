# BNBX V4 rewards security model

BNBX V4 adds bounded automatic reward delivery to the immutable holder- and
LP-reward templates. It does not change existing V3 deployments. V4 addresses
must not replace the production configuration until testnet acceptance,
independent review, Mainnet source verification, and signer approval are all
complete.

## Reference-contract findings

The implementation was informed by the three public BSC contracts supplied for
research, but their source was not copied into BNBX:

- `0xf6d2157952926821063c86daacea16c188089999` discovers some LP holders and
  iterates balances, but exposes extensive owner controls over fees, trading,
  lists, limits, and asset withdrawals. Holder discovery is not complete enough
  to be a reliable accounting source.
- `0x999496e6c091f6a43a7bd8c3347d6c42bf869999` uses magnified reward accounting
  and a bounded processor, but also exposes owner-controlled fees, trading,
  allow/deny lists, limits, and asset withdrawals.
- `0xece60fe1273a2e459c39a07dc7394436f4b69999` uses cumulative rewards and LP
  staking and has renounced ownership, but retains a separate launchpad role
  that can change pair, market-wallet, and router-approval configuration.

BNBX V4 retains the useful cumulative-accounting and bounded-processing ideas
while excluding those privileged control surfaces.

## Immutable controls

Created V4 tokens are non-upgradeable and expose no owner, mint, pause,
blacklist, arbitrary tax setter, arbitrary exemption setter, or asset-withdrawal
function. Supply is fixed at 1,000,000,000 tokens. Standard-template tax is
permanently zero. Advanced-template buy and sell tax values are immutable after
construction and each side is capped at 10% on-chain.

The launch manager and graduation authority are one-time setup roles. They are
sent to the burn address after configuration and graduation. The external
advanced-token deployer can bind its manager only once.

## Holder rewards

The launch token synchronizes eligible balances into its reward vault whenever
tokens move. The minimum holder balance must be strictly greater than 1,000
tokens and defaults to 1,000,000 in the official UI. The zero address, burn
address, launch curve, liquidity pair, router, token contract, and vault do not
receive holder rewards.

New holders cannot receive rewards accrued before their balance became
eligible. Reducing or removing a holder's share preserves rewards already
earned.

## LP rewards

LP rewards use LP deposited into the public reward vault as the share proof.
Wallet LP balances are not used directly because Pancake V2 pairs do not notify
the launched token about every LP transfer, and temporary or flash-borrowed LP
must not become a reward entitlement. Users can withdraw their deposited LP at
any time, subject only to the configured minimum remaining stake.

## Automatic delivery and fallback

After new reward tokens enter the vault, V4 processes a rotating, bounded set
of eligible accounts. The launch-token transfer that triggers processing has a
fixed gas budget; it never loops through the full holder set without a bound.
After one cycle, automatic processing becomes idle until new rewards arrive, so
empty processing does not add recurring gas to later trades.

An automatic reward-token transfer failure does not mark the reward as paid and
cannot block a BNBX token transfer. The account keeps its claimable balance and
can use either `claim(recipient)` or the permissionless `claimFor(account)`
fallback. `claimFor` always pays the account itself, so a relayer cannot redirect
funds.

## External reward-token boundary

The default reward token is BSC USDT at
`0x55d398326f99059ff775485246999027b3197955`. A creator may select another
deployed BEP-20 only when it has a non-zero PancakeSwap V2 WBNB pool at creation
time. That check does not make the third-party token trustworthy. A selected
token may later blacklist users, pause, charge transfer fees, change behavior,
lose liquidity, or otherwise fail. V4 isolates those failures from launched
token transfers and preserves manual claims, but BNBX cannot remove control or
risk from an unrelated external contract.

## Mainnet release gates

Before Mainnet configuration changes:

1. Run the complete local EVM suite and `audit:v4`.
2. Deploy the exact artifacts to BSC Testnet and exercise creation, curve
   trading, graduation, holder payout, LP stake/payout/withdrawal, and failure
   fallback.
3. Obtain an independent smart-contract security review. Automated tests and
   static checks are not a guarantee that no vulnerability exists.
4. Deploy from the authorized platform signer and verify every source file and
   constructor argument on BscScan. The verification command is
   `pnpm --filter @bnbx/contracts verify-source:mainnet:v4` with the
   `BNBX_V4_STANDARD_FACTORY_ADDRESS`, `BNBX_V4_REWARDS_FACTORY_ADDRESS`, and
   optional `BNBX_V4_TOKEN_DEPLOYER_ADDRESS` environment variables.
5. Compare deployed bytecode and immutable addresses before updating the web
   configuration.
6. Promote a reviewed web Preview, then retain the old V3 Factory addresses as
   historical read-only origins.
