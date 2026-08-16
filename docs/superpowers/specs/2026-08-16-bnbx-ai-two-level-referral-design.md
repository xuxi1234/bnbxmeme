# BNBX AI Two-Level Referral Preview Design

## Goal

Create an isolated Preview for a proposed BNBX AI membership and referral system without changing `main`, the production website, production environment variables, or sending any BSC mainnet transaction.

## Commercial rules

- Membership opening price: exactly `0.1 BNB`.
- Membership identity remains permanent.
- Only members may own and share referral links.
- Level-one reward: exactly `0.05 BNB`.
- Level-two reward: exactly `0.025 BNB`.
- AI operations treasury receives exactly `0.025 BNB` when both reward levels exist.
- A missing reward layer is not reassigned to another promoter. Its share is added to the AI operations treasury.
- A payment without a referrer sends the full `0.1 BNB` to the AI operations treasury.
- Opening a membership is the only commissionable event. Refill, duplicate payment, or withdrawal does not create referral rewards.

## Contract behavior

Add a focused Solidity membership contract. `openMembership(referrer)` accepts exactly `0.1 BNB`, rejects existing members, self-referral, non-member referrers, and two-node cycles. It binds the referrer once, marks the payer as a permanent member, credits valid first- and second-level rewards into pull-payment balances, and forwards the remaining amount to an immutable AI operations treasury.

Promoters withdraw their own accrued BNB with a checks-effects-interactions pattern and reentrancy protection. Contract events expose membership openings, referral binding, reward accrual, treasury revenue, and withdrawals. The contract has no owner-controlled reward rewriting, no arbitrary member deletion, no upgrade proxy, and no mainnet address embedded in Preview.

## Preview experience

The existing BNBX AI panel is updated on the feature branch to explain the `0.1 BNB` proposal and expose a referral center for members. It includes:

- personal invitation link and copy/share controls;
- invitation QR-ready URL presentation;
- level-one and level-two counts;
- accumulated, withdrawable, and withdrawn rewards;
- reward detail rows with level, wallet, amount, time, and transaction link;
- a clear Preview badge and disabled real payment/withdrawal actions until a deployed contract address is configured.

Chinese, English, Korean, and Japanese copy remain synchronized. Desktop and mobile use the same data model and controls.

## Data and integration boundaries

The on-chain contract is the source of truth for membership, referrer, and claimable commission. The web server may index contract events for fast history display, but it must not invent or edit rewards. Existing BNBX AI chat authorization remains unchanged in this Preview; production migration is deferred until contract deployment is separately approved.

## Testing

- Solidity tests cover exact payment, full two-level distribution, one missing layer, both missing layers, member-only referrals, immutable binding, self-referral, cycle prevention, duplicate membership, withdrawal, failed treasury transfer, and reentrancy.
- Web acceptance tests cover `0.1 BNB` copy, exact 50%/25%/25% display, member-only sharing, empty-layer copy, Preview safety lock, four languages, and responsive controls.
- Run the targeted tests, full TypeScript, ESLint, Prettier, Next.js production build, full repository tests, and a browser check against the generated Vercel Preview.

## Release boundary

Publish only an isolated feature branch and Draft PR with a Vercel Preview. Do not merge `main`, alias any production domain, deploy the contract, modify production Supabase, change production secrets, or send a mainnet transaction.
