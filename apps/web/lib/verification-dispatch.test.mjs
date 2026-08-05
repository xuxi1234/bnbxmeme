import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/verify-launch/route.ts", import.meta.url),
  "utf8",
);
const createPage = await readFile(
  new URL("../app/create/page.tsx", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../../../.github/workflows/verify-bsc-mainnet.yml", import.meta.url),
  "utf8",
);
const zeroTaxWorkflow = await readFile(
  new URL(
    "../../../.github/workflows/verify-zero-tax-mainnet.yml",
    import.meta.url,
  ),
  "utf8",
);
const holderRewardsWorkflow = await readFile(
  new URL(
    "../../../.github/workflows/verify-holder-rewards-mainnet.yml",
    import.meta.url,
  ),
  "utf8",
);
const holderRewardsVerifier = await readFile(
  new URL(
    "../../../packages/contracts/scripts/verify-holder-rewards-source-mainnet.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("dispatches verification only after an official recent BNBX launch", () => {
  assert.match(route, /process\.env\.BNBX_GITHUB_ACTIONS_TOKEN/);
  assert.doesNotMatch(createPage, /BNBX_GITHUB_ACTIONS_TOKEN/);
  assert.match(route, /zeroTaxFactoryAddress/);
  assert.match(route, /v4RewardsFactoryAddress/);
  assert.match(route, /holderRewardsFactoryAddress/);
  assert.match(route, /zeroTaxFactoryDeploymentAbi/);
  assert.match(route, /ZERO_TAX_WORKFLOW/);
  assert.match(route, /HOLDER_REWARDS_WORKFLOW/);
  assert.match(route, /receipt\.status !== "success"/);
  assert.match(route, /MAX_CONFIRMATION_AGE_BLOCKS/);
  assert.match(route, /decoded\.eventName !== "TokenCreated"/);
});

test("keeps immediate dispatch best-effort with the scheduled verifier as fallback", () => {
  assert.match(createPage, /fetch\("\/api\/verify-launch"/);
  assert.match(createPage, /keepalive: true/);
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow, /launch_tx_hash:/);
  assert.match(workflow, /run-name: Verify BNBX contracts/);
  assert.match(zeroTaxWorkflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(zeroTaxWorkflow, /launch_tx_hash:/);
  assert.match(zeroTaxWorkflow, /0xcdb3bb57cb27eab36a7c39685afcb93abfec326f/);
  assert.match(holderRewardsWorkflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(holderRewardsWorkflow, /launch_tx_hash:/);
  assert.match(holderRewardsWorkflow, /VERIFY_LAUNCHED_TOKENS: "1"/);
  assert.match(holderRewardsVerifier, /tokenCount/);
  assert.match(holderRewardsVerifier, /allTokens/);
  assert.match(holderRewardsVerifier, /BNBXHolderRewardsToken/);
  assert.match(holderRewardsVerifier, /BondingCurve/);
  assert.match(
    workflow,
    /packages\/contracts\/scripts\/verification-compiler-input\.mjs/,
  );
});
