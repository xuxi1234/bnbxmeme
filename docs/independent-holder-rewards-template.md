# Independent holder-rewards template

This template is isolated from all legacy V1, V3, and V4 rewards contracts. It consists only of `BNBXHolderRewardsToken`, `BNBXHolderRewardsFactory`, and the shared immutable `BondingCurve` launch primitive.

The token has a fixed one-billion supply, no owner, no minting, no tax setter, and no upgrade path. Buy and sell reward taxes are constructor-fixed and each is capped at 10%. Taxes remain disabled during the internal curve and activate once, at graduation. The graduation Curve and Pancake Pair are excluded from reward shares; the Curve's initial liquidity transfer is tax-free.

Rewards use a magnified-per-share ledger. Transfers and claims are O(1), and no holder loop exists. Accounts below the immutable minimum balance do not participate. Collected tax processing is permissionless, capped at five million tokens per call, and requires caller-provided slippage and deadline bounds. External rewards can also be deposited through `fundRewards`.

No address is active until a separately audited Factory is deployed. Set `NEXT_PUBLIC_BNBX_HOLDER_REWARDS_FACTORY_ADDRESS` only after deployment review; an empty value keeps the creation entry unavailable. Mainnet deployment and wallet interaction are outside this development stage.
