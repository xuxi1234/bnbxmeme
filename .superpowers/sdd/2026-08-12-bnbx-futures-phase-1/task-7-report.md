# Task 7 report: governance safety delay and permission audit

## Status and commits

- Status: COMPLETE
- Reviewed base: `df0174a92de9a9b96a6914c934e59731818fa8a9`
- Implementation commit: `9bf2d53d3a28d5c4e0a53d80822aa6a204cfc2ee`
- Branch: `feat-bnbx-futures-phase-1-sync`
- Scope: local implementation and verification only; no push, PR, deployment, or main-branch mutation.

## Changed files

- `packages/contracts/src/futures/SafetyController.sol`
  - Adds the dedicated immutable guardian/ClearingHouse/FuturesOracle controller.
  - Adds typed immediate force-close and four strictly one-way limit reductions.
  - Adds epoch-bound reopen queueing and permissionless execution at the 48-hour boundary.
- `packages/contracts/src/futures/FuturesOracle.sol`
  - Adds only `clearForcedClose()`, authorized exclusively to the immutable Oracle `guardian` (the SafetyController in the cyclic deployment).
- `packages/contracts/scripts/run-task-7-tests.mjs`
  - Adds deployed behavior, atomicity, deterministic wiring, recovery, exact ABI, runtime permission, opcode, size, and solvency tests.
- `packages/contracts/scripts/run-task-6-tests.mjs`
  - Keeps the whole-repository Task 6 gate exact while adding the sixth futures source/eighth artifact, SafetyController ABI/runtime audit, and Oracle unlatch selector.
- `packages/contracts/scripts/run-evm-tests.mjs`
  - Updates the affected Oracle exact ABI gate for the single new controller-only selector.
- `packages/contracts/package.json`
  - Adds `test:safety-controller` and includes Task 7 in the full contracts test command.
- `.superpowers/sdd/2026-08-12-bnbx-futures-phase-1/task-7-report.md`
  - This report (report-only follow-up commit; its SHA is returned with the task handoff because a commit cannot contain its own hash).

## Design and security reasoning

### Immutable cyclic wiring

The production controller constructor binds `guardian`, `clearingHouse`, and `oracle` as immutables. It rejects zero addresses, dependencies without code, and dependencies whose immutable backreferences do not equal the controller under construction:

- `ClearingHouse.safetyController() == address(this)`
- `FuturesOracle.guardian() == address(this)`

The deployed test predicts four sequential CREATE addresses, then deploys in this deterministic order:

1. ClearingHouse with predicted OrderBook and predicted SafetyController.
2. FuturesOracle with predicted SafetyController as its immutable guardian.
3. SafetyController with the live ClearingHouse and FuturesOracle.
4. OrderBook with the live ClearingHouse and FuturesOracle.

Every actual address and every immutable backreference is compared with the independently predicted literal address. A second controller cannot bind the already-wired modules because the backreferences mismatch.

### Immediate safety and epoch invalidation

Only the immutable human guardian can call:

- `forceCloseOnly()`
- `lowerTotalLiabilityCap(uint256)`
- `lowerAccountEquityCap(uint256)`
- `lowerMatchedOpenInterestCap(uint256)`
- `lowerMaxDeviationBps(uint16)`
- `queueReopen()`

Every successful force/reduction increments `safetyEpoch`. The underlying ClearingHouse/Oracle enforces strict one-way limits. The increment occurs in the same transaction as the typed dependency call, so a dependency revert rolls the increment back. Tests preserve and compare the epoch, queued epoch/time, cap/deviation, and latch around unauthorized and invalid calls.

A queued reopen stores the current epoch and `block.timestamp + 172800`. Requeueing overwrites the same two fields. `executeReopen()` is permissionless, requires a nonzero queue, requires exact epoch equality, rejects `block.timestamp < reopenExecutableAt`, and therefore executes at equality. It consumes the queue and calls only `oracle.clearForcedClose()`; if that call failed, EVM atomicity would restore the queue.

A newer force/reduction does not need to delete old queue evidence: incrementing the epoch makes every older queue unexecutable. The suite matures an epoch-zero queue first, then applies each of the five immediate actions independently and proves that permissionless execution still reverts.

### Oracle reopen semantics

`FuturesOracle.clearForcedClose()` can only set the force-close latch to false and can only be called by its immutable controller address. No price, observation, accepted mark, fault flag, or market-state value is written. Direct calls from deployer, human guardian, and other EOAs revert.

After a valid delayed execution, `safeRead()` remains the all-zero CloseOnly result. The real Oracle then receives one baseline plus six independently timestamped five-minute observations. It remains CloseOnly through 25 minutes and opens only at the ordinary 30-minute window. A live two-times feed deviation returns it to CloseOnly; restoring the ordinary valid feed restores Open. Thus unlatching does not bypass observation spacing/window, mark freshness, feed freshness, pair validity, or deviation checks.

### Permission and custody surface

The Task 7 gate derives canonical selectors from compiler ABI tuples and requires exact selector/mutability equality for SafetyController, FuturesOracle, and ClearingHouse. It also audits the canonical ClearingHouse tuple signatures:

- `openMatchedPair((address,address,address,uint256,uint256,uint256,uint256))`
- `closeMatchedPair((address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256))`
- `liquidateAndReplace((address,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256))`

Runtime behavior rejects fallback, receive/value transfer, unknown calldata, generic execution, multicall, arbitrary target/value/calldata forwarding, delegatecall forwarding, upgrades, ownership/guardian transfer, fee/leverage/price mutation, token sweep, and user/insurance/revenue withdrawal-shaped calls. A live payable probe remains untouched and the controller balance remains zero. Parsed optimized runtime contains no `DELEGATECALL`; its `CALL` instructions are exercised only through typed calls to the two immutable dependencies.

ClearingHouse's existing user, claimable, liquidation-reward, insurance, and revenue accounting routes remain owned by their existing callers. The Task 7 suite performs a real user collateral withdrawal and proves literal token/available changes plus continuous equality of liabilities and collateral. The affected ClearingHouse and Task 6 suites continue to exercise all allowed accounting effects, claim/reward withdrawals, insurance use, fixed revenue transfer, and atomic failures. No new insurance, revenue, collateral, user withdrawal, upgrade, owner, generic execution, or deleveraging surface exists.

## Exact Task 7 ABI

### SafetyController

| Selector     | Mutability | Canonical signature                    |
| ------------ | ---------- | -------------------------------------- |
| `0x452a9320` | view       | `guardian()`                           |
| `0x0af96800` | view       | `clearingHouse()`                      |
| `0x7dc0d1d0` | view       | `oracle()`                             |
| `0xa858c9f4` | view       | `safetyEpoch()`                        |
| `0xe922da6a` | view       | `queuedReopenEpoch()`                  |
| `0xa6644ee3` | view       | `reopenExecutableAt()`                 |
| `0x0994a0a1` | nonpayable | `forceCloseOnly()`                     |
| `0xcd99f79e` | nonpayable | `lowerTotalLiabilityCap(uint256)`      |
| `0xf69539cb` | nonpayable | `lowerAccountEquityCap(uint256)`       |
| `0x43081ed9` | nonpayable | `lowerMatchedOpenInterestCap(uint256)` |
| `0x0925488d` | nonpayable | `lowerMaxDeviationBps(uint16)`         |
| `0xa7b1ce9d` | nonpayable | `queueReopen()`                        |
| `0xa78d6f14` | nonpayable | `executeReopen()`                      |

There is no fallback or receive entry. Constructor inputs are `address guardian_`, `address clearingHouse_`, and `address oracle_`.

### FuturesOracle ABI delta

| Selector     | Mutability | Canonical signature  |
| ------------ | ---------- | -------------------- |
| `0x3aa1fe68` | nonpayable | `clearForcedClose()` |

All pre-Task-7 Oracle selectors and mutability remain unchanged. ClearingHouse and OrderBook ABIs remain unchanged.

## TDD RED/GREEN evidence

All REDs used real compiler/deployed behavior and were observed before their corresponding production/integration change.

1. Oracle unlatch RED:
   - Command: `pnpm --filter @bnbx/contracts test:safety-controller`
   - Real Oracle first latched successfully.
   - Expected failure: `configured Oracle controller could not clear only its force-close latch`.
   - Minimal GREEN: add controller-authorized `clearForcedClose()`.
   - GREEN: `PASS SafetyControllerTest.oracleControllerOnlyUnlatchEffect`.
2. Dedicated module RED:
   - Same command after adding the controller artifact to the test compiler input.
   - Expected failure: `ENOENT ... src/futures/SafetyController.sol`.
   - Minimal GREEN: immutable typed SafetyController with the tested safety surface.
3. Affected Oracle exact-ABI RED:
   - Command: `pnpm --filter @bnbx/contracts test:futures-oracle`.
   - Expected failure: `FuturesOracle ABI selector or mutability mismatch`.
   - GREEN after adding exactly `clearForcedClose()` to the expected ABI.
4. Task 6 exact-ABI/source RED:
   - Command: `pnpm --filter @bnbx/contracts test:funding-liquidation`.
   - Expected failure: `FuturesOracle exact ABI selector/mutability gate failed` (followed by the expected new source-manifest pressure).
   - GREEN after adding the one Oracle selector and SafetyController source/artifact/ABI/runtime entries to the whole-repository gate.

The comprehensive deployed Task 7 suite emits 13 PASS lines covering unlatch effect, deterministic wiring, constructor rejection, guardian atomicity, failed reduction atomicity, all five epoch invalidations, requeue replacement, permissionless exact-boundary execution, ordinary Oracle recovery, controller-only dependencies, owned solvent withdrawal, exact ABI/runtime permissions, and runtime sizes.

## Mutation-sensitive verification

Temporary production mutations were applied one at a time, the targeted suite was run, and production was restored after each expected failure:

| Unsafe mutation                               | Killed by observed failure                                            |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Remove `lowerMaxDeviationBps` epoch increment | `lowerMaxDeviationBps did not invalidate the mature epoch-zero queue` |
| Change ready check from `<` to `<=`           | `permissionless equality execution failed`                            |
| Remove stale queued-epoch comparison          | `old mature queue executed after forceCloseOnly`                      |
| Remove guardian modifier authorization        | `outsider executed forceCloseOnly`                                    |
| Make Oracle unlatch a no-op                   | `Oracle remained force-closed after the controller unlatch`           |

The source was restored and the targeted suite returned to exit 0 after the mutation runs.

## Verification results

Compiler settings for every futures audit were Solidity `0.8.30`, optimizer enabled with 200 runs, and EVM version Shanghai.

- `pnpm --filter @bnbx/contracts test:safety-controller`: exit 0; 13 PASS lines.
- `pnpm --filter @bnbx/contracts test:futures-oracle`: exit 0; affected Oracle ABI/runtime and behavior suite passed.
- `pnpm --filter @bnbx/contracts test:clearing-house`: exit 0; 36 emitted PASS lines including exact permissions, withdrawals, controller caps, atomicity, and solvency.
- `pnpm --filter @bnbx/contracts test:order-book`: exit 0; 25 emitted PASS lines including immutable wiring, CloseOnly/reduce-only, atomic accounting, and ABI/runtime.
- `pnpm --filter @bnbx/contracts test:funding-liquidation`: exit 0; 17 emitted PASS lines. Whole-repository gate reports 6 futures sources, 8 artifacts, and 290 repository inputs.
- `pnpm --filter @bnbx/contracts test`: final fresh exit 0. It passed 8/8 compiler-input tests, Task 7, Task 6, every contracts EVM suite, all affected futures suites, and the complete `GraduationTarget.1BNB` through `GraduationTarget.18BNB` matrix.
- `pnpm exec prettier --check packages/contracts/package.json packages/contracts/scripts/run-task-7-tests.mjs packages/contracts/scripts/run-task-6-tests.mjs packages/contracts/scripts/run-evm-tests.mjs`: exit 0.
- `git diff --check`: exit 0 before the implementation commit.

The only recurring diagnostic was Ganache's native µWS binary incompatibility warning under the installed Node build; Ganache explicitly fell back to its JavaScript implementation and every listed command exited 0.

## Optimized deployed runtime sizes

| Contract         |  Bytes | EIP-170 headroom |
| ---------------- | -----: | ---------------: |
| SafetyController |  1,837 |           22,739 |
| FuturesOracle    |  6,850 |           17,726 |
| ClearingHouse    | 11,637 |           12,939 |
| OrderBook        | 18,974 |            5,602 |
| RiskEngine       |  1,788 |           22,788 |

All are at or below the 24,576-byte EIP-170 limit.

## Concerns

- No implementation or security blocker found.
- Production deployment tooling must preserve the audited deterministic nonce/order (or an equivalent independently predicted deterministic scheme) so the immutable cycle matches before SafetyController construction. No deployment manifest was added because the existing Phase 1 whole-repository gate requires futures deployment artifacts to remain absent at this stage.
- The Ganache µWS fallback warning is environmental noise, not a test failure.
