import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSanitizedEvidence,
  isExpectedPreviewDeployment,
  ORACLE_UPDATE_GAS,
  quoteConstantProductOut,
  retryServiceUnavailable,
  validateAcceptanceEnvironment,
} from "./futures-preview-acceptance-core.mjs";

const base = {
  FUTURES_CHAIN_ID: "97",
  FUTURES_PREVIEW_URL:
    "https://bnbx-git-feat-bnbx-futures-phase-1-xuxis-projects-7df64997.vercel.app",
  FUTURES_RPC_URL: "https://bsc-testnet-rpc.publicnode.com",
  FUTURES_WALLET_A_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  FUTURES_WALLET_B_PRIVATE_KEY: `0x${"22".repeat(32)}`,
  FUTURES_TEST_USDT: `0x${"1".repeat(40)}`,
  FUTURES_CLEARING_HOUSE: `0x${"2".repeat(40)}`,
  FUTURES_ORDER_BOOK: `0x${"3".repeat(40)}`,
  FUTURES_ORACLE: `0x${"4".repeat(40)}`,
};

test("acceptance rejects non-testnet and Production URLs", () => {
  assert.throws(
    () => validateAcceptanceEnvironment({ ...base, FUTURES_CHAIN_ID: "56" }),
    /chain 97/,
  );
  assert.throws(
    () =>
      validateAcceptanceEnvironment({
        ...base,
        FUTURES_PREVIEW_URL: "https://bnbx.vercel.app",
      }),
    /feature Preview/,
  );
});

test("acceptance waits for the Preview deployment built from the current commit", () => {
  const sha = "51709fd370d9af192f913eb39756ca5d48214ad6";
  assert.equal(isExpectedPreviewDeployment({ commit: sha }, sha), true);
  assert.equal(
    isExpectedPreviewDeployment(
      { commit: "fbd42e839a692159328c8b7ddf69fc3bab5d1345" },
      sha,
    ),
    false,
  );
  assert.equal(isExpectedPreviewDeployment({}, sha), false);
});

test("acceptance evidence cannot contain either wallet key", () => {
  const config = validateAcceptanceEnvironment(base);
  assert.equal(config.chainId, 97);
  assert.deepEqual(
    assertSanitizedEvidence({ wallets: ["0xabc", "0xdef"], status: "PASS" }, [
      config.walletAKey,
      config.walletBKey,
    ]),
    { wallets: ["0xabc", "0xdef"], status: "PASS" },
  );
  assert.throws(
    () =>
      assertSanitizedEvidence({ accidental: config.walletAKey }, [
        config.walletAKey,
        config.walletBKey,
      ]),
    /private key/,
  );
});

test("a second wallet may be generated ephemerally without weakening funding-key validation", () => {
  const config = validateAcceptanceEnvironment({
    ...base,
    FUTURES_WALLET_B_PRIVATE_KEY: "",
  });
  assert.equal(config.walletBKey, undefined);
  assert.throws(
    () =>
      validateAcceptanceEnvironment({
        ...base,
        FUTURES_WALLET_A_PRIVATE_KEY: "",
      }),
    /funding wallet key/,
  );
});

test("oracle maintenance reserves enough gas to cross the fail-closed read guard", () => {
  assert.equal(ORACLE_UPDATE_GAS, 600_000n);
  assert.ok(ORACLE_UPDATE_GAS > 350_000n);
});

test("market recovery retries only transient Preview service failures", async () => {
  let calls = 0;
  const result = await retryServiceUnavailable(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("service_unavailable");
      return "Open";
    },
    { wait: async () => {} },
  );
  assert.equal(result, "Open");
  assert.equal(calls, 3);

  await assert.rejects(
    retryServiceUnavailable(async () => {
      throw new Error("unauthorized");
    }),
    /unauthorized/,
  );
});

test("testnet collateral swap quote is bounded and rejects empty reserves", () => {
  const output = quoteConstantProductOut(50n, 1_000n, 10_000n);
  assert.equal(output, 474n);
  assert.ok(output < 10_000n);
  assert.throws(() => quoteConstantProductOut(1n, 0n, 1n), /positive swap/);
});
