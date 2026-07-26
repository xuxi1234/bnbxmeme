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

Adds a reward allocation distributed to qualifying token holders. Processing
must be gas-bounded and batched so the holder count cannot block transfers.
The curve, pair, burn address, factory, and reward distributor are excluded.

### LP Rewards

Adds a reward allocation distributed to qualifying Pancake V2 LP holders.
Reward accounting begins only after graduation and must be gas-bounded.

## Release gate

An advanced template remains disabled in the web app until its bytecode is
deployed on BSC Testnet, verified on BscScan, fuzz-tested, and accepted using
the testnet checklist. The UI must never silently deploy a Standard token when
an advanced template was selected.
