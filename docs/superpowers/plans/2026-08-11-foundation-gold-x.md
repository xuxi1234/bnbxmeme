# BNBX Foundation Gold X Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both BNBX Foundation shield `F` marks with one reusable shield-free metallic gold `X` SVG and publish a Preview only.

**Architecture:** A focused `FoundationGoldX` presentational component owns the SVG geometry and metallic gradients. The existing floating entry and foundation hero reuse it with size-specific CSS classes, keeping foundation data and behavior untouched.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Node test runner, pnpm/Turborepo.

## Global Constraints

- Use a standalone three-dimensional metallic gold `X`; do not retain a shield outline.
- Replace both the fixed BNBX Foundation entry icon and the `/foundation` hero icon.
- Keep all copy, layout, shareholder data, multisig links, and behavior unchanged.
- Use one reusable SVG component and no new runtime dependency.
- Publish a Draft PR and Vercel Preview only; do not merge `main` or deploy Production.

---

### Task 1: Reusable foundation gold X

**Files:**
- Create: `apps/web/components/foundation-gold-x.tsx`
- Modify: `apps/web/components/foundation-entry.tsx`
- Modify: `apps/web/app/foundation/page.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/lib/foundation-page.test.mjs`

**Interfaces:**
- Consumes: `FoundationGoldXProps = Readonly<{ className?: string }>`.
- Produces: `FoundationGoldX({ className }: FoundationGoldXProps): JSX.Element`, a decorative SVG used by both foundation surfaces.

- [ ] **Step 1: Write the failing test**

Add a behavior-focused test that loads the component and both consumers, verifies both consumers render `<FoundationGoldX className=... />`, verifies the SVG contains a metallic linear gradient and highlight layer, and verifies the old `foundation-entry-shield`, shield polygon, and literal `>F<` are absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @bnbx/web test -- foundation-page.test.mjs`

Expected: FAIL because `foundation-gold-x.tsx` does not exist and both consumers still render the shield `F`.

- [ ] **Step 3: Implement the minimal reusable SVG**

Create `FoundationGoldX` with a `viewBox="0 0 100 100"`, a main crossed-path silhouette, gold face gradient, dark gold edge, and narrow highlight. Import it into the floating entry and foundation page and pass `foundation-entry-mark` and `foundation-hero-mark` respectively.

- [ ] **Step 4: Replace shield CSS with SVG sizing**

Rename `.foundation-entry-shield` to `.foundation-entry-mark`, delete the shield `clip-path`, background, serif typography, and text sizing, then retain responsive dimensions and add size-appropriate drop shadows.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm --filter @bnbx/web test -- foundation-page.test.mjs`

Expected: PASS with both X consumers and no old shield marker.

- [ ] **Step 6: Run full verification**

Run sequentially:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: every command exits `0`; Web tests include the new foundation assertion and the build route table contains `/foundation`.

- [ ] **Step 7: Review and publish Preview**

Inspect `git diff --check`, `git status --short`, and the exact staged diff. Commit only the spec, plan, ignore rule, component, consumers, CSS, and test. Push `agent/foundation-gold-x`, open a Draft PR targeting `main`, wait for the Vercel Preview to become Ready, and visually verify both X marks. Do not merge the PR.
