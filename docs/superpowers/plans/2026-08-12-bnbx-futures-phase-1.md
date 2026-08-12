# BNBX Futures Phase 1 — Recovered Implementation Plan

> Execute with subagent-driven development and strict RED -> GREEN -> REFACTOR. Each task requires an implementer report, independent spec/quality review, fresh verification, a commit, and a push to `origin/feat/bnbx-futures-phase-1` after the review is clean.

## Global constraints

- The confirmed design at `docs/superpowers/specs/2026-08-12-bnbx-futures-phase-1-design.md` is binding.
- Maker 0%; Taker 1%. Maximum leverage 3x. Initial margin >=33.34%. Maintenance margin 20% plus close fee. Liquidation penalty 1%, capped by equity, split 80/20.
- Phase 1 ADL is completely disabled: no module, selector, callback, claim, UI, deployment entry, or misleading documentation.
- User collateral, claimable funds, liquidation rewards, insurance, and earned revenue are separate liabilities. No administrator withdrawal path exists for user or insurance funds.
- BSC testnet and Vercel Preview only. No mainnet deployment, `main` merge, or real-money launch.
- Solidity 0.8.30, optimizer 200, Shanghai EVM, solc-js + Ganache repository harness. Runtime bytecode <=24,576 bytes.
- Immutable dependencies; no upgrade proxy or post-deploy address setter. Use deterministic addresses where construction order is cyclic.
- All tests use independent literal expectations and real behavior. Every production behavior change must have observed RED evidence before implementation.

## Task 1: Restore test harness and shared order types

Add isolated Futures compilation/test registration to `packages/contracts/scripts/run-evm-tests.mjs`, shared enums/structs/EIP-712 type hashes, and minimal mocks needed by later tasks. `MarketState` defaults to `CloseOnly`; `Side` is `Long=0`, `Short=1`. Add known-vector hashing tests and a dedicated targeted-suite command without changing existing suites.

## Task 2: Deployable pure RiskEngine

Implement an independent, stateless, ownerless RiskEngine contract with full-precision conservative math for fees, initial/maintenance margin, long/short PnL, funding rounding, liquidation eligibility, and capped penalties. Test overflow extremes and equality boundaries. It must be a deployable immutable dependency, not an internal library.

## Task 3: USDT custody and solvency accounting

Implement ClearingHouse custody with separated available balance, locked isolated margin, user claimable liability, liquidation rewards, insurance liability, and earned revenue transfers. Test exact balance deltas, false/no-return/fee-on-transfer/reentrant tokens, unauthorized wallets, deposit/account/open-interest caps, withdrawal safety, and continuous solvency. Resolve immutable dependency cycles by deterministic deployment.

## Task 4: EIP-712 OrderBook and paired lots

Implement cancellation, role-bound Maker/Taker signatures, partial fills, nonces, deadlines, crossing-price rules, CloseOnly/reduce-only behavior, fee attribution, and paired FIFO lots capped at eight active segments. Tests cover replay, role swap, chain/domain mismatch, same wallet/side, overfill, atomic ninth-lot failure, bounded closed-lot removal, multi-lot close, and zero-sum settlement.

## Task 5: Pancake TWAP oracle and CloseOnly degradation

Implement 30-minute Pancake cumulative-price TWAP plus independent BNB/USD validation, 15/30-minute observations, wraparound arithmetic, deviation/staleness rules, and low-level bounded return-data decoding. Any invalid dependency enters CloseOnly without accepting attacker-controlled data. Test one-minute manipulation, reversed pair, malformed returns, stale/future timestamps, recovery after a full valid window, and full-precision conversion.

## Task 6: Forward-only funding, liquidation, and insurance

Implement cumulative-index funding with monotonic per-position checkpoints, actual elapsed seconds, +/-0.30% per eight-hour cap, bounded one-operation catch-up, and payer/recipient rounding. Implement authenticated liquidation matching, positive-PnL-first fee/penalty payment, real deficits, 80/20 reward split, insurance support, and atomic rollback when unsupported. Excess account credits become owner-only claimable liabilities. Remove every ADL surface and test absence through behavior/ABI/bytecode artifacts.

## Task 7: 48-hour governance safety delay and permission audit

Implement immutable guardian/Clearing/Oracle references, immediate CloseOnly and one-way limit reductions, and a 48-hour delayed reopen. A new safety epoch invalidates every older queued reopen even if already mature. Add selector-level and runtime-behavior auditing that covers canonical overloaded/tuple signatures, fallback, receive, delegatecall/call forwarding, generic execution, arbitrary targets, fee/leverage/price setters, upgrades, and withdrawals. Test real effects of each permitted operation.

## Task 8: Deterministic deployment and bytecode gates

Add Futures-specific compile, deterministic-address deployment fixture, EIP-170 runtime-size audit, forbidden-selector audit, and stale-artifact cleanup. All modules must compile independently and every artifact must bind constructor arguments and source hashes. Test that prior artifacts cannot make a removed module (especially ADL) appear present.

## Task 9: Matching and keeper service core

Create pure server-side modules for order validation, idempotent intake, cancellation/fill state, fair price-time matching, partial-fill persistence, on-chain submission, confirmation/reorg reconciliation, funding checkpoint submission, and liquidation candidate processing. Relayers cannot change signed economics or custody funds. Add deterministic service tests for retries, duplicates, stale orders, concurrency, and reorgs.

## Task 10: Authenticated Futures APIs

Add testnet-only authenticated and rate-limited API routes for market status, orders, cancellations, fills, positions, collateral intents, and keeper health. Validate schemas and chain/domain identity, keep secrets server-only, bound RPC calls, and return stable localized error codes. API writes are disabled outside configured Preview/testnet environments.

## Task 11: Responsive four-language Futures UI

Add `/futures` with explicit TESTNET labeling, wallet/chain gating, deposit/withdraw, Maker/Taker order entry, open orders, fills, isolated positions, margin ratio, funding, liquidation risk, oracle health, and CloseOnly state. Keep desktop/mobile behavior equivalent and localize Chinese, English, Korean, and Japanese. Never display test assets as mainnet assets.

## Task 12: BSC testnet deployment and source verification

Add dedicated preflight, deploy, verify, and acceptance scripts using explicit test BNBX/test USDT addresses, chainId 97, deterministic dependencies, source verification, deployed bytecode-size checks, and no mainnet defaults. Produce a deployment manifest only after dry-run tests. Deployment requires available configured testnet credentials and owner approval; otherwise stop with a complete command/runbook and do not fabricate addresses.

## Task 13: Whole-branch verification, Preview, and audit package

Run targeted Futures suites, full workspace test/lint/typecheck/build, source/selector/size audits, and testnet acceptance. Conduct a most-capable independent whole-branch security review and one bounded fix wave. Push the final branch, open a Draft PR, and create a Vercel Preview. Deliver the PR/Preview links, commit range, test counts, deployed testnet addresses if actually deployed, source-verification status, known risks, and an auditor-ready package. Do not merge or deploy mainnet.

