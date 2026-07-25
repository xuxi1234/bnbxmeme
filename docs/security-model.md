# BNBX Security Model

## Trust boundaries

User funds are controlled only by immutable launch contracts and the
graduation path. Database records, APIs, indexers, and the frontend are
informational and must never authorize settlement.

## Token guarantees

The launched token has no owner, proxy, mint, tax, blacklist, pause, or
confiscation mechanism. The complete source and compiler settings must be
published and verified on BscScan.

The Factory has a one-transaction setup role used only to bind the token's
unique Pancake pair and per-token BondingCurve. It renounces that role during
creation. Until graduation, only that immutable curve can remove the
pair-transfer lock; doing so also destroys the curve's authority. No human
wallet can configure, unlock, relock, mint, tax, pause, or seize tokens.

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
- Independent audit before mainnet
- Multisig and timelock for any platform-level configuration
- Dual RPC providers and reorg-aware indexing
- Deployment bytecode and BscScan verification reproducibility
