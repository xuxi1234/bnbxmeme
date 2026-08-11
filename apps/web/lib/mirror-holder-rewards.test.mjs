import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  zeroHash,
} from "viem";
import { holderRewardsFactoryAddress } from "./deployments.ts";
import { buildFourMirrorCreateRequest } from "./four-mirror-deployment.ts";
import { holderRewardsFactoryAbi } from "./holder-rewards-factory-deployment.ts";
import * as mirrorPolicy from "./mirror-holder-rewards.ts";

const account = "0xbE37AB912De351B9312FA593C9f99e3279FDB0a2";
const token = "0x1111111111111111111111111111111111111111";
const curve = "0x2222222222222222222222222222222222222222";
const creator = "0x3333333333333333333333333333333333333333";

test("builds an ABI-encodable Holder vanity call with the same immutable init fields", () => {
  const vanityCall = mirrorPolicy.buildMirrorHolderRewardsVanityCall({
    name: "Mirror Cat",
    symbol: "MCAT",
    metadataURI: "ipfs://mirror-cat",
    start: 123n,
    maxIterations: 10_000n,
  });
  const submitted = buildFourMirrorCreateRequest({
    account,
    name: "Mirror Cat",
    symbol: "MCAT",
    graduationTargetBNB: 1,
    metadataURI: "ipfs://mirror-cat",
    vanitySalt: `0x${"12".repeat(32)}`,
  });

  assert.equal(vanityCall.address, holderRewardsFactoryAddress);
  assert.equal(vanityCall.abi, holderRewardsFactoryAbi);
  assert.equal(vanityCall.functionName, "findVanitySalt");
  assert.deepEqual(vanityCall.args, [
    { ...submitted.args[0], vanitySalt: zeroHash },
    123n,
    10_000n,
  ]);
  assert.equal(encodeFunctionData(vanityCall).slice(0, 10), "0xd79439c9");
  assert.equal(encodeFunctionData(submitted).slice(0, 10), "0x388d38ce");
});

test("decodes only TokenCreated emitted by the Holder Factory", () => {
  const tokenCreatedLog = {
    address: holderRewardsFactoryAddress,
    topics: encodeEventTopics({
      abi: holderRewardsFactoryAbi,
      eventName: "TokenCreated",
      args: { token, curve, creator },
    }),
    data: encodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "uint8" },
        { type: "string" },
      ],
      ["Mirror Cat", "MCAT", 1, "ipfs://mirror-cat"],
    ),
  };
  const wrongEventLog = {
    address: holderRewardsFactoryAddress,
    topics: encodeEventTopics({
      abi: holderRewardsFactoryAbi,
      eventName: "CreationFeePaid",
      args: { creator },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [1_000_000_000_000_000n]),
  };

  assert.equal(mirrorPolicy.decodeMirrorHolderCreatedToken([tokenCreatedLog]), token);
  assert.equal(
    mirrorPolicy.decodeMirrorHolderCreatedToken([
      { ...tokenCreatedLog, address: "0x4444444444444444444444444444444444444444" },
    ]),
    null,
  );
  assert.equal(mirrorPolicy.decodeMirrorHolderCreatedToken([wrongEventLog]), null);
});
