import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveFourMirrorAuthorizedWallets,
  resolveMirrorDeployBlocker,
} from "./four-mirror-page-core.ts";

const authorizedWallet = "0xbe37ab912de351b9312fa593c9f99e3279fdb0a2";
const newlyAuthorizedWallet = "0x50ce802bc302ba36cd91d26f4b3aafeb631806d3";
const ready = {
  isConnected: true,
  address: authorizedWallet,
  authorizedWallets: resolveFourMirrorAuthorizedWallets(authorizedWallet),
  chainId: 56,
  eligible: true,
  busy: false,
};

test("allows every configured BNBX wallet on BSC to deploy", () => {
  assert.equal(resolveMirrorDeployBlocker(ready), null);
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, address: newlyAuthorizedWallet }),
    null,
  );
  assert.equal(
    resolveMirrorDeployBlocker({ ...ready, isConnected: false, address: undefined }),
    "wallet-required",
  );
  assert.equal(
    resolveMirrorDeployBlocker({
      ...ready,
      address: "0x0000000000000000000000000000000000000001",
    }),
    "unauthorized-wallet",
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
