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

test("builds exactly one zero-tax Factory transaction for one mirror", () => {
  const request = buildFourMirrorCreateRequest({
    account,
    name: "Panda AI Companion",
    symbol: "PANDA",
    graduationTargetBNB: 7,
    metadataURI: "ipfs://mirror-metadata",
    vanitySalt,
  });

  assert.equal(
    request.address,
    "0x26f43d62e1cfadc3d89ff0ffe58375ecbded7330",
  );
  assert.equal(request.functionName, "createVanityToken");
  assert.equal(request.value, parseEther("0.001"));
  assert.equal(request.gas, 8_000_000n);
  assert.equal(request.chain.id, 56);
  assert.equal(request.account, account);
  assert.deepEqual(request.args, [
    {
      name: "Panda AI Companion",
      symbol: "PANDA",
      graduationTargetBNB: 7,
      metadataURI: "ipfs://mirror-metadata",
      vanitySalt,
    },
  ]);
  assert.equal(Array.isArray(request), false);
});

test("rejects a changed target or non-IPFS prepared metadata", () => {
  const base = {
    account,
    name: "Panda",
    symbol: "PANDA",
    graduationTargetBNB: 7,
    metadataURI: "ipfs://mirror-metadata",
    vanitySalt,
  };
  assert.throws(
    () => buildFourMirrorCreateRequest({ ...base, graduationTargetBNB: 19 }),
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
