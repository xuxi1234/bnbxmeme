# BNBX Security Model

## Trust boundaries

User funds are controlled only by immutable launch contracts and the
graduation path. Database records, APIs, indexers, and the frontend are
informational and must never authorize settlement.

## Token guarantees

The standard launched token has no owner, proxy, mint, tax, blacklist, pause,
or confiscation mechanism. Holder- and LP-reward tokens add only immutable,
post-graduation tax configuration. They expose no tax setter, privileged
exemption setter, blacklist, pause, mint, confiscation, or upgrade path. The
complete source and compiler settings must be published and verified on
BscScan.

The Factory has a one-transaction setup role used only to bind the token's
unique Pancake pair and per-token BondingCurve. It renounces that role during
creation. Until graduation, only that immutable curve can remove the
pair-transfer lock; doing so also destroys the curve's authority. No human
wallet can configure, unlock, relock, mint, tax, pause, or seize tokens.

After the one-time calls, `launchManager` and `graduationAuthority` both resolve
to `0x000000000000000000000000000000000000dEaD`. The authorized platform
deployment wallet can deploy and one-time-bind the advanced deployer to its
Factory, but it receives no control over tokens created by that Factory.

## Reward and tax boundaries

- Every buy/sell component may be zero; each side is independently capped at
  10% in contract bytecode.
- Taxes are disabled during curve trading and graduation liquidity seeding.
- Swap-back is bounded, non-reentrant, slippage checked, and failure-isolated
  from user sells.
- Holder rewards use cumulative balance-delta accounting with no holder loop.
- LP rewards count only LP tokens held in the immutable vault. Burned LP cannot
  be credited to a user.
- External reward tokens require a live Pancake V2 WBNB pool. Non-standard or
  hostile reward-token behavior remains an explicit asset risk and cannot
  grant control over the launch token.

## Curve controls

- Checks-effects-interactions ordering
- Reentrancy protection on all value-moving entry points
- User-provided slippage limits and deadlines
- Refunds are part of the same atomic transaction. If the chosen refund
  recipient rejects BNB, the complete buy reverts and no user funds are taken.
- Separate accounting for principal, trading fees, creation fees, and refunds
- Immutable graduation target and token allocations

## Graduation

- PancakeSwap V2 factory, router, and WBNB addresses come from reviewed
  per-chain configuration.
- Pair creation, liquidity addition, and state finalization are atomic.
- The Pair is created during launch. Transfers of the launched token into that
  Pair are blocked until graduation, preventing third parties from seeding it.
- Graduation wraps all principal to WBNB and mints liquidity directly through
  the Pair instead of relying on Router reserve-ratio calculations.
- LP tokens are minted directly to the burn address.
- Automatic-liquidity LP tokens are also minted directly to the burn address.
- No administrator, creator, or protocol wallet temporarily receives LP.
- A failed external router call leaves the launch in its prior trading state.

## Pair griefing defense

An attacker can donate WBNB to the Pair and call `sync`, but cannot transfer the
launched token into the Pair or mint initial LP before graduation. The Curve
does not require empty WBNB reserves: it transfers exactly 200 million tokens,
wraps and transfers all curve principal, and mints the initial LP directly to
the burn address. A one-sided WBNB donation therefore adds assets to the burned
pool instead of blocking graduation. This behavior has a dedicated regression
test and still requires independent review before mainnet.

## Operational requirements

- BNB Testnet end-to-end testing
- Unit, fuzz, invariant, and BSC fork tests
- Static analysis
- Independent audit remains recommended before broad-value mainnet use
- Multisig and timelock for any platform-level configuration
- Dual RPC providers and reorg-aware indexing
- Deployment bytecode and BscScan verification reproducibility
