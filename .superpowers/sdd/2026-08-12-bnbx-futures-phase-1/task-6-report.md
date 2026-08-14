# Task 6 report: forward-only funding, liquidation, and insurance

Status: PASS

Implementation commit: `564eb0884f12f6bf34d9ca984a47e45a66f88860`

## Changed files

- `packages/contracts/src/futures/FuturesTypes.sol`
  - Added the liquidation-specific EIP-712 payload and type hash.
- `packages/contracts/src/futures/OrderBook.sol`
  - Added zero-rate cumulative-index/checkpoint infrastructure.
  - Added authenticated full-lot liquidation, current Oracle validation, bounded lot replacement, cancellation, and nonce replay protection.
- `packages/contracts/src/futures/ClearingHouse.sol`
  - Added one atomic old-lot settlement/new-pair custody operation with the required deficit, fee, penalty, reward, insurance, and owner-cap waterfall.
- `packages/contracts/test/FundingLiquidation.t.sol`
  - Added the deterministic deployed fixture and mutable Oracle test dependency.
- `packages/contracts/scripts/run-task-6-tests.mjs`
  - Added the dedicated deployed behavior matrix plus exact ABI, runtime-size, fallback/receive, and forbidden-selector gates.
- `packages/contracts/scripts/run-evm-tests.mjs`
  - Updated the canonical ClearingHouse and OrderBook ABI gates for the Task 6 surface.
- `packages/contracts/package.json`
  - Registered `test:funding-liquidation` and included it in the full contracts test command.
- `.superpowers/sdd/2026-08-12-bnbx-futures-phase-1/task-6-report.md`
  - This report.

## ABI changes

OrderBook additions:

- `0x55561485 checkpointFunding(int256)`
- `0x68340ac2 settleFunding(uint64)`
- `0x7072725e cumulativeFundingIndex()`
- `0x1468f61a fundingUpdatedAt()`
- `0xa46ca44f lotFundingCheckpoint(uint64)`
- `0xb999868b liquidationOrderHash((address,address,uint8,uint128,uint128,uint8,uint64,uint64))`
- `0xe9b5c3a0 cancelLiquidationOrder((address,address,uint8,uint128,uint128,uint8,uint64,uint64))`
- `0x94c8faf0 liquidate(uint64,(address,address,uint8,uint128,uint128,uint8,uint64,uint64),bytes)`
- `0x9089c6fc liquidationNonceUsed(address,uint64)`
- `0x64a20a0e liquidationNonceCancelled(address,uint64)`

ClearingHouse addition:

- `0xaeab7e82 liquidateAndReplace((address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256))`

The dedicated gate compares the complete function-selector/mutability maps, rejects fallback/receive entries, checks deployed behavior for every forbidden selector, and checks raw runtime dispatch artifacts.

## Strict TDD evidence

All expected values in the Task 6 behavior matrix are independent integer literals. The tests deploy the real OrderBook, ClearingHouse, RiskEngine, collateral token, and Oracle-shaped dependency; signatures use independent viem EIP-712 hashing and live private keys.

### RED 1: funding surface absent

Unsafe mutation targeted: a missing forward checkpoint surface, or a fallback accidentally accepting it.

Command:

`pnpm --filter @bnbx/contracts test:funding-liquidation`

Observed result: exit 1. The deployed `fundingUpdatedAt()` call, selector `0x1468f61a`, reverted because the production funding surface did not exist.

### RED 2: new lot inherits a stale interval

Unsafe mutation targeted: opening a new lot without first advancing the forward-only global checkpoint, which would permit a later rate to charge a pre-open interval.

Command:

`pnpm --filter @bnbx/contracts test:funding-liquidation`

Observed result: exit 1 after the zero-rate global checkpoint behavior passed:

`Error: new lot inherited a stale funding interval retroactively`

The fixture forced a 123-second gap before the signed match. Minimal production correction advanced the zero-rate checkpoint atomically before matching.

### RED 3: liquidation surface absent

Unsafe mutation targeted: no authenticated, current-Oracle, atomic full-lot replacement path.

Command:

`pnpm --filter @bnbx/contracts test:funding-liquidation`

Observed result: exit 1 after both funding behaviors passed:

`Error: valid positive-equity liquidation reverted`

The deployed liquidation selector was absent. Minimal production code then added the typed authorization, validation, bounded lot replacement, and one ClearingHouse custody transition.

## GREEN evidence

### Dedicated Task 6

Command:

`pnpm --filter @bnbx/contracts test:funding-liquidation`

Result: exit 0, 12/12 named behavior/artifact gates passed:

1. Zero-rate full-elapsed catch-up and all nonzero inputs rejected.
2. Monotonic, O(1) per-lot checkpoint settlement after more than 31 hours.
3. Positive-PnL-first fee/penalty waterfall, exact 80/20 split, and owner cap spill.
4. Partial close-fee collection with the unpaid portion waived.
5. Actual deficit-only insurance, insufficient-insurance rollback, and same-signature retry.
6. Strict liquidation eligibility equality boundary.
7. Open/current/nonzero Oracle and EIP-712 signer/domain/role/expiry/limit/cancellation failures.
8. Replacement Maker fresh-available-only margin.
9. Replacement open-interest cap atomicity.
10. Cross-lot nonce replay rejection.
11. Exact collateral fee-transfer failure rollback.
12. Exact ABI/runtime/forbidden-selector/fallback/receive gates.

### Fresh prerequisite regressions

- `pnpm --filter @bnbx/contracts test:futures`: exit 0, 4/4 Task 1 tests.
- `pnpm --filter @bnbx/contracts test:risk-engine`: exit 0, 10/10 tests plus exact ABI gate.
- `pnpm --filter @bnbx/contracts test:clearing-house`: exit 0, 35/35 tests plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test:order-book`: exit 0, 23/23 tests plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test:futures-oracle`: exit 0, 35/35 progression, dependency, constructor, and integration tests plus exact ABI/runtime gate.

### Full contracts regression

Exact command:

`pnpm --filter @bnbx/contracts test`

Result: exit 0. The Node compiler-input phase passed 8/8 with 0 failures. The Task 6 plus complete EVM/artifact matrix emitted `PASS_COUNT 247`, including `GraduationTarget.18BNB`.

Formatting and diff gates:

- `git diff --check`: exit 0.
- `pnpm exec prettier --check packages/contracts/package.json packages/contracts/scripts/run-evm-tests.mjs packages/contracts/scripts/run-task-6-tests.mjs`: all matched.

## Runtime sizes

Solidity 0.8.30, optimizer enabled with 200 runs, Shanghai EVM:

- OrderBook deployed runtime: 18,974 bytes.
- ClearingHouse deployed runtime: 11,637 bytes.
- RiskEngine deployed permission gate: passed.
- FuturesOracle deployed runtime regression: 6,731 bytes.

OrderBook and ClearingHouse are each below the 24,576-byte EIP-170 maximum.

## Security, custody, and solvency reasoning

- Funding is forward-only. Construction, every signed match, explicit checkpointing, per-lot settlement, and liquidation advance a timestamp checkpoint in O(1). New/replacement lots start at the current timestamp/index. A reverting operation rolls this advancement back.
- The Phase 1 cumulative funding index is exactly zero. Every state-mutating nonzero funding input, including values inside the mathematical +/-30 bps bound, reverts before any checkpoint or custody change. The reviewed RiskEngine helper remains pure math and has no authority to transfer equity.
- Liquidation authorization has its own EIP-712 type hash and binds Maker, target trader, side, full quantity, limit, leverage, nonce, and deadline to chain ID and the immutable OrderBook address. A normal Maker signature is not a liquidation signature.
- Only a current `Open` `safeRead` is accepted. Zero marks, marks outside `uint128`, future/zero timestamps, and reads older than five minutes fail closed. The signed long/short limit must accept the exact Oracle mark.
- Eligibility is computed from the target's isolated old-lot margin plus its mark PnL. Equality with maintenance margin plus close fee is not liquidatable.
- Only a complete old lot is accepted. Removal/shifting is bounded by the eight-lot queue, and the replacement creates exactly one new lot at the Oracle mark.
- The survivor's new minimum margin and any owner credit are sourced only from that old lot's released margin/PnL proceeds. No survivor available balance is debited. If reusable equity would exceed the cap, only that same owner's available/excess credit is reclassified to owner-only claimable liability.
- The replacement Maker's margin is debited only from that Maker's fresh `available` balance. Reclassification from available to locked preserves total liabilities.
- An actual target loss beyond target margin is the only insurance debit. Insufficient insurance reverts the whole operation. Positive target proceeds pay the close fee first, capped at those proceeds; unpaid fee is waived. The 1% penalty then caps at the remaining positive proceeds and splits 80% to the caller's liquidation-reward liability and 20% back to insurance.
- Fee revenue leaves custody through the existing exact before/after token-delta check. A false-return transfer rolls back nonce, funding checkpoint, lots, positions, liabilities, insurance, rewards, open interest, and token effects.
- All paths finish with the ClearingHouse solvency assertion. Insurance remains a liability and has no revenue/admin withdrawal path.
- Existing standalone reviewed ClearingHouse primitives remain immutable-OrderBook-only. The production OrderBook exposes no arbitrary forwarding or generic execution method.

## Mutation-sensitive review

- Authentication: wrong signer, wrong chain, wrong contract, normal-order role reuse, malformed economics, expiry, cancellation, and non-crossing limit all fail before state change.
- Replay: a used liquidation nonce cannot be replayed against a second otherwise matching live lot; reverted attempts do not consume it.
- Eligibility: changing strict `<` to `<=` fails the literal 4/4 equality fixture; the one-unit-lower mark succeeds.
- Fee/penalty/deficit waterfall: independent literal balances fail on fee-before-PnL, penalty-before-fee, insurance-paid fee/penalty, non-deficit insurance, or wrong 80/20 rounding.
- Ownership: survivor exact-lot proceeds, replacement fresh margin, target proceeds, reward owner, insurance share, and cap-spill owner are asserted independently.
- Cap spill: 25e18 and 40e18 survivor profits spill to that survivor's claimable liability in the positive and deficit fixtures respectively.
- Rollback: insufficient insurance, insufficient Maker margin, OI cap, equality, authentication, and collateral fee-transfer failures preserve lots, nonce, checkpoint, OI, token balance, and ClearingHouse totals.
- Zero funding/checkpoints: four positive/negative nonzero rates revert; a 17-hour global catch-up and 31-hour per-lot catch-up remain index zero, O(1), and custody-neutral; repeated settlement is monotonic and cannot freeze the lot.
- Boundedness: liquidation removes one complete lot with at most eight queue slots examined/shifted and creates one replacement lot; no history scan exists.
- Fallback/receive/authority: exact ABI maps and deployed empty/forbidden calls reject generic ownership, upgrade, forwarding, withdrawal, and prohibited liquidation surfaces.
- Prohibited deleveraging: no source contract, ABI entry, dispatch selector, fallback route, artifact contract, or test/deployment input exposes such a mechanism. Five raw prohibited selectors are absent from both runtimes and revert behaviorally.

## Concerns

- Ganache prints a known optional `uws` native-module compatibility warning and falls back to its JavaScript implementation. All commands still exited 0; this affects test performance, not results.
- Phase 1 intentionally leaves the cumulative funding index at zero. Activating any nonzero rate later requires a separate trustless authenticated rate-source design and new review; this implementation deliberately provides no administrative/caller-supplied activation path.
