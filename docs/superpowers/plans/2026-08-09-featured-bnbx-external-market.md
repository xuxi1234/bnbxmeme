# Featured BNBX External Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the official BNBX token to the top of both external-market tables in a Vercel Preview.

**Architecture:** A pure helper decides when and where the official entry appears. A small server route normalizes DexScreener's BSC PancakeSwap response, while the existing market component renders the official row with the current table styles.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Vercel Preview

## Global Constraints

- Only `newExternal` and `hotExternal` show the official token.
- The official token is always first and is never duplicated.
- Existing Factory project ranking remains unchanged.
- No production deployment or `main` merge before explicit approval.

---

### Task 1: Featured-entry selection

**Files:**

- Create: `apps/web/lib/featured-market-core.ts`
- Test: `apps/web/lib/featured-market-core.test.mjs`

**Interfaces:**

- Produces: `pinFeaturedExternalEntry(filter, query, entries, featuredEntry)`

- [ ] Write tests covering both external filters, internal filters, matching search, non-matching search, and deduplication.
- [ ] Run the focused test and confirm failure because the helper is missing.
- [ ] Implement the smallest pure helper that passes.
- [ ] Re-run the focused test and confirm success.

### Task 2: Live official-market data and row

**Files:**

- Create: `apps/web/app/api/featured-market/route.ts`
- Modify: `apps/web/components/token-market.tsx`
- Modify: `apps/web/components/language-provider.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**

- Consumes: `pinFeaturedExternalEntry(...)`
- Produces: `/api/featured-market` normalized score payload and the official table row.

- [ ] Add the read-only DexScreener response normalization route.
- [ ] Add the official entry and fetch its score without including it in Factory score polling.
- [ ] Render the official logo, localized badge, and PancakeSwap link.
- [ ] Keep unavailable metrics as `—`.

### Task 3: Validate and publish Preview

**Files:**

- Modify only files listed above.

- [ ] Run focused tests, full web tests, lint, TypeScript, and production build.
- [ ] Review the diff for scope.
- [ ] Push `agent/preview-featured-bnbx-external` and open a Draft PR.
- [ ] Wait for Vercel Preview to become Ready and verify desktop/mobile rendering.
- [ ] Return the Preview URL without merging or deploying Production.
