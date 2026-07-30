import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveCreateSubmitBlocker } from "./create-validation-core.ts";

const valid = {
  isConnected: true,
  factoryAvailable: true,
  templateAvailable: true,
  name: "BNBX",
  symbol: "BNBX",
  communityValid: true,
  initialBuyValid: true,
  taxValid: true,
  rewardsValid: true,
};

test("distinguishes a missing wallet from invalid form fields", () => {
  assert.equal(
    resolveCreateSubmitBlocker({ ...valid, isConnected: false }),
    "wallet",
  );
  assert.equal(
    resolveCreateSubmitBlocker({ ...valid, name: "" }),
    "name",
  );
  assert.equal(
    resolveCreateSubmitBlocker({ ...valid, communityValid: false }),
    "community",
  );
});

test("returns every configuration-specific blocker", () => {
  const cases = [
    ["factoryAvailable", "factory"],
    ["templateAvailable", "template"],
    ["initialBuyValid", "initialBuy"],
    ["taxValid", "tax"],
    ["rewardsValid", "rewards"],
  ];
  for (const [field, blocker] of cases) {
    assert.equal(
      resolveCreateSubmitBlocker({ ...valid, [field]: false }),
      blocker,
    );
  }
  assert.equal(
    resolveCreateSubmitBlocker({ ...valid, symbol: "" }),
    "symbol",
  );
  assert.equal(resolveCreateSubmitBlocker(valid), null);
});

test("wires field errors and the blocker reason into the create form", async () => {
  const page = await readFile(
    new URL("../app/create/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /getCommunityLinkErrors/);
  assert.match(page, /aria-invalid=\{Boolean\(communityLinkErrors\.website\)\}/);
  assert.match(page, /website-error/);
  assert.match(page, /resolveCreateSubmitBlocker/);
  assert.match(page, /copy\.submitBlockers\[submitBlocker\]/);
  assert.match(page, /id="create-submit-blocker"/);
});
