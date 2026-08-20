# BNBX Futures Phase 1 — Confirmed Design

Status: confirmed by the product owner on 2026-08-12 and reconstructed on 2026-08-13 after an unpushed local worktree was automatically removed.

## Scope

Phase 1 delivers a BNBX/USDT isolated-margin perpetual market on BSC testnet plus a Vercel Preview. It does not deploy to mainnet, merge to `main`, or handle real customer funds. Mainnet requires a separate approval after testnet acceptance, independent smart-contract audit, and legal/compliance review.

## Non-negotiable safety properties

- The platform earns only the published execution fee: Maker 0%, Taker 1% of filled notional.
- User USDT principal is segregated custody. The administrator, guardian, relayer, revenue recipient, and upgrade paths cannot withdraw or transfer user liabilities.
- Revenue may receive only fees already earned by a completed fill. Fee-on-transfer, rebasing, false-return, malformed-return, and reentrant collateral tokens must not create an accounting surplus or deficit.
- Insurance is not platform revenue and cannot be withdrawn by an administrator.
- Long and short exposure is created only by two valid, opposite, crossing EIP-712 orders. No counterparty means no fill; partial fills are supported.
- Every position segment preserves its real paired counterparty. Realized profit comes only from the corresponding counterparty loss and, for an actual liquidation deficit, the insurance fund.
- Maximum leverage is 3x, isolated margin only. Initial margin is at least 33.34% of notional; maintenance margin is 20% plus applicable close fee.
- Liquidation triggers only when equity is strictly below maintenance requirement plus close fee. Equality is not liquidatable.
- Liquidation penalty is 1% of liquidated notional, capped by remaining account equity, split 80% liquidator and 20% insurance.
- Phase 1 has no ADL. Normal signed liquidation matching and the insurance fund are the only deficit paths. A later phase may add ADL only after an on-chain timed liquidation auction proves no normal counterparty accepted the order.
- Solvency is checked continuously: on-chain collateral must cover user balances, locked margin, claimable user funds, liquidation rewards, and insurance liabilities.
- No public method may mutate another account's balance or position except through an authenticated match, a valid liquidation, or settlement of an already-owned claim.

## Orders and matching

- EIP-712 domain binds chain ID and the immutable OrderBook address.
- Orders bind trader, side, quantity, limit price, leverage, nonce, deadline, reduce-only intent, and maker/taker role.
- Maker-role authorization prevents a relayer from swapping signatures to choose a different price or fee payer.
- Cancellation and cumulative partial-fill accounting are on-chain; fills cannot exceed signed quantity.
- Same-wallet, same-side, expired, wrong-chain, wrong-contract, malformed, replayed, non-crossing, and unauthorized-role orders revert atomically.
- A position may reference at most eight active paired lots. The ninth segment reverts before any partial state change. Closed lots are removed in O(1) or amortized bounded work; no unbounded historical scan is allowed.
- CloseOnly permits risk-reducing fills and blocks any exposure increase.

## Risk math

- Calculations use full-precision multiplication/division and explicit conservative rounding.
- Taker fee and margin debits round against the payer; credits never exceed corresponding debits. Rounding residuals are attributed to insurance, never platform revenue.
- Long and short PnL is zero-sum for a paired lot before explicit fees and bounded rounding.
- Positive realized PnL is used before insurance when paying close fees or liquidation penalties.
- Amounts that exceed an account's reusable-balance cap remain that user's separate claimable liability. They are not insurance, revenue, or reusable margin, and only that user may withdraw them.

## Oracle and market state

- Mark price is a 30-minute PancakeSwap V2 cumulative-price TWAP for BNBX/WBNB, converted through an independent BNB/USD feed.
- The observation chain requires at least 15 and 30 minutes of history; a one-minute spot manipulation must not materially replace the full-window price.
- Stale, deviating, malformed, short-return, long-return, invalidly encoded, reverting, or inconsistent dependencies transition reads and trading safely to CloseOnly rather than accepting a price.
- Timestamp and cumulative-price wraparound are handled according to Pancake V2 arithmetic.
- Neither administrator nor guardian can set a price.

## Funding

- Funding is forward-looking only and uses a cumulative funding index. A later trade or mark cannot retroactively reprice an earlier interval.
- The rate is capped at +/-0.30% per eight hours and accrues by actual elapsed seconds.
- Payers round up, recipients round down, and the bounded difference belongs to insurance.
- Long-inactive accounts settle in one bounded operation; stale funding cannot permanently block withdrawals, reduction, or liquidation.
- Position/index checkpoints are monotonic and cannot be moved backwards by interleaved account settlement.
- Only the immutable OrderBook may submit an oracle-validated future funding checkpoint. Reopening an already-current sweep cannot freeze an account.

## Governance and pause controls

- Guardian, ClearingHouse, and Oracle references are immutable.
- Safety actions are one-way risk reductions: enter CloseOnly and lower approved exposure/deviation limits.
- Returning to Open requires a newly queued action and at least 48 hours. Any new safety event invalidates every earlier queued reopen, including already-mature operations.
- There is no generic call/execute/delegatecall surface, arbitrary target, price setter, fee setter, leverage increase, collateral withdrawal, upgrade hook, fallback dispatcher, or receive-based command path.
- Permission-surface auditing works from canonical ABI signatures/selectors and runtime-bytecode behavior, including overloads, tuples, fallback, receive, and forwarding opcodes; it does not rely only on function names.

## Service and user interface

- The matching service relays signed orders but never holds custody keys and cannot change signed economic terms.
- Durable state covers order intake, cancellation, fill progress, idempotency, reorg-aware confirmation, and reconciliation with on-chain events.
- API boundaries are authenticated, rate-limited, schema-validated, and fail closed. Secrets stay server-side.
- `/futures` provides deposit, withdrawal, order entry, open orders, fills, isolated positions, margin, funding, liquidation state, CloseOnly status, and testnet warnings.
- UI is responsive and fully localized in Chinese, English, Korean, and Japanese. It never labels test assets as mainnet BNBX or USDT.

## Deployment gates

- Testnet uses explicit test BNBX and test USDT addresses fixed at deployment. Mainnet token addresses are documentation only in Phase 1.
- Contracts are non-upgradeable unless a later independently approved design changes this. Dependency addresses are immutable and cyclic dependencies are resolved with deterministic deployment, not setters.
- Every deployed runtime must be <= 24,576 bytes. Local Ganache unlimited-size settings are not deployment evidence.
- Verification includes targeted RED/GREEN evidence, the full existing regression suite, lint, typecheck, production build, bytecode-size audit, testnet source verification, and an acceptance run.
- Every reviewed milestone is pushed to `feat/bnbx-futures-phase-1` so local workspace cleanup cannot destroy the only copy.

