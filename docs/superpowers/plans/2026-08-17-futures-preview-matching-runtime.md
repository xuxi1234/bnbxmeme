# BNBX Futures Preview Matching Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BSC Testnet Preview execute one real, durable and idempotent OrderBook match between two authenticated wallets and show the confirmed fill and positions.

**Architecture:** The authenticated Next.js API calls a colocated server-only runtime. Supabase stores the canonical serialized matching state, a short distributed lease and a canonical fill index; a Preview-only relayer signs exact core-produced calldata, persists the signed transaction identity before broadcast, and reconciles receipts and reorgs by hash.

**Tech Stack:** Next.js 15, TypeScript 5.9, viem 2.33, Supabase Postgres/RPC, Node test runner, Vercel Preview, BSC Testnet chain 97.

## Global Constraints

- BSC Testnet and Vercel Preview for `feat/bnbx-futures-phase-1` only.
- Do not merge or modify `main`, Production, or mainnet configuration.
- `FUTURES_RELAYER_PRIVATE_KEY` is server-only and Preview-only; never print, return, persist or bundle it.
- Trader cancellation, Test USDT approval, deposit and withdrawal remain wallet-originated.
- The relayer may submit only exact `matchOrders` calldata produced by `futures-service-core.ts`.
- A fill becomes visible only after canonical `OrdersMatched` validation and the configured confirmations.
- Supabase runtime tables and RPCs are service-role-only with RLS enabled and no anon/authenticated policy.
- Implement every task RED → GREEN → REFACTOR and commit each independently.

---

## File map

- `supabase/migrations/20260817120000_futures_matching_runtime.sql`: state, lease, fill-index tables and bounded service-role RPCs.
- `apps/web/lib/futures-runtime-types.ts`: runtime dependency interfaces and bounded response types.
- `apps/web/lib/futures-runtime-store.ts`: Supabase state CAS, lease and fill-index adapter.
- `apps/web/lib/futures-relayer.ts`: Preview-only chain preflight, deterministic signing, broadcast and receipt/event reads.
- `apps/web/lib/futures-read-model.ts`: bounded oracle, collateral, order, fill and position reads.
- `apps/web/lib/futures-runtime.ts`: intake, reconciliation and bounded coordinator orchestration.
- `apps/web/lib/futures-api-server.ts`: direct runtime dispatch with external HTTPS adapter retained as an optional fallback.
- `apps/web/lib/futures-service-core.ts`: signed-transaction identity invariants for durable effects.
- `apps/web/components/futures-console.tsx`: wallet-originated cancellation and explicit lifecycle states.
- `apps/web/lib/*.test.mjs`: focused unit, API, integration and UI regression coverage.
- `.github/workflows/futures-phase-1-ci.yml`: run runtime and migration permission checks.

### Task 1: Add service-role-only durable runtime schema

**Files:**
- Create: `supabase/migrations/20260817120000_futures_matching_runtime.sql`
- Create: `apps/web/lib/futures-runtime-migration.test.mjs`

**Interfaces:**
- Produces RPCs `futures_matching_state_load(text)`, `futures_matching_state_cas(text,bigint,bigint,jsonb)`, `futures_effect_lease_acquire(text,uuid,integer)`, `futures_effect_lease_release(text,uuid)`, and `futures_fill_upsert(...)`.
- Produces a single state row per lower-case deployment key with monotonic `revision`.

- [ ] **Step 1: Write a failing migration contract test**

```js
test("runtime migration is RLS locked and exposes bounded CAS/lease RPCs only to service_role", () => {
  const sql = readFileSync(migration, "utf8");
  for (const table of ["futures_matching_states", "futures_effect_leases", "futures_fill_index"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, "i"));
  }
  assert.match(sql, /where revision = p_expected_revision/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /grant .+ to anon|grant .+ to authenticated/i);
});
```

- [ ] **Step 2: Run `pnpm --filter @bnbx/web test -- futures-runtime-migration.test.mjs` and verify failure because the migration is absent.**

- [ ] **Step 3: Implement three RLS-enabled tables, unique `(chain_id, order_book, tx_hash, log_index)` fill identity, revision CAS, expiring lease acquisition, owner-only release and fill upsert; validate chain 97, address/hash formats, lease TTL 1–60 seconds and state size.**

- [ ] **Step 4: Run the focused test and `pnpm --filter @bnbx/web test`; verify PASS.**

- [ ] **Step 5: Commit `feat(futures): add durable matching runtime schema`.**

### Task 2: Add durable store adapter with CAS and lease tests

**Files:**
- Create: `apps/web/lib/futures-runtime-types.ts`
- Create: `apps/web/lib/futures-runtime-store.ts`
- Create: `apps/web/lib/futures-runtime-store.test.mjs`

**Interfaces:**
- Produces `RuntimeStore.load(deploymentKey): Promise<{revision:number; serialized:string}|null>`.
- Produces `compareAndSwap(deploymentKey, expectedRevision, nextRevision, serialized): Promise<boolean>`.
- Produces `acquireLease(deploymentKey, owner, ttlSeconds): Promise<boolean>`, `releaseLease(...)`, `upsertFill(fill)` and wallet-scoped `listFills(wallet,limit)`.
- Consumes only server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Write failing tests using a fake RPC client for first-load initialization, successful CAS, stale-revision rejection, lease owner/expiry, fill uniqueness and lower-case wallet scoping.**

```ts
export type RuntimeStore = {
  load(key: string): Promise<{ revision: number; serialized: string } | null>;
  compareAndSwap(key: string, expected: number, next: number, serialized: string): Promise<boolean>;
  acquireLease(key: string, owner: string, ttlSeconds: number): Promise<boolean>;
  releaseLease(key: string, owner: string): Promise<void>;
  upsertFill(fill: CanonicalFill): Promise<void>;
  listFills(wallet: Address, limit: number): Promise<CanonicalFill[]>;
};
```

- [ ] **Step 2: Run the focused test and verify imports/functions are missing.**
- [ ] **Step 3: Implement exact response-shape validation, maximum 2 MiB serialized state, limit 1–100, fail-closed missing env, and no secret logging.**
- [ ] **Step 4: Run focused and complete web tests; verify PASS.**
- [ ] **Step 5: Commit `feat(futures): add matching runtime store`.**

### Task 3: Bind deterministic signed transaction identity into core state

**Files:**
- Modify: `apps/web/lib/futures-service-core.ts`
- Modify: `apps/web/lib/futures-service-core.test.mjs`

**Interfaces:**
- Extend `recordSubmission` command with `rawTransaction: Hex`; compute and store `keccak256(rawTransaction)` as the effect `txHash` before broadcast.
- `recordSubmission` remains idempotent only for identical hash, raw bytes, nonce, sender, calldata and submitted block.
- Add `reconcileWalletCancellation(state,{expectedRevision,effectId,cancelledOnChain})`; it can confirm only a prepared cancellation whose `OrderBook.cancelled(orderId)` read is true.
- Raw signed bytes remain inside the service-role-only serialized effect state and are never mapped into API responses.

- [ ] **Step 1: Add failing tests proving an identical pre-broadcast record is idempotent, while same effect/different raw bytes, hash, nonce or sender throws; hydration checks `keccak256(rawTransaction) === txHash` and rejects partial submission identity; wallet cancellation confirms only with a true on-chain cancelled flag.**
- [ ] **Step 2: Run `pnpm --filter @bnbx/web test -- futures-service-core.test.mjs` and verify the new assertions fail.**
- [ ] **Step 3: Implement the minimal invariant changes and retain backward rejection for malformed durable states.**
- [ ] **Step 4: Run the focused test and all web tests; verify PASS.**
- [ ] **Step 5: Commit `fix(futures): bind effects before relayer broadcast`.**

### Task 4: Implement exact-calldata relayer transport

**Files:**
- Create: `apps/web/lib/futures-relayer.ts`
- Create: `apps/web/lib/futures-relayer.test.mjs`

**Interfaces:**
- Produces `createFuturesRelayer(deps).preflight(): Promise<RelayerHealth>`.
- Produces `prepare(effect): Promise<{hash:Hex; raw:Hex; nonce:number; sender:Address; submittedAtBlock:number}>`.
- Produces `broadcast(raw): Promise<Hex>` and `inspect(hash,effect): Promise<SubmissionObservation>`.
- Consumes `effect.kind === "submit-match"`, chain ID 97, configured OrderBook and exact `effect.calldata` only.

- [ ] **Step 1: Write failing fake-client tests for wrong chain, missing bytecode, zero balance, cancellation effect rejection, destination mismatch, calldata mutation rejection, deterministic hash, identical rebroadcast, receipt transaction/input/from/to checks, `OrdersMatched` decode and canonical block hash.**
- [ ] **Step 2: Run the focused test and verify module-not-found failure.**
- [ ] **Step 3: Implement with viem `privateKeyToAccount`, `prepareTransactionRequest`, `signTransaction`, `keccak256`, `sendRawTransaction`, `getTransaction`, `getTransactionReceipt`, `getBlock` and `decodeEventLog`; never call `sendTransaction` with reconstructed economics.**
- [ ] **Step 4: Run focused and complete web tests; verify PASS.**
- [ ] **Step 5: Commit `feat(futures): add deterministic preview relayer`.**

### Task 5: Implement bounded BSC read model

**Files:**
- Create: `apps/web/lib/futures-read-model.ts`
- Create: `apps/web/lib/futures-read-model.test.mjs`

**Interfaces:**
- Produces `readMarketStatus()`, `readPositions(wallet,limit)`, `readCollateralIntent(wallet,action,amount)`, `readOrderCancelled(orderId)`, and `readKeeperHealth(lastRun)`.
- Uses `runBoundedRpcBatch` with maximum 20 calls, 5-second timeout and chain 97 verification.
- Returns shapes already accepted by `parseFuturesApiResponse`.

- [ ] **Step 1: Write failing tests for market Open/CloseOnly, stale oracle, wallet-only lots, `OrderBook.cancelled(bytes32)`, deposit/withdraw exact calldata, RPC call cap, timeout and malformed contract response.**
- [ ] **Step 2: Run the focused test and verify failure.**
- [ ] **Step 3: Implement minimal ABIs for FuturesOracle, OrderBook and ClearingHouse using accepted testnet addresses from environment; cap every list at 100 and fail closed.**
- [ ] **Step 4: Run focused and all web tests; verify PASS.**
- [ ] **Step 5: Commit `feat(futures): add bounded onchain read model`.**

### Task 6: Implement matching runtime coordinator

**Files:**
- Create: `apps/web/lib/futures-runtime.ts`
- Create: `apps/web/lib/futures-runtime.test.mjs`

**Interfaces:**
- Produces `dispatchFuturesRuntime({wallet,resource,method,input}): Promise<{status:number;payload:unknown}>`.
- `orders POST` calls `validateOrderEnvelope` then CAS-retries `intakeOrder` at most 3 times.
- `drainOnce` acquires a 30-second lease, reconciles submitted/included effects, prepares/persists one transaction, broadcasts identical bytes, and releases the lease in `finally`.

- [ ] **Step 1: Write failing integration tests with fake store/chain for maker intake, crossing taker preparation, one broadcast, duplicate idempotency, concurrent lease loser, stale CAS retry, broadcast timeout/rebroadcast-identical, revert release, confirmations, invalid event, reorg reversal and Supabase outage/no broadcast.**
- [ ] **Step 2: Run the focused test and verify failure.**
- [ ] **Step 3: Implement `loadOrInitialize`, `mutateWithCas`, `reconcilePending`, `submitPrepared`, and `drainOnce`; enforce wallet equals envelope trader and process at most one chain effect per invocation.**
- [ ] **Step 4: Add wallet-scoped order/fill responses and bounded reconcile/drain calls from `orders GET`, `fills GET`, and `keeper-health GET`; never expose raw signed bytes.**
- [ ] **Step 5: Run focused and complete web tests; verify PASS.**
- [ ] **Step 6: Commit `feat(futures): orchestrate durable preview matching`.**

### Task 7: Replace Preview proxy dependency with direct runtime dispatch

**Files:**
- Modify: `apps/web/lib/futures-api-server.ts`
- Modify: `apps/web/lib/futures-api-acceptance.test.mjs`
- Modify: `apps/web/app/api/futures/[resource]/route.ts`

**Interfaces:**
- `forwardFuturesRequest` keeps auth, quota, body limit, strict parsing and response parsing.
- When runtime env is configured, call `dispatchFuturesRuntime` directly; use external HTTPS service only when explicitly selected by `FUTURES_RUNTIME_MODE=external`.

- [ ] **Step 1: Add failing acceptance tests proving direct mode needs no `FUTURES_SERVICE_URL`, passes authenticated wallet explicitly, preserves 64 KiB/256 KiB limits and maps runtime failures to existing localized codes.**
- [ ] **Step 2: Run API acceptance tests and verify direct-mode failure.**
- [ ] **Step 3: Implement the direct adapter without self-HTTP fetch and keep the external adapter isolated.**
- [ ] **Step 4: Run API core, acceptance and complete web tests; verify PASS.**
- [ ] **Step 5: Commit `feat(futures): route preview API to matching runtime`.**

### Task 8: Make cancellation wallet-originated in the UI

**Files:**
- Modify: `apps/web/lib/futures-api-core.ts`
- Modify: `apps/web/components/futures-console.tsx`
- Modify: `apps/web/lib/futures-ui-core.ts`
- Modify: `apps/web/lib/futures-ui.test.mjs`

**Interfaces:**
- Cancellation response becomes `{orderId,status,to,calldata,expiresAt}` and remains strict/schema-bounded.
- UI calls `sendTransactionAsync({to,data,chainId:97})`, waits for receipt, then refreshes durable state.
- Adds four-language labels for awaiting counterparty, relayer submitting, included, confirmed and failed.

- [ ] **Step 1: Add failing parser/UI source assertions for exact cancellation intent, wallet send, receipt wait and all four locale lifecycle labels.**
- [ ] **Step 2: Run focused UI/API tests and verify failure.**
- [ ] **Step 3: Implement cancellation intent generation from the stored order's exact `cancel` calldata; ensure runtime never sends it. On authenticated refresh, read `OrderBook.cancelled(orderId)` and call `reconcileWalletCancellation` through CAS when true.**
- [ ] **Step 4: Implement wallet transaction and refresh; show only canonical fills in the fills list.**
- [ ] **Step 5: Run focused and complete web tests; verify PASS.**
- [ ] **Step 6: Commit `feat(futures): submit cancellations from trader wallet`.**

### Task 9: Apply Supabase migration and verify permissions

**Files:**
- Modify: `.github/workflows/futures-phase-1-ci.yml`

**Interfaces:**
- Applies migration to project `yziinbggzwcczkhxqphv`.
- CI runs migration contract tests plus existing Futures suites.

- [ ] **Step 1: Run the migration contract test before applying and record PASS.**
- [ ] **Step 2: Apply `20260817120000_futures_matching_runtime.sql` through the Supabase migration API.**
- [ ] **Step 3: Query `pg_tables`, `pg_proc`, `information_schema.role_table_grants` and `information_schema.role_routine_grants`; verify anon/authenticated have no access and service_role has only required access.**
- [ ] **Step 4: Run Supabase security and performance advisors; remediate any finding introduced by this migration.**
- [ ] **Step 5: Add the focused tests to CI and commit `ci(futures): verify matching runtime security`.**

### Task 10: Scope Vercel secrets and deploy Preview

**Files:**
- No source file unless environment documentation needs correction.

**Interfaces:**
- Preview variables include runtime mode, Supabase server credentials, BSC RPC, accepted contract addresses, confirmations, session secret, writes flag and relayer key.
- Production has no relayer key and Futures writes remain disabled.

- [ ] **Step 1: In Vercel, change `FUTURES_RELAYER_PRIVATE_KEY` from Production+Preview to Preview only without reading or copying its value.**
- [ ] **Step 2: Verify all required Preview variables exist and are not exposed as `NEXT_PUBLIC_*`; set `FUTURES_RUNTIME_MODE=direct` and `FUTURES_REQUIRED_CONFIRMATIONS=2`.**
- [ ] **Step 3: Push the branch commits and wait for Preview deployment.**
- [ ] **Step 4: Inspect deployment/build logs for secret output, server/client bundling errors and runtime failures; verify Production was not redeployed.**
- [ ] **Step 5: Open `/futures`, authenticate on chain 97 and verify bounded status reads.**

### Task 11: Run real two-wallet end-to-end acceptance

**Files:**
- Create: `apps/web/scripts/futures-preview-acceptance.mjs`
- Create: `docs/superpowers/evidence/2026-08-17-futures-preview-acceptance.md`

**Interfaces:**
- Script accepts two ephemeral test wallet keys through process environment only, never command arguments/logs/files.
- Produces sanitized evidence: wallet addresses, deposit hashes, order IDs, one relayer hash, block/event identity, positions and duplicate-retry result.

- [ ] **Step 1: Write a dry-run test proving the script redacts keys and refuses chain other than 97 or Production URLs.**
- [ ] **Step 2: Fund/prepare two non-custodial test wallets with Test USDT and tBNB, approve and deposit into ClearingHouse.**
- [ ] **Step 3: Authenticate both wallets, submit a long Maker and crossing short Taker, poll until two confirmations, then assert exactly one canonical `OrdersMatched` event.**
- [ ] **Step 4: Assert both wallets receive the same fill and opposite isolated positions; replay both idempotency keys and assert transaction/event counts remain one.**
- [ ] **Step 5: Submit a fresh order, cancel it from the trader wallet and verify durable cancelled state; test withdrawal from the trader wallet.**
- [ ] **Step 6: Save sanitized evidence and commit `test(futures): prove preview long short lifecycle`.**

### Task 12: Full regression and handoff

**Files:**
- Modify: `docs/superpowers/evidence/2026-08-17-futures-preview-acceptance.md`

**Interfaces:**
- Final handoff includes commit SHA, Draft PR, Preview URL, CI result, migration result, relayer hash and known Preview-only limitations.

- [ ] **Step 1: Run `pnpm --filter @bnbx/web test`, `pnpm --filter @bnbx/web typecheck`, `pnpm --filter @bnbx/web lint`, and `pnpm --filter @bnbx/web build`; require exit 0.**
- [ ] **Step 2: Run the repository Futures contract, audit and CI commands defined in `.github/workflows/futures-phase-1-ci.yml`; require exit 0.**
- [ ] **Step 3: Verify the branch head's GitHub checks and Vercel Preview are successful.**
- [ ] **Step 4: Re-open Vercel environment scopes and prove no Production relayer secret; re-open the Preview and repeat wallet-scoped read smoke.**
- [ ] **Step 5: Update the evidence document with exact sanitized results and report the test link; keep the PR Draft and do not merge.**
