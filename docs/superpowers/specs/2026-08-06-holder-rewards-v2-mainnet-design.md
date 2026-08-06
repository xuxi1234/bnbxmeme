# Holder Rewards V2 Mainnet Deployment Design

## Goal

Replace the legacy two-argument independent holder-rewards deployment with one immutable BSC Mainnet Factory deployment. The authorized wallet signs exactly one transaction from `/deploy-mainnet`; the resulting Factory supports three fixed tax destinations per trade side: liquidity, holder rewards, and burn.

## Immutable deployment

`BNBXHolderRewardsFactory` takes exactly three constructor arguments:

1. platform fee recipient `0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`;
2. PancakeSwap V2 Router `0x10ED43C718714eb63d5aA57B78B54704E256024E`;
3. default BSC USDT reward token `0x55d398326f99059ff775485246999027b3197955`.

The Factory creates its dedicated `BNBXHolderRewardsTokenDeployer` in its constructor and stores it as an immutable. The deployer accepts calls only from that Factory and has no manager setter. This keeps token creation bytecode out of the Factory runtime while preserving CREATE2 address prediction and the `1111` suffix.

## Token creation and taxes

The Holder template exposes only liquidity, rewards, and burn taxes for both buys and sells. Each component and each side total are capped at 10% (1,000 basis points). Marketing fields and the legacy single reward-tax fields are not part of the V2 request.

An empty reward-token field is encoded as the zero address and resolved by the Factory to immutable default USDT. A custom reward token must be a deployed token other than WBNB and must have a non-empty Pancake V2 WBNB pair. Resolution occurs before CREATE2 prediction, so blank and explicit USDT requests predict the same token address.

Taxes stay disabled on the internal bonding curve. After graduation:

- burn tax transfers the taxed launch tokens to `0x000000000000000000000000000000000000dEaD`;
- liquidity tax is accumulated for permissionless bounded processing, paired with WBNB on Pancake V2, and the resulting LP is minted/sent to the same burn address;
- rewards tax is swapped through WBNB into the configured reward token and credited to the holder reward ledger;
- reward eligibility uses the immutable minimum token balance and excludes the token contract, curve, pair, and burn address;
- holders can claim their accrued rewards; processing failures restore accounting and do not seize caller or holder funds.

The token has no owner, mint, blacklist, tax setter, withdrawal, marketing, referral, proxy, or upgrade interface.

## Web deployment surface

`/deploy-mainnet` is a dedicated V2-only page. It does not expose the standard Factory selector or the legacy three-step advanced deployer flow. It enforces BSC Mainnet and authorized wallet `0xbE37AB912De351B9312FA593C9f99e3279FDB0a2`, displays all three immutable constructor values, and calls `useDeployContract` once with the generated V2 ABI/bytecode and exactly those three arguments.

`/deploy-testnet` remains available for existing internal workflows but is not the link given to the user for this release.

## Safety and verification

The generated artifact is rebuilt from Solidity source. Automated checks must prove:

- Factory, token, and dedicated deployer runtimes are below 24,576 bytes;
- Factory initialization code is below the EIP-3860 limit;
- the ABI contains the three-argument constructor and required tax/processing interfaces;
- forbidden privileged interfaces are absent;
- CREATE2 prediction matches actual deployment through the dedicated deployer;
- blank and explicit default USDT normalize identically;
- unsupported custom reward tokens are rejected;
- the mainnet page uses the generated V2 artifact and exactly one deploy action;
- the encoded deployment transaction decodes to the expected bytecode hash and constructor values.

No Factory address is activated in the creation page until the deployment transaction hash is returned and the deployed runtime and immutable values are verified on BSC Mainnet.
