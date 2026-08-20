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

---

## Independent review fix round 1/5 (2026-08-14)

Status: PASS

Reviewed tree: `0ecc5b430be9d860b5405727efee05e751fe52a8`

Fix implementation commit: `cea87a8fffc36619f9c4302ff5ab9cd4a80ed264`

Exact-size supplemental test commit:
`bf42de997ec30d4a4b0b4f7c70b30809df8e1383`

### Changed files

- `packages/contracts/src/futures/OrderBook.sol`
  - The immutable Oracle provider must now have code at construction.
  - Construction probes `safeRead()` and accepts only a successful, exactly
    160-byte response whose first word is a valid `MarketState` enum value.
- `packages/contracts/test/FundingLiquidation.t.sol`
  - Added deployed invalid-provider fixtures and deterministic construction
    attempts.
  - Raised only the Task 6 fixture OI cap from 100 to 150 BNBX-notional units
    so a successful rising-mark short replacement is testable while retaining
    a separate literal cap-overflow case at 160.
  - Added a same-transaction helper for the exact 300-second Oracle boundary.
- `packages/contracts/test/OrderBook.t.sol`
  - Upgraded the legacy state-provider fixture to the canonical five-word
    `safeRead()` interface required by production construction.
- `packages/contracts/scripts/run-task-6-tests.mjs`
  - Corrected the liquidation-equality fixture and added complete rollback
    assertions.
  - Added successful short, replacement checkpoint, middle/tail queue,
    one-unit reward-rounding, exact Oracle-age, and outside-bound funding tests.
  - Expanded the gate to the complete Futures source/compiler-artifact
    manifests, every production ABI/runtime, generated prohibited selector
    probes, and repository service/UI/deployment inputs.

No production web/service/deployment file remains changed. The temporary web
export used to mutation-test the repository scan was restored before the fix
commit.

### ABI and construction changes

There are no new or removed production ABI selectors in this fix. The exact
OrderBook, ClearingHouse, RiskEngine, and FuturesOracle function-selector and
mutability maps remain gated.

OrderBook construction is intentionally stricter: a provider with no code, a
contract exposing only `marketState()`, a short `safeRead()` response, a long
response, a reverting response, or a first word outside enum values 0 and 1 is
rejected before the immutable is stored. A canonical five-word provider is
accepted. This is a deployment compatibility requirement, not a runtime
authority or upgrade path.

### Strict TDD and mutation RED evidence

Every mutation below was applied to the real production contract, exercised
through a deployed fixture, and restored before the corresponding GREEN. The
command was `pnpm --filter @bnbx/contracts test:funding-liquidation` unless an
alternate command is stated.

1. **Oracle immutable has no code**
   - Unsafe production behavior: omit provider code validation and accept an
     EOA that can never return the canonical read.
   - Initial RED: exit 1, `Error: OrderBook accepted no-code provider`.
   - Minimal production correction: include `marketStateProvider_.code.length`
     in the immutable dependency code gate.

2. **Oracle interface probe omitted**
   - Unsafe mutation: retain the code check but delete the constructor
     `_canonicalOracleInterface` rejection.
   - RED: exit 1,
     `Error: OrderBook accepted market-state-only provider`.
   - This separately proves the code-bearing legacy interface cannot pass.

3. **Oracle exact return size omitted**
   - Unsafe mutation: accept `success` plus the enum word without requiring
     `returndatasize() == 160`.
   - RED: exit 1, `Error: OrderBook accepted short-return provider`.
   - A second unsafe mutation weakened equality to `returnSize >= 160`; the
     then-current short/enum suite exited 0. Adding a deployed 192-byte provider
     REDed at `Error: OrderBook accepted long-return provider`.
   - Restoring exact equality produced final targeted GREEN at supplemental
     commit `bf42de997ec30d4a4b0b4f7c70b30809df8e1383`.

4. **Oracle enum validation omitted**
   - Unsafe mutation: accept a successful 160-byte response without checking
     the first word.
   - RED: exit 1, `Error: OrderBook accepted invalid-enum provider`.

5. **Legacy fixture compatibility**
   - After the production constructor fix, exact command
     `pnpm --filter @bnbx/contracts test:order-book` initially REDed during
     `OrderBookTest.setUp` because its provider exposed only `marketState()`.
   - Adding the canonical five-word test-provider read produced exit 0 with all
     23 OrderBook behaviors plus its ABI/runtime gate.

6. **Strict liquidation equality**
   - Reviewer mutation: change RiskEngine eligibility `<` to `<=`.
   - The old entry-4/mark-4 test suite incorrectly exited 0 because the
     zero-PnL path rejected before the comparator.
   - The replacement literal fixture opens at entry 6 with 3x margin 3 and
     marks at 5: loss 1, equity 2, and
     `ceil(20% * 5) + ceil(1% * 5) = 2`.
   - RED against `<=`: exit 1,
     `Error: maintenance-plus-fee equality was liquidated`.
   - GREEN against `<`: equality reverts with the lot, all three net
     quantities/queues, every custody bucket and total, OI, token balances,
     next lot ID, funding checkpoint, and nonce unchanged. Mark 4, exactly one
     equity unit below the requirement, succeeds with the same authorization.

7. **Zero-only funding outside the mathematical RiskEngine bound**
   - Unsafe mutation: reject only nonzero rates inside `[-30, 30]`, accepting
     larger caller-supplied values.
   - The old `[1, 30, -1, -30]` matrix exited 0.
   - Adding literal `31` and `-31` REDed with
     `Error: nonzero funding rate 31 was accepted`.
   - Restoring rejection of every nonzero value produced GREEN without moving
     index, checkpoint, or custody.

8. **Liquidator reward must round down**
   - Unsafe mutation: round the 80% share upward.
   - The old suite exited 0 because its nonzero penalty was divisible by 5.
   - A deployed entry-7/mark-6 liquidation creates an exact one-unit penalty.
   - RED: exit 1 with state beginning reward 1 / insurance 0 rather than the
     independent expected reward 0 / insurance 1.
   - GREEN also asserts all three accounts' available/locked/claimable,
     matched OI 6, and exact fee revenue 2.

9. **Fee-before-penalty waterfall**
   - Unsafe mutation: take the liquidation penalty before collecting the close
     fee from positive target proceeds.
   - The preexisting literal partial-fee case REDed at
     `Error: unpaid close fee/penalty was not waived from only positive proceeds`.
   - Restoring PnL, then capped fee, then capped penalty produced GREEN.

10. **Successful short replacement orientation and accounting**
    - Unsafe reviewer mutation: add, rather than subtract, the short
      replacement Maker's net quantity.
    - The old suite exited 0 because the only rising-mark short path reverted
      at the OI cap before replacement.
    - The new mark-120 case stays below the 150 cap. RED showed target 0,
      survivor +1, and corrupted replacement +1 instead of literal -1.
    - GREEN asserts long=survivor, short=new Maker, all three nets and queues,
      target/survivor/Maker margins, 120 OI, target proceeds, survivor-owned
      20-unit cap spill, exact 0.96 reward / 0.24 insurance / 2.2 revenue, and
      the current zero-index replacement checkpoint.

11. **Replacement checkpoint initialization**
    - Unsafe reviewer mutation: delete the new lot's funding-index/timestamp
      assignments.
    - The suite without a replacement checkpoint assertion exited 0.
    - Adding the assertion REDed in the successful short case because the new
      lot returned timestamp zero rather than `fundingUpdatedAt`.
    - Restoring both assignments produced GREEN.

12. **Bounded middle/tail removal**
    - Unsafe reviewer mutation: replace `_removeLot` with FIFO-only `_popLot`
      during liquidation.
    - The old suite exited 0 because every completed liquidation removed a
      head lot.
    - A three-quarter-lot queue now liquidates the middle original lot and then
      the tail original lot. RED: exit 1,
      `Error: middle-lot liquidation reverted`.
    - GREEN asserts target `[oldHead]`, survivor
      `[oldHead, firstReplacement, secondReplacement]`, replacement Maker
      `[firstReplacement, secondReplacement]`, deleted old records, counts
      1/3/2, nets +0.25/-0.75/+0.5, and exact OI 62.5.

13. **Oracle exact freshness boundary**
    - Unsafe mutation: reject age `>= 300` rather than only age `> 300`.
    - The old stale-age-301 case exited 0.
    - A deployed helper writes age exactly 300 and liquidates in the same
      transaction. RED: exit 1,
      `Error: exactly 300-second-old Oracle read was rejected`.
    - Restoring the inclusive valid boundary produced GREEN; age 301 remains
      rejected.

14. **Normal open checkpoint initialization**
    - Unsafe mutation: delete the normal lot's funding-index/timestamp writes.
    - The existing deployed monotonic test REDed at
      `Error: new lot inherited a stale funding interval retroactively`.
    - Restoration produced GREEN, including the bounded 31-hour settlement.

15. **Complete source/artifact manifest**
    - Unsafe repository mutation: add a sixth file,
      `src/futures/UnexpectedSurface.sol`.
    - RED: exit 1 with an exact source-manifest mismatch listing the unexpected
      file. The file was deleted via patch and the gate returned GREEN.

16. **Service/UI/deployment absence scan**
    - Unsafe repository mutation: temporarily export a prohibited automatic
      deleveraging function from `apps/web/lib/deployments.ts`.
    - RED: exit 1 identifying that exact deployment input and identifier.
    - The export was removed immediately; `git diff` confirmed the production
      web file was fully restored.

### GREEN commands and results

- `pnpm --filter @bnbx/contracts test:funding-liquidation`
  - Exit 0 after final restoration.
  - 16 deployed behavior PASS lines plus 1 exact
    ABI/runtime/source/artifact/repository gate.
- `pnpm --filter @bnbx/contracts test:futures`
  - Exit 0, 4/4 Task 1 tests.
- `pnpm --filter @bnbx/contracts test:risk-engine`
  - Exit 0, 10/10 behaviors plus exact ABI/permission gate.
- `pnpm --filter @bnbx/contracts test:clearing-house`
  - Exit 0, 35/35 behaviors plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test:order-book`
  - Exit 0, 23/23 behaviors plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test:futures-oracle`
  - Exit 0, 35/35 Oracle progression, math, dependency, boundary,
    constructor, and integration behaviors plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test`
  - Exit 0.
  - Compiler-input phase: 8/8.
  - Enhanced Task 6 phase: 17 PASS lines.
  - Complete EVM/artifact matrix: unchanged `PASS_COUNT 247`, including
    `GraduationTarget.18BNB`.
  - This complete run followed the production fix commit. The later
    supplemental commit changed only the invalid Oracle test fixture/matrix;
    the final exact-tree Task 6 target was rerun exit 0 and production bytecode
    remained identical.
- `pnpm exec prettier --check packages/contracts/scripts/run-task-6-tests.mjs`
  - Exit 0, all matched.
- `git diff --check`
  - Exit 0.

Ganache emitted its known optional `uws` native-module warning in every EVM
command and used the JavaScript fallback. No test failure or semantic warning
resulted.

### Exact artifact, ABI, runtime, and absence gates

- Exact recursive Futures source manifest: 5 files.
- Exact compiler artifact manifest: 7 artifacts across those 5 sources,
  including the two OrderBook interfaces and FuturesTypes library.
- Exact function selector/mutability maps: OrderBook, ClearingHouse,
  RiskEngine, and FuturesOracle.
- Fallback/receive absence: every artifact ABI and deployed empty-calldata
  calls.
- Generated prohibited surface matrix: 14 decoded authority/deleveraging names
  crossed with 12 bounded argument shapes (168 selectors), scanned in all 7
  artifact runtimes and called against deployed OrderBook, ClearingHouse, and
  RiskEngine.
- Repository input scan: 280 Solidity/script/package/service/UI/deployment
  files under the current bounded roots.
- Phase 1 Futures deployment manifest: exactly empty; adding a Futures
  deployment/artifact input fails the gate.

Solidity 0.8.30, optimizer 200 runs, Shanghai deployed runtimes:

- OrderBook: 18,974 bytes.
- ClearingHouse: 11,637 bytes.
- RiskEngine: 1,788 bytes.
- FuturesOracle: 6,731 bytes.

All four remain below the 24,576-byte EIP-170 limit.

### Security, solvency, and mutation-sensitive self-review

- **Immutable authentication:** the provider address is nonzero, has code, and
  must return one canonical exact-size/enum-safe read during deterministic
  construction. The dependency remains immutable; no setter, owner, proxy,
  fallback, or generic execution route was introduced.
- **Replay/authentication:** signed replacement target, side, exact full
  quantity, limit, leverage, nonce, deadline, chain, and verifying contract
  remain bound. Wrong-role/wrong-domain signatures, cancellation, reuse, and
  reverted attempts remain mutation-covered.
- **Eligibility equality:** the new losing-PnL fixture necessarily reaches the
  strict comparator. Equality is ineligible; one unit lower succeeds.
- **Waterfall:** isolated target margin absorbs loss; actual deficit alone may
  consume insurance; remaining positive proceeds pay the capped close fee
  first, then the capped 1% penalty; reward is floor 80%, with the residual
  owned by insurance. No waived amount reaches unrelated available or
  insurance custody.
- **Ownership:** successful long and short cases independently assert target
  proceeds, survivor new margin/profit, replacement Maker fresh margin,
  liquidator reward, insurance residual, and revenue. Cap spill remains the
  survivor's owner-only claimable balance.
- **Atomic rollback:** equality, insufficient insurance, Maker funds, OI cap,
  authentication, and token transfer failures preserve nonce, old lot and
  queue, all net quantities, funding state, liability totals, matched OI,
  insurance/reward, and collateral balances.
- **Funding:** all nonzero values, including `+/-31`, revert before timestamp or
  custody changes. Normal and replacement checkpoints start at the current
  zero index/timestamp and advance monotonically. Stale settlement remains O(1)
  and cannot freeze.
- **Boundedness/liveness:** complete liquidation examines and shifts at most
  eight queue slots. Direct middle/tail success proves head-only liveness was
  not accidentally assumed. The short branch has OI headroom and completes.
- **Oracle boundaries:** construction rejects no-code/reverting/short/long/
  invalid-enum providers; runtime liquidation accepts age exactly 300 and
  rejects 301, CloseOnly, zero, future, and malformed values.
- **Solvency:** the fix changes no ClearingHouse production accounting.
  Literal successful-short and one-unit-rounding states reconcile available,
  locked, claimable, reward, insurance, revenue, OI, and token custody; every
  path still ends at the existing continuous solvency assertion.
- **No prohibited deleveraging:** exact source and artifact manifests,
  repository identifier scans, ABI maps, raw runtime selector scans, deployed
  calls, empty calldata, and the empty deployment manifest provide no such
  production or integration surface.

### Concerns

- Construction now deliberately rejects legacy market-state-only providers;
  deployers must supply the canonical five-word `safeRead()` interface. The
  legacy test fixture was upgraded, while a dedicated invalid fixture preserves
  rejection coverage.
- Phase 1 still intentionally accepts only zero funding. Enabling nonzero
  funding remains a separately reviewed future design.
- Ganache's optional native `uws` binary is unavailable for this Node build;
  the documented JavaScript fallback affects speed only.

---

## Independent review fix round 2/5 (2026-08-14)

Status: PASS

Reviewed tree: `342a106e426e5c1ab11badd4cef19aa12ca6c46e`

Gate fix commit: `35a59ac69f810910dfc0f34e8c2943bc36f1be29`

### Finding and bounded correction

The round-1 repository gate covered Futures Solidity, contract scripts,
selected web source directories, and package manifests, but omitted two tracked
integration inputs:

- `packages/contracts/deployments/bsc-testnet.json`
- `packages/chain-config/src/index.ts`

Only `packages/contracts/scripts/run-task-6-tests.mjs` changed. The bounded
text-input universe is now:

- `packages/contracts/src/futures`
- `packages/contracts/scripts`
- `packages/contracts/deployments`
- the complete `packages/chain-config` package
- the complete `apps/web` application
- `packages/contracts/package.json`

The recursive collector continues to accept only Solidity, JavaScript,
TypeScript, TSX, and JSON inputs. It explicitly excludes generated/vendor
directories `node_modules`, `.next`, `.turbo`, `coverage`, `dist`, and `out`.
Binary public assets and unrelated contract source/test trees remain outside
the bounded integration universe.

The exact Futures source, compiler artifact, ABI/mutability, runtime-size,
fallback/receive, generated forbidden-selector, deployed-call, and empty Phase
1 deployment-manifest gates are unchanged.

### Mutation-first evidence

Unsafe mutation for both cases: add a prohibited automatic deleveraging
identifier to a tracked deployment/integration input. This would let a
production integration expose a mechanism that the Phase 1 absence gate
claims cannot exist.

Exact command for every RED/GREEN cycle:

`pnpm --filter @bnbx/contracts test:funding-liquidation`

#### Previously omitted deployment manifest

1. Added JSON entry `FuturesADL` to
   `packages/contracts/deployments/bsc-testnet.json` while the old gate was
   unchanged.
2. Observed false-negative baseline: exit 0, all 17 Task 6 PASS lines, and the
   final gate reported only `280 repository inputs`.
3. Added `packages/contracts/deployments` to the bounded recursive inputs.
4. Reapplied the identical mutation.
5. Observed required RED: exit 1 with the exact path:
   `Error: packages/contracts/deployments/bsc-testnet.json contains prohibited Futures identifier FuturesADL`.
6. Restored the JSON via patch. `git diff` showed no remaining change to the
   deployment manifest.

#### Previously omitted chain configuration

1. Exported `FuturesADL` from `packages/chain-config/src/index.ts` while the old
   gate was unchanged.
2. Observed false-negative baseline: exit 0, all 17 Task 6 PASS lines, and the
   final gate again reported only `280 repository inputs`.
3. Added the complete `packages/chain-config` package to the bounded recursive
   inputs.
4. Reapplied the identical mutation.
5. Observed required RED: exit 1 with the exact path:
   `Error: packages/chain-config/src/index.ts contains prohibited Futures identifier FuturesADL`.
6. Restored the TypeScript file via patch. `git diff` showed no remaining
   change to chain configuration.

The web scan was simultaneously made complete at the application-package
boundary rather than enumerating only `app`, `components`, and `lib`. The
extension and generated/vendor exclusions keep this expansion bounded to real
service/UI/integration text inputs.

### GREEN and regression evidence

- `pnpm --filter @bnbx/contracts test:funding-liquidation`
  - Exit 0 after both tracked fixtures were restored.
  - 16 deployed behavior PASS lines plus the exact gate.
  - Gate inventory: 5 Futures sources, 7 compiler artifacts, and 288 bounded
    repository inputs.
  - Runtime sizes unchanged: OrderBook 18,974; ClearingHouse 11,637;
    RiskEngine 1,788; FuturesOracle 6,731 bytes.
- `node --test scripts/verification-compiler-input.test.mjs`
  - Exit 0, 8/8.
- `pnpm test:risk-engine`
  - Exit 0, 10/10 behaviors plus exact permission/ABI gate.
- `pnpm test:clearing-house`
  - Exit 0, 35/35 behaviors plus exact ABI/runtime gate.
- `pnpm test:order-book`
  - Exit 0, 23/23 behaviors plus exact ABI/runtime gate.
- `pnpm test:futures-oracle`
  - Exit 0, 35/35 Oracle behaviors plus exact ABI/runtime gate.
- `pnpm --filter @bnbx/contracts test`
  - Exit 0 from the final restored tree.
  - Compiler-input phase 8/8.
  - Task 6 phase 17 PASS lines with 288 repository inputs.
  - Complete EVM/artifact matrix passed through
    `GraduationTarget.18BNB` (unchanged `PASS_COUNT 247`).
- `pnpm exec prettier --write packages/contracts/scripts/run-task-6-tests.mjs`
  - File already matched formatting.
- `git diff --check`
  - Exit 0.

### ABI, runtime, security, and concerns

- No production contract, ABI, bytecode, runtime size, custody, accounting,
  authority, funding, liquidation, or Oracle behavior changed.
- The actual tracked deployment and chain-configuration inputs are now scanned
  by the same behaviorally mutation-proven identifier gate as Futures sources,
  service code, UI code, and deployment scripts.
- Both mutation targets were restored byte-for-byte before GREEN and are absent
  from the committed diff.
- The Phase 1 Futures deployment manifest remains exactly empty and no
  prohibited deleveraging surface exists in the 288-input bounded universe.
- The known optional Ganache `uws` warning remains test-performance-only; every
  required command exited 0.
