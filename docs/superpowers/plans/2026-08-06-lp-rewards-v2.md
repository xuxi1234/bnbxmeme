# BNBX LP Rewards V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, source-verify, and release a completely independent LP-staker rewards template that automatically adds and burns liquidity, burns launch tokens, and pays a default-USDT or custom WBNB-paired reward asset.

**Architecture:** LP Rewards V2 owns a dedicated Factory, CREATE2 TokenDeployer, Token, per-launch LP Rewards Vault, artifacts, configuration, API dispatch kind, and verification workflow. The Vault uses custody-backed Pancake V2 LP stakes and cumulative reward-per-share accounting; the Token isolates tax processing failures from transfers, while the unchanged BondingCurve owns the internal launch and graduation path.

**Tech Stack:** Solidity 0.8.30, solc-js, Foundry-style Solidity tests run through Ganache/viem, PancakeSwap V2 interfaces, Next.js 15, React 19, wagmi/viem, Node test runner, GitHub Actions, BscScan API, pnpm/Turborepo.

## Global Constraints

- LP Rewards V2 must not share Factory, TokenDeployer, Token, Vault, ABI, bytecode artifact, deployment address, verification input closure, or verification workflow with Holder Rewards V2 or legacy V3/V4 templates.
- Holder Rewards V2 source, deployed addresses, web routing, and verification workflow remain behaviorally unchanged.
- Total supply is 1,000,000,000 tokens: 800,000,000 for the internal curve and 200,000,000 for graduation LP.
- Graduation target is 0.01-0.18 BNB in 0.01 BNB steps; creation fee is 0.001 BNB.
- Buy and sell expose only liquidity, LP rewards, and burn taxes; every component and each side total is capped on-chain at 1,000 bps.
- Blank reward-token input resolves to BSC Mainnet USDT `0x55d398326f99059ff775485246999027b3197955`; custom rewards require a live canonical reward-token/WBNB Pancake V2 pair with non-zero reserves.
- Only LP deposited into the dedicated Vault earns rewards; a resulting non-zero position must represent at least 0.01 WBNB of the official pair's WBNB reserve.
- Graduation LP and automatic-liquidity LP go directly to `0x000000000000000000000000000000000000dEaD`.
- There is no owner, mint, pause, blacklist, arbitrary exemption, tax setter, rescue, creator withdrawal, proxy, or upgrade surface.
- Transfers and LP withdrawals cannot be blocked by tax processing, reward swaps, or one recipient's failed payout.
- Factory, Deployer, every Token, Vault, and Curve must use exact-source verification; creation dispatches immediately and a dedicated five-minute scheduled workflow retries failures.
- Testnet deployment, end-to-end launch, graduation, staking, claiming, and verified source pages are required before any Mainnet deployment or production Factory switch.

---

### Task 1: Lock independent interfaces and security boundaries with RED tests

**Files:**
- Create: `packages/contracts/test/BNBXLPRewardsTemplate.t.sol`
- Modify: `packages/contracts/scripts/run-evm-tests.mjs`

**Interfaces:**
- Produces: executable specifications for `BNBXLPRewardsFactory`, `BNBXLPRewardsTokenDeployer`, `BNBXLPRewardsToken`, and `BNBXLPRewardsVault`.

- [ ] **Step 1: Add an isolation test** that imports only the new LP contracts and instantiates a Factory with dedicated immutable Router, default reward token, and Deployer.
- [ ] **Step 2: Run the focused EVM test** with `pnpm --filter @bnbx/contracts test` and verify failure because the four independent LP V2 contracts do not exist.
- [ ] **Step 3: Add tax-boundary tests** for 0, exact 1,000 bps, component over 1,000 bps, and side-total over 1,000 bps on buy and sell independently.
- [ ] **Step 4: Add reward-token tests** proving blank input normalizes to default USDT, valid live WBNB pairs pass, and missing/zero-reserve/system-address pairs fail.
- [ ] **Step 5: Add role and selector tests** proving CREATE2 parity, Factory-only deployment, one-time launch configuration, direct-to-burn graduation LP, and absence of privileged selectors.
- [ ] **Step 6: Re-run the focused suite** and record that each new behavior fails for the intended missing implementation rather than a fixture error.

### Task 2: Implement the independent Deployer and Factory

**Files:**
- Create: `packages/contracts/src/BNBXLPRewardsTokenDeployer.sol`
- Create: `packages/contracts/src/BNBXLPRewardsFactory.sol`
- Modify: `packages/contracts/test/BNBXLPRewardsTemplate.t.sol`

**Interfaces:**
- Produces: `BNBXLPRewardsTokenDeployer.deploy(bytes32,Init)`, `predict(bytes32,Init)`, and `BNBXLPRewardsFactory.createVanityToken`, `createVanityTokenAndBuy`, `predictTokenAddress`, `findVanitySalt`, `buy`, and `sell`.
- Consumes: immutable Pancake V2 Router/Factory/WBNB addresses and unchanged `BondingCurve` constructor/API.

- [ ] **Step 1: Write the failing Factory/deployer authorization test** proving a non-Factory caller cannot deploy and manager binding cannot be replaced.
- [ ] **Step 2: Run the focused test and verify RED.**
- [ ] **Step 3: Implement the minimal one-time-bound CREATE2 Deployer** with exact init-code prediction and a permanent Factory manager.
- [ ] **Step 4: Implement Factory request validation** for fee, graduation target, metadata length, vanity `1111`, tax caps, and reward-pair liquidity.
- [ ] **Step 5: Implement launch orchestration** that deploys Token, Vault, Curve, creates the official pair, transfers the curve allocation, destroys temporary roles, and sends only the fixed creation fee.
- [ ] **Step 6: Run the focused tests until GREEN, then refactor duplicate request/prediction encoding while keeping them green.**

### Task 3: Implement custody-backed LP Vault and the 0.01 WBNB gate

**Files:**
- Create: `packages/contracts/src/BNBXLPRewardsVault.sol`
- Modify: `packages/contracts/test/BNBXLPRewardsTemplate.t.sol`

**Interfaces:**
- Produces: `stakeLP(uint256)`, `withdrawLP(uint256,address)`, `stakedLP(address)`, `wbnbValueOf(address)`, `claimable(address)`, `claim(address)`, `claimFor(address)`, `syncRewards()`, and bounded `processRewards(uint256)`.
- Consumes: official Pair reserves/total supply, immutable WBNB and reward token, and Token-only reward accounting notification.

- [ ] **Step 1: Add RED tests** for below-boundary rejection, exact 0.01 WBNB acceptance, top-up, partial withdrawal leaving an invalid remnant, and always-allowed full withdrawal.
- [ ] **Step 2: Add RED accounting tests** for no past-reward capture, fair distribution across stake changes, pending rewards with zero shares, and earned rewards surviving full withdrawal.
- [ ] **Step 3: Add RED failure tests** for fee-on-transfer LP rejection by balance delta, failed reward transfers remaining claimable, non-redirectable `claimFor`, reentrancy, and bounded processing.
- [ ] **Step 4: Implement LP custody and reserve-share calculation** as `stakedLP * WBNB reserve / pair.totalSupply()` using the official Pair token ordering.
- [ ] **Step 5: Implement cumulative reward-per-share accounting** with checks-effects-interactions, actual reward balance deltas, a minimum automatic payout, and rotating bounded processing.
- [ ] **Step 6: Exclude zero, burn, Token, Pair, Router, Factory, Deployer, Curve, and Vault addresses permanently.**
- [ ] **Step 7: Run focused tests until GREEN and perform the mutation check for wrong reserve side, `<` versus `<=`, stale debt, and marking failed payouts as claimed.**

### Task 4: Implement Token taxes, burned liquidity, and failure isolation

**Files:**
- Create: `packages/contracts/src/BNBXLPRewardsToken.sol`
- Modify: `packages/contracts/test/BNBXLPRewardsTemplate.t.sol`

**Interfaces:**
- Produces: immutable `SideTaxes`, curve/pair launch locks, `activateTaxes`, `processTaxes`, `processRewards`, LP Vault getters, and standard ERC-20 transfers.
- Consumes: Vault reward notification and Pancake Router swap/add-liquidity functions.

- [ ] **Step 1: Add RED transfer tests** proving taxes are disabled on the curve and graduation seed, activate only once after graduation, and distinguish canonical pair buys/sells from wallet transfers.
- [ ] **Step 2: Add RED bucket tests** proving liquidity, rewards, and burn amounts remain independent and burn tax reaches the burn address immediately.
- [ ] **Step 3: Add RED processing tests** proving automatic LP is sent directly to burn, reward conversion uses the selected asset's WBNB route, and actual received rewards are synchronized.
- [ ] **Step 4: Add RED failure tests** proving Router/reward-token failures emit deferral, retain recoverable bucket balances, and do not block transfers or LP withdrawal.
- [ ] **Step 5: Implement the minimal immutable ERC-20 and launch state machine** without privileged runtime configuration.
- [ ] **Step 6: Implement sell-triggered and permissionless bounded tax processing** with reentrancy protection, deadline/slippage bounds, and retryable accounting.
- [ ] **Step 7: Run focused tests until GREEN, then run all Solidity tests to detect legacy Holder/zero-tax regressions.**

### Task 5: Create an independent compiler artifact, audit, and verification closure

**Files:**
- Create: `packages/contracts/scripts/audit-lp-rewards-template.mjs`
- Create: `packages/contracts/scripts/export-lp-rewards-web-artifact.mjs`
- Create: `packages/contracts/scripts/verify-lp-rewards-source-mainnet.mjs`
- Modify: `packages/contracts/scripts/verification-compiler-input.mjs`
- Modify: `packages/contracts/scripts/verification-compiler-input.test.mjs`
- Modify: `packages/contracts/package.json`
- Generate: `apps/web/lib/lp-rewards-factory-deployment.ts`
- Generate: `apps/web/lib/lp-rewards-token-creation-bytecode.ts`

**Interfaces:**
- Produces: `createLPRewardsVerificationInputs(root)`, exact compiler inputs and constructor encoders for Factory, Deployer, Token, Vault, and Curve, plus independently generated ABI/bytecode.

- [ ] **Step 1: Write a RED compiler-closure test** that removes each required LP source in turn and expects closure generation to fail without touching Holder inputs.
- [ ] **Step 2: Run the Node test and verify RED because no LP-specific closure exists.**
- [ ] **Step 3: Implement LP-only compiler inputs and BscScan submission logic** with idempotent already-verified handling and official-Factory event authentication.
- [ ] **Step 4: Implement the static audit** requiring expected immutable getters and rejecting owner, mint, tax setter, blacklist, rescue, proxy, and withdrawal surfaces.
- [ ] **Step 5: Add LP contracts to build/lint/typecheck and generate web artifacts only from the passing source closure.**
- [ ] **Step 6: Run build, closure tests, and audit; record runtime/init-code sizes and fail if EIP-170/EIP-3860 limits are exceeded.**

### Task 6: Add an independent web creation and LP-management flow

**Files:**
- Modify: `apps/web/lib/advanced-template-config.ts`
- Modify: `apps/web/lib/advanced-template-config.test.mjs`
- Create: `apps/web/lib/lp-rewards-config.ts`
- Create: `apps/web/lib/lp-rewards-config.test.mjs`
- Modify: `apps/web/app/create/page.tsx`
- Modify: `apps/web/lib/template-identification-core.ts`
- Modify: `apps/web/lib/template-identification-core.test.mjs`
- Modify: `apps/web/app/token/[address]/token-trading-page.tsx`
- Modify: `packages/chain-config/src/index.ts`

**Interfaces:**
- Produces: LP-specific Factory routing, request encoding, optional reward-token defaulting, LP stake/withdraw/claim UI, and token-detail reads.
- Consumes: generated LP ABI and dedicated chain-config address/deployment block.

- [ ] **Step 1: Write RED tests** proving LP selection never uses the Holder/legacy Rewards Factory and encodes only liquidity/rewards/burn taxes plus reward token.
- [ ] **Step 2: Write RED UI-state tests** for blank-USDT copy, custom pool validation, fixed 0.01 WBNB explanation, approve/stake/withdraw/claim states, and unsupported pre-activation state.
- [ ] **Step 3: Implement an LP-specific config/request builder** shared by vanity prediction and transaction submission.
- [ ] **Step 4: Route LP creation only through the dedicated Factory** while preserving Standard and Holder behavior byte-for-byte at their boundaries.
- [ ] **Step 5: Add token-page LP controls and immutable LP metrics** with safe read fallbacks for legacy tokens.
- [ ] **Step 6: Run focused web tests until GREEN, then run the full web suite.**

### Task 7: Add immediate and five-minute automatic source verification

**Files:**
- Create: `.github/workflows/verify-lp-rewards-mainnet.yml`
- Modify: `apps/web/app/api/verify-launch/route.ts`
- Modify: `apps/web/lib/verification-dispatch.test.mjs`

**Interfaces:**
- Produces: verification kind `lp-rewards`, authenticated receipt dispatch to the LP-only workflow, and `*/5 * * * *` catalog retries.
- Consumes: official LP Factory address/block and LP verification script from Task 5.

- [ ] **Step 1: Write RED API/workflow tests** proving a receipt from Holder, legacy Rewards, or an unknown Factory cannot dispatch the LP workflow.
- [ ] **Step 2: Add RED schedule and closure tests** requiring five-minute retries, no cancellation of a running job, exact Factory/Deployer/Token/Vault/Curve verification, and already-verified idempotence.
- [ ] **Step 3: Implement `lp-rewards` receipt classification** from the configured official Factory's `TokenCreated` event.
- [ ] **Step 4: Implement immediate GitHub workflow dispatch** using the creation transaction hash and dedicated workflow filename.
- [ ] **Step 5: Implement the five-minute scheduled catalog scan** with bounded batch size, rate limiting, and explicit failure reporting.
- [ ] **Step 6: Run focused dispatch/closure tests until GREEN and confirm existing Holder/zero-tax dispatch tests remain GREEN.**

### Task 8: Testnet deployment and end-to-end acceptance

**Files:**
- Create: `packages/contracts/scripts/deploy-lp-rewards-testnet.mjs`
- Create: `packages/contracts/scripts/accept-lp-rewards-testnet.mjs`
- Create: `docs/lp-rewards-v2-testnet-acceptance.md`
- Modify only after verified deployment: testnet LP addresses/blocks in `packages/chain-config/src/index.ts`

**Interfaces:**
- Produces: reproducible Testnet deployment record and machine-checked launch/graduation/stake/reward/claim/source-verification evidence.

- [ ] **Step 1: Add offline deployment-encoding tests** for Router, default USDT/test reward asset, fee recipient, Deployer, and Factory constructor ordering.
- [ ] **Step 2: Deploy Deployer and Factory to BSC Testnet** only after local full gates pass; record transaction hashes and bytecode hashes.
- [ ] **Step 3: Verify Factory and Deployer source**, then create a `1111` LP-rewards canary and immediately dispatch verification.
- [ ] **Step 4: Graduate the canary, prove graduation LP is burned, add user LP, reject a below-0.01-WBNB stake, accept the exact boundary, generate tax, process rewards, and claim.**
- [ ] **Step 5: Confirm Factory, Deployer, Token, Vault, and Curve source pages are verified and exact runtime metadata hashes match local artifacts.**
- [ ] **Step 6: Save the acceptance evidence and activate only the Testnet LP Factory configuration.**

### Task 9: Full release gates, review, and controlled Mainnet handoff

**Files:**
- Modify: `docs/independent-lp-rewards-template.md`
- Modify only after authorized, verified Mainnet deployment: Mainnet LP address/block configuration and production environment values.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: reviewed PR and Preview; Mainnet deployment remains a separate explicitly authorized step after Testnet acceptance.

- [ ] **Step 1: Run fresh `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` from repository root with zero cached tasks where supported.**
- [ ] **Step 2: Run LP audit, compiler-closure test, deployment encoding test, `git diff --check`, and inspect the exact diff for Holder-template changes.**
- [ ] **Step 3: Require zero unintended Holder Rewards V2 behavior/artifact/workflow/address changes before commit.**
- [ ] **Step 4: Commit and push `feat/lp-rewards-v2`, open a PR, wait for CI and Vercel Preview, and verify creation and token-page flows on Preview.**
- [ ] **Step 5: Obtain independent code/security review and resolve all Critical/Important findings before merge.**
- [ ] **Step 6: Merge the implementation without activating a Mainnet LP Factory; report Testnet contracts, source links, hashes, and acceptance evidence.**
- [ ] **Step 7: Only after explicit Mainnet authorization, deploy and verify Deployer/Factory, compare immutable/runtime values, switch production config, and perform one real canary whose full contract graph auto-verifies.**
