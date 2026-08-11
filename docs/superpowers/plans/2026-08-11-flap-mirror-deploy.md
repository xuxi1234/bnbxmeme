# Flap Latest Graduated Mirror Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated BNBX Preview tool that lists current BSC Flap graduates and deploys selected community mirrors one transaction at a time through the production zero-tax Factory.

**Architecture:** A Flap-only core validates public board records and a server adapter fetches `https://bnb.taxed.fun/v3/board`, enriches warnings, revalidates source details, and pins Flap-attributed metadata. The UI reuses the proven platform-neutral Four wallet guard and sequential queue while keeping Flap routes, copy, metadata, and request builders independent.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, wagmi, viem, Node test runner, Flap BSC board API, GoPlus, Pinata.

## Global Constraints

- Work only in `agent/flap-mirror-deploy`, based on `main@088b2ee376482859434dc35b7c0247fd776b0850`.
- Accept only valid BSC addresses with `listed === true`, numeric `progress === 100`, and no non-null Flap Vault classification.
- Sort accepted rows by `createdAt` descending and expose at most 20.
- Use `zeroTaxFactoryAddress`, `createVanityToken`, BSC chain ID 56, and exactly `0.001 BNB` per token.
- Reuse the existing authorized operator-wallet allowlist and sequential queue; never accept or store a private key.
- Keep `/flap-mirror-deploy` out of public navigation.
- Deliver a Draft PR and Vercel Preview only; do not merge or deploy Production.

---

### Task 1: Flap record normalization and warning policy

**Files:**
- Create: `apps/web/lib/flap-mirror-core.test.mjs`
- Create: `apps/web/lib/flap-mirror-core.ts`

**Interfaces:**
- Produces: `normalizeFlapCandidate(record)`, `stableFlapGraduationTarget(address)`, `evaluateFlapMirrorWarnings(metrics)`, and `sortNewestFlapCandidates(candidates)`.

- [x] Write literal-fixture tests that reject malformed addresses, Vault rows, `listed !== true`, and `progress !== 100`; verify IPFS normalization, Factory field limits, stable 1–18 targets, newest-first order, taxes, and warning-only risks.
- [x] Run `pnpm --filter @bnbx/web exec node --test --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/flap-mirror-core.test.mjs` and confirm failure because the module is absent.
- [x] Implement the four pure functions with `https://flap.mypinata.cloud/ipfs/<cid>` images and `https://flap.sh/bnb/<address>` source links.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Discovery, source revalidation, and metadata preparation

**Files:**
- Create: `apps/web/lib/flap-mirror-server.test.mjs`
- Create: `apps/web/lib/flap-mirror-server.ts`
- Create: `apps/web/lib/flap-mirror-auth-core.ts`
- Create: `apps/web/lib/flap-mirror-auth.ts`
- Create: `apps/web/app/api/flap-mirrors/route.ts`
- Create: `apps/web/app/api/flap-mirrors/session/route.ts`
- Create: `apps/web/app/api/flap-mirrors/prepare/route.ts`

**Interfaces:**
- Consumes: Task 1 pure functions.
- Produces: `discoverFlapMirrorsWith(fetcher)`, cached `discoverFlapMirrors()`, `prepareFlapMirrorMetadataWith(address, dependencies)`, and `prepareFlapMirrorMetadata(address)`.

- [x] Write complete board/detail/GoPlus fixtures proving only current BSC graduates survive, malformed and Vault rows are skipped, results are newest-first and capped at 20, upstream failure propagates for the route's 502, and security failure becomes `security-unavailable`.
- [x] Write preparation tests proving the detail is revalidated and pinned JSON contains `sourcePlatform: "Flap.sh"`, original contract/source URL, and `社区镜像 / 非原项目官方发行`.
- [x] Run the focused server test and confirm the expected missing-module failure.
- [x] Implement cursor pagination across a bounded 100-row candidate pool, board GET with browser-compatible read-only headers, 60-second in-flight cache, bounded GoPlus enrichment, detail revalidation, streamed 2 MB image/type limits, upstream timeouts, and existing Pinata endpoints.
- [x] Add the discovery, signed operator-session, and authenticated/rate-limited preparation App Router handlers with explicit errors.
- [x] Re-run the focused server tests and confirm they pass.

### Task 3: Independent create request and Flap page

**Files:**
- Create: `apps/web/lib/flap-mirror-deployment.test.mjs`
- Create: `apps/web/lib/flap-mirror-deployment.ts`
- Create: `apps/web/lib/flap-mirror-page.test.mjs`
- Create: `apps/web/app/flap-mirror-deploy/layout.tsx`
- Create: `apps/web/app/flap-mirror-deploy/page.tsx`
- Create: `apps/web/components/flap-mirror-deploy-client.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `buildFlapMirrorCreateRequest(input)`.
- Consumes: `/api/flap-mirrors`, `/api/flap-mirrors/session`, `/api/flap-mirrors/prepare`, `resolveMirrorDeployBlocker`, `runSequentialMirrorQueue`, `selectedMirrorFeeBNB`, and the existing Factory/public client utilities.

- [x] Write a request-builder test asserting the production Factory, `createVanityToken`, `0.001 BNB`, 8,000,000 gas, BSC, Factory field limits, metadata URI, and one request object.
- [x] Write a page acceptance test asserting Flap-only route/API/copy, admin wallet guard, select-all fee summary, sequential queue, disclosure, market/tax fields, and no Four attribution.
- [x] Run both focused tests and confirm the modules/routes are absent.
- [x] Implement the minimal request builder and Flap page by adapting the existing Four UI while retaining the shared guard/queue, adding one gasless session login, stopping safely on post-broadcast uncertainty, and replacing all source-specific names, links, fields, and messages.
- [x] Reuse the existing `.four-mirror-*` responsive styles; add only selectors needed for Flap tax and four-column metrics.
- [x] Re-run focused tests and the entire web test suite.

### Task 4: Verification and Preview publication

**Files:**
- Modify only files listed above plus the approved design and this plan.

- [x] Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` serially and require exit code 0.
- [x] Run `git diff --check`, inspect the scoped diff, and scan changed files for secrets/private keys.
- [ ] Commit the scoped implementation, push `agent/flap-mirror-deploy`, and create a Draft PR targeting `main`.
- [ ] Wait for the Vercel Preview and verify `/flap-mirror-deploy` in a real browser without connecting a wallet or sending any transaction.
- [ ] Confirm the Preview shows only Flap attribution, current graduated rows, selection fee, wallet guard, and no Production navigation entry.
