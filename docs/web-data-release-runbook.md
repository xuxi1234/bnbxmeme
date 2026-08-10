# Web data release runbook

This runbook covers the chain-data index, market and creator APIs, and project
discussion storage. It does not authorize a Mainnet contract transaction,
GitHub merge, Vercel production promotion, or environment-secret change.

## 1. Required server configuration

Configure these values only in the server environment:

- `BSC_MAINNET_RPC_URL`: reliable current-state BSC reads.
- `BSC_LOG_RPC_URL`: archive-capable BSC endpoint for historical
  `eth_getLogs`.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: server-only database
  credential.

The log endpoint must read history from all three immutable Factory origins:

| Factory        | Deployment block |
| -------------- | ---------------: |
| Standard       |      `112395295` |
| Auto-liquidity |      `112395524` |
| Rewards        |      `112626381` |

Before release, verify that `BSC_LOG_RPC_URL` accepts 10,000-block
`eth_getLogs` ranges at those historical heights. The public fallback nodes
are for resilience; they are not a substitute for a verified archive
endpoint.

Never print, paste into an issue, or commit any environment value.

### RPC cost-containment invariants

- Homepage market scoring must call `/api/chain-data?mode=cache` and read only
  `chain_data_cache`. Cache-only requests never call BSC RPC.
- Missing Supabase configuration, a failed cache read, or a missing cache row
  fails closed. None of these cases may fall back to an unchecked historical
  scan.
- A refresh scans at most 20,000 blocks. Further history is completed by later
  bounded refreshes from the saved checkpoint.
- A compatible fresh cache is returned before project validation or any other
  BSC read.
- A compatible stale or partial cache must first win the atomic
  `latest_block` + `refreshed_at` lease. Losing Vercel instances return stale
  cache or HTTP 503 without calling BSC RPC.
- The route duration is 300 seconds and the lease is 360 seconds. The final
  cache write must still own both the claimed block and timestamp.
- A cold cache row is created only after the token, Curve, Factory, and active
  Pair identity have been validated as an official BNBX project.
- The homepage catalog and token detail data poll every 60 seconds. Homepage
  market scores poll every five minutes. `/api/market-data` uses a 60-second
  CDN cache.

## 2. Apply database migrations

Apply migrations in filename order. A database that already contains the
original chain cache and moderation tables only needs the unapplied files, but
its migration history must still show the complete sequence:

1. `20260728134746_create_chain_data_cache.sql`
2. `20260729121935_create_token_comments.sql`
3. `20260729144853_add_comment_moderation.sql`
4. `20260730013952_atomic_comment_submission.sql`
5. `20260730014028_support_contract_wallet_signatures.sql`
6. `20260730111240_add_comment_reports.sql`
7. `20260730111622_add_comment_wallet_bans.sql`
8. `20260730111835_improve_comment_audit.sql`

Apply all unapplied `20260730` migrations before deploying the matching Web
commit. The atomic-submission migration installs a `BEFORE INSERT`
trigger, so both the old table-insert route and the new RPC route receive the
same atomic cooldown and replay checks during a rolling release. It
intentionally retains the existing server-role table insert privilege for
rollback compatibility.

Test the migrations on a non-production database first. Confirm:

- both migration files are recorded exactly once;
- `enforce_token_comment_submission` is attached to
  `public.token_comments`;
- `submit_token_comment` is executable only through the server credential;
- `token_comments_signature_key` is removed after the contract-wallet
  migration;
- `token_comments_signature_hash_idx` exists.
- comment reports are unique per comment and reporting wallet;
- active wallet bans are enforced by the comment-submission trigger;
- report, ban, and audit tables have RLS enabled and no client-role grants.

## 3. Build and Preview

Run the repository gates before creating or refreshing a Preview:

```bash
pnpm --filter @bnbx/web test
pnpm --filter @bnbx/web typecheck
pnpm --filter @bnbx/web lint
pnpm --filter @bnbx/web build
pnpm test
```

Deploy only a protected Preview. Do not promote it to production without a
separate explicit approval.

## 4. Preview acceptance

Validate all of the following through the Preview deployment and its runtime
logs:

### Historical chain index

- An old graduated project backfills from its Factory deployment block.
- `index.version` is `3`.
- `index.status` eventually becomes `complete`.
- The saved checkpoint reaches the observed chain head and never moves
  backwards.
- Historical trades and holders are non-empty where chain history is known to
  exist.
- Current price and liquidity continue to come from live Pair reserves.
- Graduated 24-hour metrics count Pancake Pair swaps only.
- A new, non-graduated project still returns its Curve trades.

### Market and creator pages

- `/api/market-data` returns the newest eight slots per Factory.
- `/api/market-data?creator=<address>` returns that creator's complete Factory
  history, including projects older than the homepage window.
- A partial Factory or Curve read produces `dataStatus: "partial"` and unknown
  totals, not fabricated zeroes.
- Repeated creator requests reuse the shared short-lived catalog rather than
  rescanning every project.

### Project discussions

- Two simultaneous, differently signed comments from one wallet yield one
  success and one cooldown rejection.
- Replaying the same signature with different hex casing is rejected.
- EOA signatures continue to work.
- A deployed ERC-1271 wallet is accepted; test ERC-6492 when a suitable
  counterfactual wallet fixture is available.
- Moderation reads, hides, restores, and deletes still require an authorized
  admin wallet.
- Complete `docs/comment-moderation-acceptance.md` with an authorized admin
  wallet, including report aggregation, reversible wallet ban, and audit
  export checks.

Check for `error` or `fatal` runtime logs and record response times for the
first historical backfill and a cached follow-up request.

Also verify the RPC cost envelope:

- a homepage load produces cache-only chain-data responses and no BSC RPC;
- two simultaneous stale requests result in one lease winner and one stale or
  503 response;
- no single refresh requests a range wider than 20,000 blocks;
- Alchemy request counts remain flat while the Preview is idle and do not grow
  linearly with the number of browser tabs.

## 5. Rollback

The new database trigger is compatible with both the old and new Web write
paths. If the Web release fails:

1. roll the Web deployment back to the previous known-good version;
2. leave the additive migrations and trigger in place;
3. verify that the old comment route can still insert through the trigger;
4. investigate on a protected Preview before attempting another promotion.

Do not drop the trigger, delete comment rows, rewind chain checkpoints, or
change production secrets as an incident shortcut. Those actions require a
separate reviewed recovery plan and explicit authorization.
