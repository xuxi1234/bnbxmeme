# BNBX AI Two-Level Referral Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a safe Vercel Preview and tested Solidity source for BNBX AI permanent membership with a two-level 0.1 BNB referral split.

**Architecture:** A non-upgradeable Solidity contract owns membership/referral truth and pull-payment reward balances. The web Preview reads a typed referral model and remains transaction-locked until a contract address is explicitly configured, while the existing production membership/chat authorization remains untouched.

**Tech Stack:** Solidity 0.8.30, Node EVM tests with solc/ganache/viem, Next.js 15, React, TypeScript, wagmi/viem, Node test runner, Vercel Preview.

## Global Constraints

- Exact opening price: `0.1 BNB`.
- Level one: `0.05 BNB`; level two: `0.025 BNB`; AI treasury: at least `0.025 BNB`.
- Missing levels go to the AI treasury, never to another promoter.
- Only members can be referrers.
- Preview must not send transactions without an explicitly configured deployed contract address.
- Do not merge `main`, change production configuration, deploy a contract, or send a mainnet transaction.

---

### Task 1: Contract accounting and security

**Files:**

- Create: `packages/contracts/src/BNBXAiMembership.sol`
- Create: `packages/contracts/scripts/run-ai-membership-tests.mjs`
- Modify: `packages/contracts/package.json`

**Interfaces:**

- Produces: `openMembership(address referrer)`, `withdrawRewards()`, `isMember(address)`, `referrerOf(address)`, `claimableRewards(address)` and membership/reward events.

- [ ] Write EVM tests for the exact split, missing layers, invalid referrals, duplicate membership, withdrawals, and reentrancy.
- [ ] Run `pnpm --filter @bnbx/contracts test:ai-membership` and verify the new tests fail because the contract is absent.
- [ ] Implement the minimal non-upgradeable contract with immutable treasury and constants for all amounts.
- [ ] Run the targeted EVM suite and verify every case passes.
- [ ] Add the contract to the package build/lint/typecheck commands.

### Task 2: Referral domain model and Preview API boundary

**Files:**

- Create: `apps/web/lib/bnbx-ai-referral.ts`
- Create: `apps/web/lib/bnbx-ai-referral.test.mjs`

**Interfaces:**

- Produces: exact amount constants, `buildReferralLink(origin, wallet)`, `normalizeReferrer(value, memberWallet)`, and typed dashboard/detail structures.

- [ ] Write failing tests for exact constants, canonical invite URLs, invalid/self referrers, and Preview lock behavior.
- [ ] Run `node --test apps/web/lib/bnbx-ai-referral.test.mjs` and verify failure.
- [ ] Implement the minimal pure helpers and types.
- [ ] Rerun the targeted test and verify success.

### Task 3: Four-language referral center UI

**Files:**

- Modify: `apps/web/components/bnbx-ai-assistant.tsx`
- Modify: `apps/web/lib/bnbx-ai-copy.ts`
- Modify: `apps/web/app/bnbx-ai.css`
- Modify: `apps/web/lib/bnbx-ai-membership-acceptance.test.mjs`

**Interfaces:**

- Consumes: referral constants/types/helpers from Task 2.
- Produces: transaction-locked referral Preview inside the existing BNBX AI panel.

- [ ] Extend acceptance tests first for 0.1 BNB, two-level split, member-only share center, four languages, and disabled transaction controls when no contract address exists.
- [ ] Run the acceptance test and verify expected failures against the current 1 BNB UI.
- [ ] Implement the compact mobile/desktop referral center, share/copy controls, demo income rows, Preview badge, and safety lock.
- [ ] Rerun the acceptance test and verify success.

### Task 4: Full verification and Preview publication

**Files:**

- Modify only files already listed if verification finds an in-scope defect.

- [ ] Run targeted contract and web tests.
- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --check .`, `pnpm build`, and `pnpm test`.
- [ ] Commit the reviewed feature branch and push it to GitHub.
- [ ] Create a Draft PR targeting `main`; do not merge it.
- [ ] Wait for the Vercel Preview check, open the Preview on desktop and mobile viewports, and verify the Preview badge, 0.1 BNB price, split, sharing, details, and disabled real transactions.
- [ ] Return the Preview URL, Draft PR, commit SHA, verification results, and explicit non-production boundaries.
