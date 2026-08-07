# Recent Trades Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users browse all indexed token trades in a fixed-height, independently scrolling panel that reveals 20 more rows at a time.

**Architecture:** Keep the API and polling unchanged. Add small pure pagination helpers, retain the full sorted trade list in `TokenActivity`, and use the existing scroller as the load-more boundary while preserving its viewport when new rows arrive.

**Tech Stack:** React, TypeScript, Next.js, Node test runner, CSS

## Global Constraints

- Render 20 trades initially and add 20 per bottom reach.
- Preserve sticky header and independent desktop/mobile scrolling.
- Do not modify contracts, Factories, database schema, RPC scan logic, or trading rules.
- Preserve the user's historical reading position when polling prepends new rows.

---

### Task 1: Trade pagination behavior

**Files:**
- Create: `apps/web/lib/trade-pagination-core.ts`
- Create: `apps/web/lib/trade-pagination-core.test.mjs`

**Interfaces:**
- Produces: `initialTradeLimit`, `nextTradeLimit(current, total)`, and `isTradeScrollEnd({scrollTop, clientHeight, scrollHeight})`.

- [ ] **Step 1: Write failing tests** for initial 20-row paging, 20-row increments capped at total, and near-bottom detection.
- [ ] **Step 2: Run `node --test apps/web/lib/trade-pagination-core.test.mjs` and confirm failure because the module is missing.**
- [ ] **Step 3: Implement the three pure helpers with a 20-row page size and a small bottom threshold.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Token activity integration

**Files:**
- Modify: `apps/web/components/token-activity.tsx`
- Modify: `apps/web/lib/mobile-layout.test.mjs`

**Interfaces:**
- Consumes: pagination helpers from Task 1.
- Produces: a fixed scroller that displays `trades.slice(0, visibleTradeLimit)` and loads the next page at the bottom.

- [ ] **Step 1: Add a failing integration guard for full-history retention and paged rendering.**
- [ ] **Step 2: Run the focused mobile-layout test and confirm the old fixed 20-row slice fails the new expectation.**
- [ ] **Step 3: Retain all sorted trades, reset the limit on identity change, load another page on scroll end, and compensate `scrollTop` when polling prepends rows while the reader is away from the top.**
- [ ] **Step 4: Re-run the focused tests and confirm they pass.**

### Task 3: Verification and publication

**Files:**
- Verify only; no additional production files.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a reviewed commit and GitHub PR ready for Vercel production.

- [ ] **Step 1: Run the relevant web test suite, lint, TypeScript, and production build.**
- [ ] **Step 2: Review `git diff` and confirm no out-of-scope files changed.**
- [ ] **Step 3: Commit, push `agent/recent-trades-infinite-scroll`, create and merge the PR after checks pass.**
- [ ] **Step 4: Verify the Vercel production deployment and the live token page.**
