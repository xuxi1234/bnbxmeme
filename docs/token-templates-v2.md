# BNBX Token Templates V3

BNBX V3 exposes exactly three creation templates. Older Factory contracts and
their tokens remain readable as historical launches, but new creation traffic
must use the V3 Factory addresses.

## Shared invariants

- Fixed supply: 1,000,000,000 tokens.
- Bonding curve allocation: 800,000,000 tokens.
- PancakeSwap V2 graduation allocation: 200,000,000 tokens.
- Internal trading fee: 0.5% in both directions, paid in BNB to the fixed
  platform fee recipient. It is independent from token taxes.
- Graduation target: creator-selected step from 0.01 through 0.18 BNB.
- Token taxes are disabled throughout internal curve trading and the atomic
  graduation seed. Taxes activate only after the pair is unlocked.
- Each buy and sell tax component may be zero. Buy and sell totals are capped
  independently at 1,000 basis points (10%) in both the web form and bytecode.
- The graduated LP recipient and every later automatic-liquidity LP recipient
  are `0x000000000000000000000000000000000000dEaD`.
- Launch configuration is one-way. The Factory setup role is sent to DEAD
  during creation; the immutable Curve's graduation role is sent to DEAD as it
  unlocks the pair. No human wallet owns a launched token.
- Contracts are non-upgradeable and expose no mint, blacklist, pause,
  confiscation, tax-update, or LP-recipient setter.

## Templates

### Standard permanent 0 tax

Fixed supply, permanent zero tax, no reward vault, and no privileged token
controls. This is the simplest and recommended default.

### Holder rewards

The creator selects an external BEP-20 reward token and a minimum eligible
launch-token balance. Post-graduation Pancake buy/sell taxes may independently
allocate to burn, automatic liquidity, marketing, and rewards. The rewards
allocation is swapped through Pancake V2 into the chosen external token and
accounted by actual vault balance increase.

Holder rewards use pull-based cumulative accounting. Transfers update only the
two affected holder shares; they never loop over all holders. New balances
cannot claim rewards accrued before they became eligible.

### LP rewards

This uses the same four optional post-graduation tax components and external
reward token. A user earns rewards only for Pancake V2 LP tokens deposited in
the per-token reward vault. The user may withdraw those LP tokens at any time.
Custody-backed shares prevent temporary wallet-balance snapshots from claiming
rewards. The burned graduation LP is excluded and never earns rewards.

## External reward-token requirements

- The address must contain contract bytecode and cannot be zero, DEAD, WBNB,
  or the newly created token.
- A PancakeSwap V2 reward-token/WBNB pair must already exist with non-zero
  reserves at creation time.
- Reward delivery is measured by the vault's actual balance increase so
  fee-on-transfer receipts cannot be over-accounted.
- Claims are initiated by beneficiaries. A failed reward-token transfer
  affects that claim only and cannot block launch-token transfers.
- Tokens with hostile transfer behavior, rebasing, deny-lists, or fees larger
  than the configured swap slippage may delay reward conversion. The launch
  token remains tradable because automatic tax processing is failure-isolated.

## Tax processing

- Buy and sell have separate burn, automatic-liquidity, marketing, and rewards
  fields. Typed values support `0`, `0.5`, `1`, `2.25`, and up to two decimals.
- The token processes a bounded amount per swap-back and uses a reentrancy
  guard. A router quote or swap failure emits a deferred event and does not
  block the user's sell.
- Burn tax transfers launch tokens to DEAD.
- Automatic liquidity pairs collected launch tokens with BNB and mints LP
  directly to DEAD.
- Marketing BNB uses a pull-safe fallback if the fixed recipient rejects BNB.
- Rewards BNB is converted to the immutable external reward token and sent to
  the immutable per-token reward vault.

## Release gate

Compiler settings and complete sources must be reproducible and verified on
BscScan for the standard Factory, advanced deployer, rewards Factory, created
tokens, curves, and reward vaults. The UI must never silently substitute a
different template. Deployment receipts, runtime-size checks, transaction gas,
and post-deployment role/LP assertions are release evidence.
