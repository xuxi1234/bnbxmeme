# Independent holder-rewards V2 template

The V2 template is isolated from legacy V1, V3, and V4 launch contracts. Its source closure contains only `BNBXHolderRewardsFactory`, its immutable `BNBXHolderRewardsTokenDeployer`, `BNBXHolderRewardsToken`, `BNBXHolderRewardsVault`, the shared `BondingCurve`, and narrow interfaces/libraries.

The Factory constructor fixes the platform fee recipient, PancakeSwap V2 Router, and default reward token. On BSC Mainnet the default reward token is USDT at `0x55d398326f99059ff775485246999027b3197955`. A zero reward-token request resolves to this immutable default; a custom token must have a deployed, non-empty WBNB pair. The Factory creates its dedicated token deployer internally, so the official mainnet deployment requires one wallet transaction and no later manager authorization.

Each buy and sell has three immutable tax components: automatic liquidity, holder rewards, and token burn. Each side total is capped at 10%. Taxes remain disabled on the internal curve and activate once at graduation. Burn tax goes to `0x000000000000000000000000000000000000dEaD`; automatic-liquidity LP is also minted to the burn address. Reward tax is converted through WBNB into the selected reward asset.

The dedicated Vault uses cumulative per-share accounting plus a bounded rotating processor. Successful automatic payouts reach eligible holders without manual claims; failed token transfers remain claimable and cannot freeze launch-token transfers. Holder eligibility uses an immutable minimum balance and excludes the token, curve, Pancake pair, Router, Vault, zero address, and burn address.

The token has a fixed one-billion supply and no owner, mint, blacklist, tax setter, marketing wallet, withdrawal, proxy, or upgrade path. Launch roles are single-use and permanently replaced by the burn address.

The public creation flow must not activate a new Factory address until its BSC Mainnet deployment transaction, runtime bytecode, constructor values, dedicated deployer, and source verification have been checked.
