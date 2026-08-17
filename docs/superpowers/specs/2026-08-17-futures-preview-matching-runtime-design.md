# BNBX Futures Preview Matching Runtime — Confirmed Design Addendum

Status: approved approach A by the product owner on 2026-08-17. This addendum completes the runtime portion of the confirmed Phase 1 design. It applies only to BSC Testnet and the Vercel Preview for `feat/bnbx-futures-phase-1`.

## Goal and acceptance

The Preview must let two test wallets deposit Test USDT, sign opposite crossing Maker/Taker orders, have the service submit the immutable signed economics to the accepted OrderBook, and display the confirmed fill and resulting isolated positions. Cancellation and withdrawal remain wallet-originated transactions. No mainnet, Production, or `main` change is permitted.

Acceptance requires:

- wallet-authenticated session on chain 97;
- Test USDT approval and ClearingHouse deposit from each trader;
- durable Maker order intake followed by a crossing Taker order;
- exactly one relayer transaction for one prepared match effect;
- canonical `OrdersMatched` event validation before marking a fill confirmed;
- both wallets see the fill and their opposite isolated positions;
- duplicate API requests, concurrent triggers, retries, timeouts, and reorgs never create an extra fill;
- cancellation is signed on-chain by the trader, never by the relayer;
- every secret remains server-only and Preview-scoped.

## Chosen architecture

The existing authenticated Next.js Futures API remains the public boundary. In Preview it calls a colocated server-only runtime module directly rather than making a self-referential HTTP request. The existing external `FUTURES_SERVICE_URL` adapter may remain available for a later standalone service, but it is not required for Phase 1 Preview.

Supabase stores one canonical matching-state document and explicit effect/lease metadata. The existing pure `futures-service-core.ts` remains the authority for signature validation, price-time matching, idempotency, reservations, submissions, receipts, and reorg reconciliation.

The runtime has four isolated responsibilities:

1. **State store** — load and compare-and-swap the serialized matching state by revision.
2. **Read model** — perform bounded BSC Testnet reads for market status, collateral, lots, fills, and keeper health.
3. **Effect coordinator** — acquire a short database lease, select prepared effects, submit them sequentially, and release or reconcile safely.
4. **Relayer transport** — derive one server-only account from `FUTURES_RELAYER_PRIVATE_KEY`, require chain 97 and the configured OrderBook, estimate gas, submit only exact core-produced calldata, and never expose the key or signing API.

This keeps custody in ClearingHouse and signed economics in OrderBook. The relayer pays gas only; it cannot alter trader, side, quantity, limit price, leverage, role, deadline, or reduce-only intent.

## Durable data and concurrency

A new migration creates service-role-only tables:

- `futures_matching_states`: deployment key, revision, serialized JSON state, timestamps;
- `futures_effect_leases`: deployment key, lease owner, lease expiry;
- `futures_fill_index`: canonical confirmed event fields used by wallet-scoped reads.

RLS is enabled with no anon/authenticated policies. Only `service_role` receives table/function permissions.

A security-definer compare-and-swap RPC updates the state only when the stored revision equals the caller's expected revision. A separate bounded lease RPC grants one coordinator the right to submit prepared effects. The lease has an expiry so a crashed Vercel invocation cannot permanently stop matching.

The coordinator persists the prepared effect before any chain write. After submission it persists transaction hash, sender, nonce, and block. After the required confirmations it fetches the transaction, receipt, canonical block hash, and decoded event, then calls the existing reconciliation core. A retry observes the persisted effect and reconciles it rather than submitting again.

Relayer nonce use is serialized by the effect lease. Before sending, the transport obtains the pending nonce from chain and records it with the effect. A nonce conflict or ambiguous timeout leaves the effect in a reconcilable state; the runtime searches by sender/nonce before considering a retry.

## API behavior

The existing resources remain allowlisted and wallet authenticated.

- `market-status GET`: bounded reads from FuturesOracle and OrderBook.
- `orders GET`: wallet-scoped durable orders.
- `orders POST`: validate the EIP-712 envelope, compare-and-swap intake, then trigger one bounded coordinator drain.
- `cancellations DELETE`: create a cancellation intent containing the exact OrderBook target and calldata. The UI sends it from the trader wallet and refreshes after receipt.
- `fills GET`: confirmed canonical fills involving the authenticated wallet.
- `positions GET`: bounded active-lot and ClearingHouse reads for the authenticated wallet.
- `collateral-intents POST`: exact ClearingHouse deposit/withdraw calldata; the UI continues to approve and submit from the trader wallet.
- `keeper-health GET`: head block, last successful coordinator run, lag, and degraded state.

Responses stay schema-bounded. Unknown fields, wrong chain/domain/contract, oversized bodies, invalid signatures, cross-wallet reads, expired sessions, disabled writes, stale oracle state, or unavailable persistence fail closed with existing localized error codes.

## Secret and environment boundary

`FUTURES_RELAYER_PRIVATE_KEY` must be removed from Production and retained only in Preview. It is never copied to GitHub, logs, responses, client bundles, build output, Supabase, or source control.

Preview also requires the already configured chain/order-book/test-asset values, Supabase service role, RPC URL, session secret fallback, and `FUTURES_API_WRITES_ENABLED=true`. Production keeps Futures writes disabled and receives no relayer key.

At startup the runtime derives the relayer address, checks chain ID 97, checks OrderBook bytecode, and checks a positive tBNB balance. A mismatch returns service unavailable without signing.

## Failure handling

- State revision conflict: reload and retry a bounded number of times.
- Lease unavailable: return accepted order state; another invocation owns submission.
- RPC timeout before a hash: inspect sender/nonce and persisted submission state before retrying.
- Reverted transaction: release reservations through core reconciliation and retain failure evidence.
- Included but not confirmed: keep the effect included and reconcile on the next request.
- Reorg: compare canonical block hash, reverse the confirmed effect through the existing core, and rematch if valid.
- Oracle CloseOnly/stale: reject exposure-increasing matches; reduction remains contract-governed.
- Supabase unavailable: no state mutation and no chain submission.
- Vercel timeout: persisted state and lease expiry make the next invocation safe.

## UI changes

The current four-language `/futures` console remains. It gains wallet-submitted cancellation handling and clearer states for order accepted, awaiting counterparty, relayer submitting, included, confirmed, failed, and CloseOnly. It never displays a prepared or included effect as a fill.

## Testing and release gates

Implementation follows strict RED → GREEN → REFACTOR.

Required evidence:

- unit tests for store CAS, lease ownership/expiry, wallet scoping, exact calldata, nonce ambiguity, duplicate drain, receipt/event validation, revert, timeout, and reorg;
- API contract tests for every resource and failure code;
- migration permission tests proving anon/authenticated denial and service-role-only access;
- existing service-core, keeper-core, API, UI, contract, audit, typecheck, lint, and production build suites;
- Preview smoke test with a generated non-custodial test client;
- two funded test wallets complete deposit → Maker/Taker orders → one confirmed match → opposite positions;
- retry the same idempotency keys and prove no second transaction/fill;
- verify Production has no relayer secret and Preview is the only enabled write environment.

The branch remains draft. No merge or mainnet deployment is part of this work.
