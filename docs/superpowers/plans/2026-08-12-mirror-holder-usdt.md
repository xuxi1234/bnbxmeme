# Four/Flap Mirror Holder-USDT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both hidden Four and Flap mirror tools deploy immutable 1-BNB, 3%-buy/3%-sell USDT holder-reward tokens.

**Architecture:** Add one shared mirror tokenomics/request builder and make both source adapters, clients, vanity searches, transaction builders, and receipt parsers consume it. Preserve each source's discovery and metadata pipeline while switching only the BNBX deployment boundary from the zero-tax Factory to the independent Holder Rewards Factory.

**Tech Stack:** Next.js 15, React 19, TypeScript, viem/wagmi, Node test runner, pnpm/turbo.

## Global Constraints

- Production routes remain `/four-mirror-deploy` and `/flap-mirror-deploy` on `x.bnbx.meme`.
- Any valid connected BSC wallet may use either tool after signing its gasless session challenge.
- Every transaction uses graduation target `1`, BSC USDT `0x55d398326f99059ff775485246999027b3197955`, buy rewards `300 bps`, sell rewards `300 bps`, and zero liquidity/burn taxes.
- Minimum eligible balance is exactly `1,000,000 * 10^18` launch-token units.
- Creation fee remains `0.001 BNB`; one wallet confirmation creates one token.
- Routes remain absent from navigation and sitemap, with `noindex/nofollow` and robots blocking.
- No wallet is connected and no chain transaction is sent during automated or browser verification.

---

### Task 1: Shared immutable Holder mirror request

**Files:**
- Create: `apps/web/lib/mirror-holder-rewards.ts`
- Modify: `apps/web/lib/four-mirror-deployment.test.mjs`
- Modify: `apps/web/lib/flap-mirror-deployment.test.mjs`
- Modify: `apps/web/lib/four-mirror-deployment.ts`
- Modify: `apps/web/lib/flap-mirror-deployment.ts`

**Interfaces:**
- Produces: `MIRROR_GRADUATION_TARGET_BNB`, `MIRROR_REWARD_TOKEN`, `MIRROR_MINIMUM_REWARD_BALANCE`, `buildMirrorHolderRewardsTokenRequest(input)`.
- Produces: Four/Flap transaction objects targeting `holderRewardsFactoryAddress` with `holderRewardsFactoryAbi`.

- [ ] Write literal failing tests asserting the Holder Factory address, `createVanityToken`, `1 BNB`, explicit USDT, `{ liquidity: 0, rewards: 300, burn: 0 }` on both sides, `1_000_000n * 10n ** 18n`, `0.001 BNB`, and `12_000_000n` gas.
- [ ] Run both deployment test files and confirm they fail against the zero-tax builders.
- [ ] Implement the shared request builder with fixed tokenomics; keep only identity, metadata URI, vanity salt, and account dynamic.
- [ ] Switch both transaction builders to the Holder Factory and reject any prepared target other than `1`.
- [ ] Rerun both deployment test files and confirm they pass.

### Task 2: Fixed discovery and preparation boundary

**Files:**
- Modify: `apps/web/lib/four-mirror-core.test.mjs`
- Modify: `apps/web/lib/flap-mirror-core.test.mjs`
- Modify: `apps/web/lib/four-mirror-server.test.mjs`
- Modify: `apps/web/lib/flap-mirror-server.test.mjs`
- Modify: `apps/web/lib/four-mirror-core.ts`
- Modify: `apps/web/lib/flap-mirror-core.ts`
- Modify: `apps/web/lib/four-mirror-server.ts`

**Interfaces:**
- Consumes: `MIRROR_GRADUATION_TARGET_BNB`.
- Produces: every discovered and prepared mirror with `graduationTargetBNB: 1`.

- [ ] Replace variable-target expectations with fixtures whose addresses formerly mapped above `1`, and assert discovery/preparation still returns literal `1`.
- [ ] Run the focused core/server tests and confirm the old stable-address mapping fails.
- [ ] Remove deterministic 1-18 mapping from the mirror deployment boundary and use the shared fixed target.
- [ ] Rerun the focused tests and confirm they pass.

### Task 3: Holder vanity search, receipt parsing, and disclosures

**Files:**
- Modify: `apps/web/lib/four-mirror-page.test.mjs`
- Modify: `apps/web/lib/flap-mirror-page.test.mjs`
- Modify: `apps/web/components/four-mirror-deploy-client.tsx`
- Modify: `apps/web/components/flap-mirror-deploy-client.tsx`

**Interfaces:**
- Consumes: `holderRewardsFactoryAddress`, `holderRewardsFactoryAbi`, and `buildMirrorHolderRewardsTokenRequest`.
- Produces: Holder Factory `findVanitySalt` calls using the complete token request and receipt decoding restricted to that Factory.

- [ ] Add failing page tests for Holder Factory imports, the shared request in vanity search, fixed template disclosure (`1 BNB`, buy `3%`, sell `3%`, USDT rewards), and absence of active zero-tax Factory copy.
- [ ] Run both page test files and confirm the old zero-tax clients fail.
- [ ] Update each client to build the full Holder request before vanity search, submit the same request with the discovered salt, and parse only Holder Factory events.
- [ ] Update status text and card copy to clearly separate original-market metrics from the fixed BNBX tokenomics.
- [ ] Rerun both page test files and confirm they pass.

### Task 4: Repository and release verification

**Files:**
- Verify all changed files from Tasks 1-3.

- [ ] Run `pnpm --filter @bnbx/web test` and require zero failures.
- [ ] Run `pnpm test --force`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; require exit code `0` for each.
- [ ] Inspect `git diff --check`, changed filenames, secrets patterns, public navigation/sitemap exclusions, and exact Factory/tokenomics constants.
- [ ] Commit and publish `feat/mirror-holder-usdt-3pct`, create a PR, and wait for the Vercel Preview check.
- [ ] Browser-verify both Preview routes without connecting a wallet; confirm live candidate counts, fixed Holder-USDT disclosure, `1 BNB`, `3% / 3%`, selection fee, disabled deploy button, and no page console errors.
- [ ] Merge the verified PR to `main`, wait for Production READY, and browser-verify `https://x.bnbx.meme/four-mirror-deploy` and `https://x.bnbx.meme/flap-mirror-deploy` with the same no-transaction checks.
