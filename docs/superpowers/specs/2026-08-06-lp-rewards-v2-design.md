# BNBX LP Rewards V2 Design

## Goal

Build an independent, immutable, fully source-verified LP-rewards launch template for BNB Chain. The template automatically reinjects liquidity, burns launch tokens, and converts reward tax into a selected reward asset for eligible PancakeSwap V2 LP stakers. A blank reward-token field means BSC Mainnet USDT.

The design borrows only the useful economic ideas observed in `0xf6d2157952926821063c86daacea16c188089999`. It does not copy that contract's owner-controlled fees, trading controls, lists, limits, withdrawals, or incomplete LP-holder discovery.

## Isolation

LP Rewards V2 is separate from the completed Holder Rewards V2 template and from legacy V3/V4 deployments. Its source closure contains only:

- `BNBXLPRewardsFactory`
- `BNBXLPRewardsTokenDeployer`
- `BNBXLPRewardsToken`
- `BNBXLPRewardsVault`
- the shared, unchanged `BondingCurve`
- narrow Pancake V2 and ERC-20 interfaces and libraries

The LP Factory has its own address, deployment block, ABI, bytecode artifact, verification workflow, and public catalog entry. Legacy LP contracts remain readable but cannot create new official LP Rewards V2 launches after activation.

## Immutable token economics

- Fixed total supply: 1,000,000,000 tokens.
- Internal curve allocation: 800,000,000 tokens.
- Graduation liquidity allocation: 200,000,000 tokens.
- Creator-selected graduation target: 0.01-0.18 BNB in 0.01 BNB steps.
- Creation fee: 0.001 BNB to the existing immutable BNBX fee recipient.
- Taxes are disabled on the internal curve and while graduation liquidity is seeded.
- Taxes activate once after graduation to PancakeSwap V2.
- Buy and sell independently expose only liquidity, LP rewards, and burn taxes.
- Each component and each side total are capped on-chain at 10% (1,000 basis points).
- Tax values, reward asset, Router, Factory, fee recipient, and security thresholds are immutable.
- There is no owner, mint, pause, blacklist, arbitrary exemption, arbitrary tax setter, trading switch, asset rescue, or creator withdrawal function.

Burn tax transfers launch tokens directly to `0x000000000000000000000000000000000000dEaD`. Liquidity tax is paired with WBNB through PancakeSwap V2 and every resulting LP token is minted or transferred directly to the same burn address. Graduation LP is also minted directly to the burn address. No creator, administrator, or protocol wallet temporarily receives LP.

## Reward asset

The Factory normalizes a zero reward-token address to BSC Mainnet USDT `0x55d398326f99059ff775485246999027b3197955`.

A custom reward asset is accepted only when all of these on-chain checks pass at creation:

- the address contains contract code;
- it is not zero, the burn address, WBNB, the launch token, its Pair, Router, Factory, Deployer, Vault, or Curve;
- the canonical PancakeSwap V2 Factory reports a reward-token/WBNB Pair;
- the Pair contains both tokens and both reserves are non-zero.

These checks prove that an exchange route exists at creation; they cannot make an unrelated third-party token trustworthy. Reward-token transfer or swap failure must never block launch-token transfers. Unprocessed launch tokens and received reward assets remain in their dedicated accounting buckets for permissionless retry.

## LP staking and the 0.01 WBNB anti-dust gate

LP entitlement uses only Pancake V2 LP deposited into the per-token Vault. Wallet balances are not sampled. Custody-backed shares prevent flash-borrowed LP, stale wallet snapshots, and unregistered dust addresses from receiving rewards. Users may withdraw their LP at any time.

The Vault identifies the WBNB side of the official launch-token/WBNB Pair and computes the staked position's WBNB reserve share:

`WBNB value = staked LP * Pair WBNB reserve / Pair totalSupply`

On every stake or withdrawal, the account's resulting non-zero position must represent at least 0.01 WBNB using the current Pair reserves. A position may always be withdrawn completely. This is a security admission/remnant threshold, not a price oracle: ordinary swaps can change reserve ratios after an accepted stake, so eligibility is rechecked whenever the position changes. The contract does not scan every staker on every trade, because doing so would create an unbounded-Gas denial-of-service risk.

The zero address, burn address, token, Pair, Router, Factory, Deployer, Curve, and Vault are permanently excluded. Burned graduation LP and burned automatic-liquidity LP can never be staked and never earn rewards.

## Reward accounting and delivery

The Vault keeps separate deposited-LP and active-share accounting. A cumulative reward-per-share index prevents new stakers from claiming past rewards and preserves earned rewards when LP is withdrawn.

Tax processing is permissionless and bounded:

1. Collected reward-tax launch tokens are swapped to WBNB.
2. WBNB is swapped through the canonical reward-token/WBNB Pair into the immutable reward asset.
3. The Vault accounts the actual balance increase, supporting fee-on-transfer reward assets without assuming the quoted output was received.
4. A rotating processor attempts payouts to a bounded number of eligible stakers within a fixed Gas budget.
5. Failed transfers remain claimable and do not mark rewards as paid.

Every staker has `claim(recipient)`. Anyone may sponsor `claimFor(account)`, but that function always pays the account itself so a relayer cannot redirect rewards. A minimum automatic-payout amount avoids sending reward dust; smaller balances remain claimable and accumulate.

## Failure isolation

- Router quotes use bounded slippage and a deadline.
- Tax processing is attempted only on the sell path or through an explicit permissionless processor.
- A failed tax-processing attempt emits a reason and leaves all accounting recoverable for retry.
- Reward payout failure affects only that recipient and cannot block trades, other recipients, LP withdrawal, or later manual claiming.
- External calls follow checks-effects-interactions and use a reentrancy guard.
- Every loop has a count or Gas bound.
- Direct donations are accounted by balance delta; they cannot create fake shares.

## Creation and user interface

The LP template creation form exposes:

- liquidity, LP-reward, and burn percentages for buy and sell;
- an optional reward-token address with explicit USDT default copy;
- a fixed, non-editable `0.01 WBNB` minimum eligible LP value explanation;
- the standard name, symbol, metadata, graduation target, and optional atomic first buy.

The form does not expose marketing tax, marketing wallet, owner controls, or a raw LP-token threshold. Frontend validation mirrors the contract but never replaces it. The transaction receipt must identify the official LP Factory before the web app requests source verification.

Token pages show the immutable taxes, reward asset, LP Vault, total staked LP, wallet LP, user stake, WBNB-equivalent stake, eligibility status, claimable rewards, approve/stake/withdraw/claim controls, and source-verification links.

## Source verification and automatic opening

The following contracts must be verified on BscScan with the exact compiler, optimizer, metadata, libraries, and constructor arguments used on-chain:

- LP Rewards Factory
- LP TokenDeployer
- LP token implementation for every launch
- each launch's LP Rewards Vault
- each launch's BondingCurve

Verification is independent from graduation. Immediately after a confirmed official creation receipt, `/api/verify-launch` dispatches the dedicated LP verification workflow with the creation transaction hash. The workflow decodes only events emitted by the configured official LP Factory and verifies the complete contract graph.

A scheduled workflow scans the Factory catalog every five minutes and retries any unverified Factory, Deployer, token, Vault, or Curve. Jobs are idempotent, rate-limited, non-cancelling, and treat BscScan's “already verified” response as success. A compiler-input closure test fails CI if any source, compiler option, ABI, bytecode artifact, or constructor encoder needed for verification is missing or differs from deployment.

Production activation is blocked until a real testnet-created LP token and every child contract show verified source pages. After Mainnet deployment, the Factory and Deployer themselves must be verified before the website can expose LP Rewards V2.

## Tests and release gates

Contract tests must cover:

- all tax boundaries and independent buy/sell totals;
- default USDT and valid/invalid custom reward-token pools;
- curve trading with taxes disabled and one-time activation at graduation;
- direct-to-burn graduation LP and automatic-liquidity LP;
- `0.01 WBNB` stake admission, exact boundary, below-boundary rejection, partial-withdraw remnant, and full withdrawal;
- exclusion of every system address and burned LP;
- reward fairness across stake changes, no past-reward capture, automatic payout, manual claim, and non-redirectable sponsored claim;
- fee-on-transfer/broken reward tokens, Router failure, payout failure, reentrancy attempts, and bounded Gas processing;
- CREATE2 `1111` prediction/deployment agreement;
- loss of all temporary launch roles and absence of privileged setters or rescue selectors.

Web and workflow tests must cover ABI encoding, template routing, receipt authentication, immediate dispatch, five-minute fallback, complete verification closure, localization, and token-page staking controls.

Release order is: local RED/GREEN tests, full contract/web suite, static audit, BSC Testnet deployment and end-to-end acceptance, independent review, verified Testnet sources, reviewed GitHub PR, Vercel Preview, authorized BSC Mainnet deployment, verified Mainnet sources, bytecode/immutable comparison, production configuration change, and real production canary creation. No Mainnet Factory address or production website switch occurs before all preceding gates pass.
