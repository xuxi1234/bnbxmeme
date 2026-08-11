# BNBX Foundation Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-RPC BNBX Foundation entry and static shareholder directory at `/foundation`, then publish it only as a Vercel Preview.

**Architecture:** Keep the canonical registry and derived totals in a focused TypeScript module. Render them through one localized client page, and expose a separate fixed link component from the root layout so the entry is available site-wide without coupling it to X-One behavior.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS, Node test runner, Vercel Git Preview.

## Global Constraints

- Do not display individual shareholder wallet addresses.
- Do not display market-cap release milestones or release rules.
- One share equals exactly 1,000,000 BNBX; the foundation total is exactly 500 shares.
- The multisig address is exactly `0x3485534a9b3a2630febe0708d82d94a63fe9d8bd`.
- Use static version-controlled data; do not call RPC, databases, or wallet APIs.
- Support the existing `zh`, `en`, `ko`, and `ja` language state and dark/light themes.
- Deliver only a Draft PR and Vercel Preview; do not merge `main` or deploy Production.

---

### Task 1: Canonical Foundation Registry

**Files:**
- Create: `apps/web/lib/foundation-directory.ts`
- Test: `apps/web/lib/foundation-directory.test.mjs`

**Interfaces:**
- Produces: `FOUNDATION_MULTISIG_ADDRESS`, `SHARE_TOKEN_AMOUNT`, `TOTAL_FOUNDATION_SHARES`, `foundationShareholders`, and `foundationSummary`.

- [ ] **Step 1: Write the failing registry test**

Assert that the new module contains 22 ordered entries, assigns two shares to `002`, ten shares to `022`, calculates 32 registered shares and 468 remaining shares, and builds the exact BscScan address URL.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @bnbx/web test -- foundation-directory.test.mjs`

Expected: FAIL because `foundation-directory.ts` does not exist.

- [ ] **Step 3: Implement the minimal canonical registry**

Create immutable shareholder records with `{ id, name, shares }`, and derive token totals, registered shares, remaining shares, and percentage from the registry.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON apps/web/lib/foundation-directory.test.mjs`

Expected: all foundation registry tests PASS.

### Task 2: Localized Page and Global Entry

**Files:**
- Create: `apps/web/lib/foundation-copy.ts`
- Create: `apps/web/app/foundation/layout.tsx`
- Create: `apps/web/app/foundation/page.tsx`
- Create: `apps/web/components/foundation-entry.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/sitemap.ts`
- Test: `apps/web/lib/foundation-page.test.mjs`

**Interfaces:**
- Consumes: registry exports from Task 1 and `useLanguage()`.
- Produces: `/foundation` route and an accessible, site-wide link to it.

- [ ] **Step 1: Write the failing integration source test**

Assert that the page consumes derived summary data, renders the four approved columns, provides copy/BscScan actions, the root layout includes the entry, the sitemap includes `/foundation`, and no personal address or release-rule fields are present.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/web/lib/foundation-page.test.mjs`

Expected: FAIL because the page and entry files do not exist.

- [ ] **Step 3: Implement the page, entry, metadata, localization, and responsive styles**

Build the page from the registry, format integer quantities with locale-aware separators, place the fixed entry on the left, and use CSS table rows that become readable cards below 720px.

- [ ] **Step 4: Run the focused page and registry tests and verify GREEN**

Run: `node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON apps/web/lib/foundation-directory.test.mjs apps/web/lib/foundation-page.test.mjs`

Expected: all tests PASS.

### Task 3: Validation and Preview Publishing

**Files:**
- Verify all changed files from Tasks 1–2.

**Interfaces:**
- Produces: tested feature branch, Draft PR, and Vercel Preview URL.

- [ ] **Step 1: Run complete web validation**

Run: `pnpm --filter @bnbx/web test && pnpm --filter @bnbx/web lint && pnpm --filter @bnbx/web typecheck && pnpm --filter @bnbx/web build`

Expected: exit code 0 for all four commands.

- [ ] **Step 2: Inspect the final diff and sensitive-data scope**

Run: `git diff --check && git status --short && git diff --stat && rg -n "(API_KEY|PRIVATE_KEY|RPC_URL)" apps/web docs/superpowers`

Expected: no whitespace errors, only intended files changed, and no new secrets.

- [ ] **Step 3: Commit and push the feature branch**

Stage only the files listed in this plan, commit as `Add BNBX foundation directory`, and push `agent/bnbx-foundation-preview` to `origin`.

- [ ] **Step 4: Create a Draft PR and wait for Vercel Preview**

Create a Draft PR targeting `main`; verify the deployment target is Preview and status is Ready. Do not merge or promote it.
