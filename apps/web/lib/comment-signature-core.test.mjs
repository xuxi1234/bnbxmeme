import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedWalletSignature,
  verifyWithSmartWalletFallback,
} from "./comment-signature-core.ts";

test("accepts variable-length byte signatures within the configured bound", () => {
  assert.equal(isSupportedWalletSignature(`0x${"ab".repeat(65)}`), true);
  assert.equal(isSupportedWalletSignature(`0x${"ab".repeat(256)}`), true);
  assert.equal(isSupportedWalletSignature(`0x${"ab".repeat(8_192)}`), true);
  assert.equal(isSupportedWalletSignature(`0x${"ab".repeat(8_193)}`), false);
  assert.equal(isSupportedWalletSignature("0xabc"), false);
  assert.equal(isSupportedWalletSignature("0xzz"), false);
  assert.equal(isSupportedWalletSignature(`0x${"ab".repeat(9)}`, 8), false);
});

test("uses local EOA verification without an onchain call when possible", async () => {
  let onchainCalls = 0;
  const verified = await verifyWithSmartWalletFallback(
    async () => true,
    async () => {
      onchainCalls += 1;
      return true;
    },
  );
  assert.equal(verified, true);
  assert.equal(onchainCalls, 0);
});

test("falls back to onchain verification for contract wallets", async () => {
  assert.equal(
    await verifyWithSmartWalletFallback(
      async () => false,
      async () => true,
    ),
    true,
  );
  assert.equal(
    await verifyWithSmartWalletFallback(
      async () => {
        throw new Error("not an EOA signature");
      },
      async () => false,
    ),
    false,
  );
});
