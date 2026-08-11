import assert from "node:assert/strict";
import test from "node:test";
import { parseEther } from "viem";
import {
  buildFourMirrorCreateRequest,
  isSubmittedFourMirrorTransaction,
  SubmittedFourMirrorTransactionError,
} from "./four-mirror-deployment.ts";

const account = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const vanitySalt = `0x${"12".repeat(32)}`;

test("builds exactly one fixed Holder-USDT Factory transaction for one mirror", () => {
  const request = buildFourMirrorCreateRequest({
    account,
    name: "Panda AI Companion",
    symbol: "PANDA",
    graduationTargetBNB: 1,
    metadataURI: "ipfs://mirror-metadata",
    vanitySalt,
  });

  assert.equal(
    request.address,
    "0x31ce11e80875e1d698089f71f06acbb27726db95",
  );
  assert.equal(request.functionName, "createVanityToken");
  assert.equal(request.value, parseEther("0.001"));
  assert.equal(request.gas, 12_000_000n);
  assert.equal(request.chain.id, 56);
  assert.equal(request.account, account);
  assert.deepEqual(request.args, [
    {
      name: "Panda AI Companion",
      symbol: "PANDA",
      graduationTargetBNB: 1,
      metadataURI: "ipfs://mirror-metadata",
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

test("rejects any target other than one BNB or non-IPFS prepared metadata", () => {
  const base = {
    account,
    name: "Panda",
    symbol: "PANDA",
    graduationTargetBNB: 1,
    metadataURI: "ipfs://mirror-metadata",
    vanitySalt,
  };
  assert.throws(
    () => buildFourMirrorCreateRequest({ ...base, graduationTargetBNB: 2 }),
    /graduation target/,
  );
  assert.throws(
    () => buildFourMirrorCreateRequest({ ...base, metadataURI: "https://example.com" }),
    /metadata URI/,
  );
  assert.throws(
    () =>
      buildFourMirrorCreateRequest({
        ...base,
        metadataURI: `ipfs://${"a".repeat(250)}`,
      }),
    /metadata URI/,
  );
});

test("marks a Four transaction as submitted when its receipt becomes uncertain", () => {
  const hash = `0x${"56".repeat(32)}`;
  const error = new SubmittedFourMirrorTransactionError(
    hash,
    new Error("RPC timeout"),
  );
  assert.equal(isSubmittedFourMirrorTransaction(error), true);
  assert.equal(error.transactionHash, hash);
  assert.equal(isSubmittedFourMirrorTransaction(new Error("before broadcast")), false);
});
