import assert from "node:assert/strict";
import test from "node:test";
import { parseEther } from "viem";
import {
  buildFlapMirrorCreateRequest,
  isSubmittedFlapMirrorTransaction,
  shouldReuseFlapMirrorSession,
  SubmittedFlapMirrorTransactionError,
} from "./flap-mirror-deployment.ts";

const account = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const vanitySalt = `0x${"34".repeat(32)}`;

test("builds one fixed Holder-USDT Factory request for one Flap mirror", () => {
  const request = buildFlapMirrorCreateRequest({
    account,
    name: "Flap Golden Cat",
    symbol: "FGC",
    graduationTargetBNB: 1,
    metadataURI: "ipfs://flap-mirror-metadata",
    vanitySalt,
  });

  assert.equal(request.address, "0x31ce11e80875e1d698089f71f06acbb27726db95");
  assert.equal(request.functionName, "createVanityToken");
  assert.equal(request.value, parseEther("0.001"));
  assert.equal(request.gas, 12_000_000n);
  assert.equal(request.chain.id, 56);
  assert.equal(request.account, account);
  assert.deepEqual(request.args, [
    {
      name: "Flap Golden Cat",
      symbol: "FGC",
      graduationTargetBNB: 1,
      metadataURI: "ipfs://flap-mirror-metadata",
      vanitySalt,
      rewardToken: "0x55d398326f99059ff775485246999027b3197955",
      taxes: {
        buy: { liquidity: 0, rewards: 300, burn: 0 },
        sell: { liquidity: 0, rewards: 300, burn: 0 },
      },
      minimumRewardBalance: 1_000_000n * 10n ** 18n,
    },
  ]);
  assert.equal(Array.isArray(request), false);
});

test("marks receipt uncertainty after broadcast as a queue-stopping submitted transaction", () => {
  const hash = `0x${"12".repeat(32)}`;
  const error = new SubmittedFlapMirrorTransactionError(hash, new Error("RPC timeout"));
  assert.equal(isSubmittedFlapMirrorTransaction(error), true);
  assert.equal(error.transactionHash, hash);
  assert.match(error.message, /already submitted/i);
  assert.equal(isSubmittedFlapMirrorTransaction(new Error("before broadcast")), false);
});

test("reuses only a matching unexpired operator session", () => {
  const session = { wallet: account.toLowerCase(), expiresAt: 2_000 };
  assert.equal(shouldReuseFlapMirrorSession(session, account, 1_000), true);
  assert.equal(shouldReuseFlapMirrorSession(session, account, 2_000), false);
  assert.equal(
    shouldReuseFlapMirrorSession(
      session,
      "0x0000000000000000000000000000000000000001",
      1_000,
    ),
    false,
  );
  assert.equal(shouldReuseFlapMirrorSession(null, account, 1_000), false);
});

test("rejects values outside the reviewed Factory boundary", () => {
  const base = {
    account,
    name: "Flap Golden Cat",
    symbol: "FGC",
    graduationTargetBNB: 1,
    metadataURI: "ipfs://flap-mirror-metadata",
    vanitySalt,
  };
  assert.throws(
    () => buildFlapMirrorCreateRequest({ ...base, name: "x".repeat(41) }),
    /token name/,
  );
  assert.throws(
    () => buildFlapMirrorCreateRequest({ ...base, symbol: "x".repeat(11) }),
    /token symbol/,
  );
  assert.throws(
    () => buildFlapMirrorCreateRequest({ ...base, graduationTargetBNB: 2 }),
    /graduation target/,
  );
  assert.throws(
    () => buildFlapMirrorCreateRequest({ ...base, metadataURI: "https://example.com" }),
    /metadata URI/,
  );
});
