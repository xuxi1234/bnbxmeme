# Holder Rewards V2 Mainnet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and publish a single-transaction BSC Mainnet deployment page for the immutable Holder Rewards V2 Factory.

**Architecture:** Move CREATE2 token construction into a Factory-owned immutable deployer, keep launch/trading orchestration in the Factory, and implement fixed liquidity/rewards/burn accounting in the token. Generate the web artifact from source and isolate `/deploy-mainnet` from legacy deployment choices.

**Tech Stack:** Solidity 0.8.30, solc-js, Foundry-style Solidity tests executed through Ganache/viem, Next.js 15, React 19, wagmi/viem, Node test runner, pnpm/Turborepo.

## Global Constraints

- The mainnet deployment must require exactly one wallet transaction.
- Constructor values are fee recipient `0xdaf4f62914f7f64c9eabfd473f4db4b7e74048a6`, Router `0x10ED43C718714eb63d5aA57B78B54704E256024E`, and default USDT `0x55d398326f99059ff775485246999027b3197955`.
- Only wallet `0xbE37AB912De351B9312FA593C9f99e3279FDB0a2` may use the deployment page.
- Buy and sell each expose liquidity, rewards, and burn taxes with a 10% side cap.
- No privileged owner, mint, tax update, blacklist, withdrawal, marketing, referral, proxy, or upgrade surface may exist.
- The public creation flow is not activated until the newly deployed Factory passes BSC Mainnet verification.

---

### Task 1: Lock the V2 contract interface with failing tests

**Files:**
- Modify: `packages/contracts/test/BNBXHolderRewardsTemplate.t.sol`
- Modify: `packages/contracts/scripts/run-evm-tests.mjs`

**Interfaces:**
- Produces: Solidity regression tests for `SideTaxes`, default reward normalization, deployer authorization, CREATE2 parity, and three tax paths.

- [ ] Add tests that instantiate a three-argument Factory and assert `defaultRewardToken()` and `tokenDeployer()`.
- [ ] Add tests proving a zero reward token resolves to the default and predicts the same address as explicit default USDT.
- [ ] Add tests proving a custom token without a live WBNB pair is rejected.
- [ ] Add tests proving only the Factory can call the dedicated deployer and actual CREATE2 deployment equals prediction.
- [ ] Add tests proving liquidity, rewards, and burn amounts are accounted independently and each side total above 1,000 bps is rejected.
- [ ] Run the focused EVM suite and confirm the new tests fail because the V2 interfaces do not yet exist.

### Task 2: Implement the deployer, Factory normalization, and V2 tax engine

**Files:**
- Create: `packages/contracts/src/BNBXHolderRewardsTokenDeployer.sol`
- Modify: `packages/contracts/src/BNBXHolderRewardsFactory.sol`
- Modify: `packages/contracts/src/BNBXHolderRewardsToken.sol`

**Interfaces:**
- Produces: `BNBXHolderRewardsFactory(address,address,address)`, immutable `defaultRewardToken`, immutable `tokenDeployer`, `SideTaxes`, `processTaxes(uint256,uint256,uint256)`, and holder reward claims.

- [ ] Implement the Factory-only CREATE2 deployer with `deploy`, `predict`, and `initCodeHash` using the exact token `Init` structure.
- [ ] Resolve zero reward tokens to immutable default USDT and validate custom WBNB pools before prediction or deployment.
- [ ] Replace legacy reward-only tax fields with immutable liquidity/rewards/burn side structs and side-total validation.
- [ ] Accumulate burn, liquidity, and reward tax independently; send burn tax immediately to the burn address.
- [ ] Implement bounded permissionless processing that swaps reward tax into the reward asset and converts liquidity tax into permanently burned Pancake V2 LP.
- [ ] Preserve launch-role destruction, pair lock before graduation, reward-share exclusions, and rollback on Router failure.
- [ ] Run the focused EVM suite until all Task 1 tests pass.

### Task 3: Strengthen artifact security checks and regenerate ABI/bytecode

**Files:**
- Modify: `packages/contracts/scripts/audit-holder-rewards-template.mjs`
- Modify: `packages/contracts/scripts/export-holder-rewards-web-artifact.mjs`
- Modify: `packages/contracts/package.json`
- Regenerate: `apps/web/lib/holder-rewards-factory-deployment.ts`
- Regenerate: `apps/web/lib/holder-rewards-token-creation-bytecode.ts`

**Interfaces:**
- Produces: deterministic generated web artifact and machine-readable size/ABI security gate.

- [ ] Add deployer runtime and Factory init-code measurements to the audit.
- [ ] Reject forbidden ABI names and require the three-argument constructor, `tokenDeployer`, unified side taxes, processing, and claims.
- [ ] Ensure holder contracts are compiled by the normal contracts build/lint/typecheck scripts.
- [ ] Run the audit against the incomplete implementation and confirm it catches any missing requirement.
- [ ] Regenerate artifacts only from the passing Solidity source.
- [ ] Run build and audit, recording exact byte sizes and hashes.

### Task 4: Rewire the creation flow for V2 requests

**Files:**
- Modify: `apps/web/lib/advanced-template-config.ts`
- Modify: `apps/web/lib/advanced-template-config.test.mjs`
- Modify: `apps/web/app/create/page.tsx`
- Modify: `apps/web/lib/template-identification-core.ts`
- Modify: `apps/web/lib/template-identification-core.test.mjs`
- Modify: relevant market-data token getter fallbacks under `apps/web/app/api/market-data/route.ts`

**Interfaces:**
- Consumes: generated V2 Factory ABI.
- Produces: Holder requests containing only liquidity/rewards/burn side taxes; zero-address encoding for blank reward token; read compatibility for legacy deployed tokens.

- [ ] Write Node tests for Holder tax normalization, blank/default reward encoding, and removal of marketing fields from Holder requests.
- [ ] Run the focused web tests and confirm RED against the old reward-only request.
- [ ] Implement request builders used by both vanity prediction and transaction submission.
- [ ] Keep custom reward-pool preflight but allow blank input to defer to immutable default USDT.
- [ ] Hide marketing tax and marketing wallet for the Holder template while leaving LP-template behavior unchanged.
- [ ] Update token detail tax resolution to prefer V2 triples and fall back to legacy reward-only getters.
- [ ] Run the focused web tests until GREEN.

### Task 5: Replace `/deploy-mainnet` with the unique V2 deployment action

**Files:**
- Replace: `apps/web/app/deploy-mainnet/page.tsx`
- Create: `apps/web/lib/holder-rewards-mainnet-deployment.ts`
- Modify: `apps/web/lib/holder-rewards-deployment-page.test.mjs`

**Interfaces:**
- Produces: a mainnet-only component that deploys the generated V2 Factory once using exact constants.

- [ ] Write tests that render/inspect the deployment configuration and reject selectors, legacy bytecode, `configureManager`, or multiple deploy actions.
- [ ] Run the focused deployment-page test and confirm it fails against the current re-export.
- [ ] Implement a pure deployment-config module with the three checksummed constructor arguments.
- [ ] Implement the dedicated page with wallet, signer, chain, pending, receipt, and error states.
- [ ] Add a test that ABI-encodes and decodes the constructor suffix and verifies the bytecode hash.
- [ ] Run focused page and encoding tests until GREEN.

### Task 6: Full verification and publication

**Files:**
- Modify: `docs/independent-holder-rewards-template.md`
- Modify only if required by verified deployment: `apps/web/lib/deployments.ts`, deployment-block maps, and Vercel environment configuration.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: published unique link `https://www.bnbx.meme/deploy-mainnet`, followed by a verified Factory activation only after the user returns the transaction hash.

- [ ] Update the template documentation with V2 taxes, default USDT, dedicated deployer, LP burn, and one-transaction deployment.
- [ ] Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` from repository root.
- [ ] Run `pnpm --filter @bnbx/contracts audit:holder-rewards` and an offline deployment encoding check.
- [ ] Inspect `git diff --check`, generated artifact hashes, and the exact intended diff.
- [ ] Commit and push `agent/holder-rewards-v2-mainnet-link`, open a PR, wait for CI/Preview, and verify the preview page.
- [ ] Merge only after gates pass, verify the production alias, and provide the single production URL.
- [ ] After the user returns one deployment hash, verify receipt, runtime, deployer ownership, immutable values, and source; only then activate the new Factory address in the creation flow.
