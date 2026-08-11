import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveMirrorDeployBlocker } from "./four-mirror-page-core.ts";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

async function source(path) {
  return readFile(new URL(path, `file://${webRoot}/`), "utf8");
}

const ready = {
  isConnected: true,
  address: "0xbe37ab912de351b9312fa593c9f99e3279fdb0a2",
  chainId: 56,
  eligible: true,
  busy: false,
};

test("allows any connected wallet on BSC to deploy", () => {
  assert.equal(resolveMirrorDeployBlocker(ready), null);
  assert.equal(
    resolveMirrorDeployBlocker({
      ...ready,
      address: "0x0000000000000000000000000000000000000001",
    }),
    null,
  );
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, isConnected: false, address: undefined }),
    "wallet-required",
  );
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, chainId: 1 }),
    "wrong-chain",
  );
});

test("blocks rejected projects and duplicate clicks while one token is active", () => {
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, eligible: false }),
    "ineligible",
  );
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, busy: true }),
    "busy",
  );
});

test("allows every displayed Four graduate to enter the sequential queue", () => {
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, eligible: true }),
    null,
  );
});

test("requires a signed rate-limited session from any Four wallet before metadata preparation", async () => {
  const [page, client, prepareRoute, sessionRoute, auth] = await Promise.all([
    source("../app/four-mirror-deploy/page.tsx"),
    source("../components/four-mirror-deploy-client.tsx"),
    source("../app/api/four-mirrors/prepare/route.ts"),
    source("../app/api/four-mirrors/session/route.ts"),
    source("../lib/four-mirror-auth.ts"),
  ]);

  assert.doesNotMatch(page, /BNBX_ADMIN_SIGNING_WALLET|authorizedWallets/);
  assert.match(client, /useSignMessage/);
  assert.match(client, /\/api\/four-mirrors\/session/);
  assert.match(prepareRoute, /requireFourMirrorSession/);
  assert.match(prepareRoute, /consumeFourMirrorPrepareQuota/);
  assert.match(sessionRoute, /createFourMirrorChallenge/);
  assert.match(auth, /isAddress\(address\)/);
  assert.doesNotMatch(auth, /BNBX_ADMIN_SIGNING_WALLET|resolveAdminSigningWallet/);
});

test("uses the fixed Holder-USDT policy for Four vanity search and deployment", async () => {
  const client = await source("../components/four-mirror-deploy-client.tsx");

  assert.match(client, /holderRewardsFactoryAddress/);
  assert.match(client, /buildMirrorHolderRewardsVanityCall/);
  assert.match(client, /decodeMirrorHolderCreatedToken/);
  assert.doesNotMatch(client, /zeroTaxFactoryAddress/);
  assert.match(client, /持币分红 USDT/);
  assert.match(client, /毕业 1 BNB/);
  assert.match(client, /买入 3% · 卖出 3%/);
});
