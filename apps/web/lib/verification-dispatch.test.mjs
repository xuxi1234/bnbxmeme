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

test("dispatches verification only after an official recent BNBX launch", () => {
  assert.match(route, /process\.env\.BNBX_GITHUB_ACTIONS_TOKEN/);
  assert.doesNotMatch(createPage, /BNBX_GITHUB_ACTIONS_TOKEN/);
  assert.match(route, /v4StandardFactoryAddress/);
  assert.match(route, /v4RewardsFactoryAddress/);
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
});
