# Featured BNBX Holder Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the cached BscScan holder count on the official BNBX external-market row.

**Architecture:** A pure parser extracts the explorer holder count from HTML metadata. The existing featured-market API composes that count with DexScreener market data, while the client retains its last successful count across partial refresh failures.

**Tech Stack:** Next.js 15 route handlers, React 19, TypeScript, Node test runner.

## Global Constraints

- Do not modify contracts, factories, databases, chain state, market ordering, or ordinary-token indexing.
- The server must not scan Transfer logs for this homepage metric.
- Missing or malformed upstream data must never become a fabricated number.
- Publish a Preview only; do not merge to `main`.

---

### Task 1: Parse and expose the holder count

**Files:**
- Modify: `apps/web/lib/featured-market-data.ts`
- Modify: `apps/web/lib/featured-market-data.test.mjs`
- Modify: `apps/web/app/api/featured-market/route.ts`

**Interfaces:**
- Produces: `parseBscScanHolderCount(html: string): number | undefined`
- Produces: `FeaturedMarketData.holderCount?: number`

- [x] **Step 1: Write failing parser and normalization tests**

Add literal BscScan metadata fixtures covering `12,019`, `57`, malformed HTML, and unrelated numbers. Assert that only a valid `Holders:` value is returned and that normalized featured data carries a finite holder count.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @bnbx/web test -- lib/featured-market-data.test.mjs`

Expected: FAIL because `parseBscScanHolderCount` and `holderCount` do not exist.

- [x] **Step 3: Implement the pure parser and route composition**

Parse the comma-formatted integer immediately following `Holders:`. Fetch the BscScan token page server-side with `next: { revalidate: 300 }`, combine it with normalized DexScreener data, and retain cache headers with stale revalidation.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @bnbx/web test -- lib/featured-market-data.test.mjs`

Expected: PASS.

### Task 2: Preserve the last successful client value

**Files:**
- Modify: `apps/web/components/token-market.tsx`
- Modify: `apps/web/lib/featured-market-data.test.mjs`

**Interfaces:**
- Consumes: `FeaturedMarketData.holderCount?: number`
- Produces: official row `MarketScore.holderCount` without clearing a previous success on a partial response.

- [x] **Step 1: Write a failing merge-behavior test**

Add and test a pure helper that merges a featured response into the current score, preserving `current.holderCount` only when the response omits it.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @bnbx/web test -- lib/featured-market-data.test.mjs`

Expected: FAIL because the merge helper does not exist.

- [x] **Step 3: Implement the minimal merge helper and use it in the component**

Map all existing featured metrics exactly as today and set `holderCount` to `data.holderCount ?? current.holderCount`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @bnbx/web test -- lib/featured-market-data.test.mjs`

Expected: PASS.

### Task 3: Validate and publish Preview

**Files:**
- Review all changed files only.

- [x] **Step 1: Run complete validation**

Run sequentially: `pnpm --filter @bnbx/web test`, `pnpm --filter @bnbx/web lint`, `pnpm --filter @bnbx/web typecheck`, `pnpm --filter @bnbx/web build`.

- [x] **Step 2: Review the diff and commit**

Confirm the diff contains only the holder-count parser, API composition, client preservation, tests, and design/plan documents. Commit with `fix(web): show official BNBX holder count`.

- [ ] **Step 3: Push and create a Draft PR**

Push `fix/featured-bnbx-holder-count`, open a Draft PR against `main`, and wait for Vercel Preview to become ready. Do not merge.

- [ ] **Step 4: Verify Preview**

Open both external-market tabs in desktop and mobile view. Confirm BNBX remains first and shows a numeric holder count while other rows and sorting remain unchanged.
