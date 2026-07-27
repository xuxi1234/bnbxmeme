# BNBX Token Templates V2

BNBX V2 presents four launch templates. `Standard` remains the only enabled
template until every advanced implementation passes testnet acceptance.

## Shared invariants

- Fixed supply: 1,000,000,000 tokens.
- Bonding curve allocation: 800,000,000 tokens.
- Pancake V2 graduation allocation: 200,000,000 tokens.
- Internal trading fee: 0.5% in both directions, paid in BNB to the platform
  fee recipient. This fee is independent from token taxes.
- Graduation target: creator-selected integer from 1 to 18 BNB.
- Token taxes are disabled for the factory, bonding curve, graduation transfer,
  and initial liquidity creation.
- Token taxes may activate only after graduation.
- Buy-side and sell-side tax totals are each capped at 2,500 basis points
  (25%). A launch may permanently lower, but never increase, its configured
  tax rates.
- Marketing recipient defaults to the creator. Every non-zero recipient and
  reward token must be validated during creation.
- Random dust airdrops ("address splitting") are excluded.

## Templates

### Standard

No tax, rewards, owner controls, proxy, minting, pause, blacklist, or transfer
limits. This remains the recommended default.

### Auto Liquidity

Optional burn, automatic-liquidity, and marketing allocations. Swap-back uses
a bounded threshold and a reentrancy guard. It must not execute during an
internal curve trade or graduation.

### Holder Rewards

Adds a BNB reward allocation distributed to qualifying token holders. Each
holder claims from a pull-based cumulative reward vault, so transfers never
loop over the holder list. The creator selects the minimum eligible token
balance. The curve, pair, burn address, launch manager, marketing wallet,
token contract, and reward vault are permanently excluded.

### LP Rewards

Adds a BNB reward allocation distributed to qualifying Pancake V2 LP holders.
Users stake LP tokens in the per-token reward vault and may withdraw them at
any time. Custodied LP is the reward share, eliminating stale-wallet-balance
and snapshot manipulation. The initial graduation LP is sent to the burn
address and can never enter the vault, so only LP that users add later can earn
rewards. Reward accounting begins only after graduation and never loops over
LP holders.

## Reward accounting

- Reward tax is collected only on post-graduation Pancake buys and sells.
- Swap-back converts the configured reward allocation to BNB and deposits it
  into the per-token reward vault.
- Rewards deposited before any eligible shares exist remain queued.
- Adding tokens or LP after a deposit cannot claim rewards from an earlier
  accounting period.
- Claims are initiated by the beneficiary; a failed payout reverts only that
  claim and cannot block transfers.
- Buy-side and sell-side burn, liquidity, marketing, and rewards allocations
  are independently configurable, but each side's total remains capped at 25%.

## Release gate

An advanced template remains disabled in the web app until its bytecode is
deployed on BSC Testnet, verified on BscScan, fuzz-tested, and accepted using
the testnet checklist. The UI must never silently deploy a Standard token when
an advanced template was selected.
