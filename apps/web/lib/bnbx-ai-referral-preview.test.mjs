import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, styles, contract] = await Promise.all([
  readFile(
    new URL("../app/bnbx-ai-referral-preview/page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../app/bnbx-ai-referral-preview/page.module.css", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../../../packages/contracts/src/BNBXAiMembership.sol",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("presents the exact 0.1 BNB two-level membership model", () => {
  assert.match(page, /0\.1 BNB/);
  assert.match(page, /0\.05 BNB/);
  assert.match(page, /0\.025 BNB/);
  assert.match(contract, /MEMBERSHIP_PRICE = 0\.1 ether/);
  assert.match(contract, /LEVEL_ONE_REWARD = 0\.05 ether/);
  assert.match(contract, /LEVEL_TWO_REWARD = 0\.025 ether/);
});

test("keeps the preview transaction-safe until a reviewed contract exists", () => {
  assert.match(page, /Preview/);
  assert.match(page, /disabled/);
  assert.doesNotMatch(page, /sendTransaction|writeContract|0x3c97/i);
});

test("includes member-only sharing, earnings details and responsive UX", () => {
  assert.match(page, /navigator\.share/);
  assert.match(page, /navigator\.clipboard/);
  assert.match(page, /一级|Level 1/);
  assert.match(page, /收益明细/);
  assert.match(page, /会员专属|Members only/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});
