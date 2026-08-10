# Four Mirror Deploy Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and preview a Four.meme mirror queue that deploys one approved zero-tax token per wallet transaction.

**Architecture:** A server-only discovery adapter normalizes and screens current Four graduates. A focused client page prepares IPFS metadata, searches a 1111 vanity salt by read call, and submits exactly one `createVanityToken` write to the existing zero-tax Factory.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, wagmi, viem, Node test runner, Four.meme REST, DexScreener, GoPlus, Pinata.

## Global Constraints

- Work only from `main@9c9492ce7881c43e8de43b835f5d2d883135b4d3` on a feature branch.
- Use Factory `0x26f43d62e1cfadc3d89ff0ffe58375ecbded7330` and creation fee `0.001 BNB`.
- One selected token produces one wallet transaction; never batch or custody private keys.
- Require the configured BNBX admin wallet and BSC chain ID 56.
- Keep the route out of public navigation and publish Preview only.

---

### Task 1: Discovery and screening core

**Files:**
- Create: `apps/web/lib/four-mirror-core.ts`
- Test: `apps/web/lib/four-mirror-core.test.mjs`

**Interfaces:**
- Produces: `normalizeFourCandidate`, `stableGraduationTarget`, `selectPancakePair`, `evaluateMirrorEligibility`.

- [ ] Write failing tests with literal fixtures for normalization, targets, pair selection, thresholds, and every blocking risk.
- [ ] Run the focused test and confirm failure because the module is absent.
- [ ] Implement only the pure functions required by the tests.
- [ ] Run the focused test and confirm all cases pass.

### Task 2: Server discovery and metadata preparation

**Files:**
- Create: `apps/web/lib/four-mirror-server.ts`
- Create: `apps/web/app/api/four-mirrors/route.ts`
- Create: `apps/web/app/api/four-mirrors/prepare/route.ts`
- Test: `apps/web/lib/four-mirror-server.test.mjs`

**Interfaces:**
- Consumes: Task 1 normalization and eligibility functions.
- Produces: `discoverFourMirrors()` and `prepareFourMirrorMetadata(address)`.

- [ ] Write failing tests that inject complete HTTP fixtures and assert fail-closed discovery plus disclosed metadata.
- [ ] Run the focused test and confirm the expected missing-module failure.
- [ ] Implement bounded upstream fetches, caching, revalidation, image pinning, and metadata pinning.
- [ ] Run the focused test and confirm it passes.

### Task 3: Single-transaction request builder

**Files:**
- Create: `apps/web/lib/four-mirror-deployment.ts`
- Test: `apps/web/lib/four-mirror-deployment.test.mjs`

**Interfaces:**
- Produces: `buildFourMirrorCreateRequest` returning the exact one-call wagmi write configuration.

- [ ] Write a failing test asserting one Factory call, `createVanityToken`, 0.001 BNB, fixed target, metadata URI, and supplied vanity salt.
- [ ] Run the focused test and confirm failure for the missing builder.
- [ ] Implement the minimal typed builder.
- [ ] Run the focused test and confirm it passes.

### Task 4: Isolated wallet deployment page

**Files:**
- Create: `apps/web/app/four-mirror-deploy/layout.tsx`
- Create: `apps/web/app/four-mirror-deploy/page.tsx`
- Create: `apps/web/components/four-mirror-deploy-client.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/lib/four-mirror-page.test.mjs`

**Interfaces:**
- Consumes: `/api/four-mirrors`, `/api/four-mirrors/prepare`, Task 3 request builder, existing wallet and Factory ABI.

- [ ] Write a failing acceptance test for disclosure, admin-wallet restriction, independent deploy buttons, and no batch action.
- [ ] Run it and confirm the route is missing.
- [ ] Implement the queue, states, one-button lock, metadata preparation, vanity search, one write, receipt decode, and result links.
- [ ] Run the page and focused tests and confirm they pass.

### Task 5: Full verification and Preview publication

**Files:**
- Modify only files created or touched in Tasks 1-4 and these design documents.

- [ ] Run `pnpm test` and confirm zero failures.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build` serially and confirm exit code 0.
- [ ] Review `git diff --check`, scoped file changes, and secret-pattern scan.
- [ ] Commit the scoped work, push `agent/four-mirror-deploy-preview`, and create a Draft PR targeting `main`.
- [ ] Wait for the Vercel Preview deployment, inspect its build status, and verify `/four-mirror-deploy` without sending a mainnet transaction.

### Task 6: Sequential multi-select deployment queue

**Files:**
- Create: `apps/web/lib/four-mirror-queue.ts`
- Test: `apps/web/lib/four-mirror-queue.test.mjs`
- Modify: `apps/web/lib/four-mirror-core.ts`
- Modify: `apps/web/lib/four-mirror-core.test.mjs`
- Modify: `apps/web/lib/four-mirror-server.ts`
- Modify: `apps/web/lib/four-mirror-server.test.mjs`
- Modify: `apps/web/components/four-mirror-deploy-client.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `runSequentialMirrorQueue`, `isWalletRejection`, and `selectedMirrorFeeBNB`.
- Consumes: the existing direct `createVanityToken` request builder and BSC public client.

- [ ] Write failing tests proving every graduate is selectable and all source metrics or risks become warnings.
- [ ] Run the focused tests and confirm they fail against the prior blocking rules.
- [ ] Write failing tests proving strict sequential execution, continue-on-preparation-failure, stop-on-wallet-rejection, and exact `count × 0.001 BNB` fee display.
- [ ] Run the focused tests and confirm the queue module is absent.
- [ ] Implement the minimal warning-only policy and sequential queue.
- [ ] Run the focused tests and confirm they pass.
- [ ] Add per-card selection, select-all, fee summary, per-item status, transaction links, and token links to the existing Preview page.
- [ ] Run full tests, lint, typecheck, build, diff checks, and sensitive-data checks before updating the Draft PR branch.
