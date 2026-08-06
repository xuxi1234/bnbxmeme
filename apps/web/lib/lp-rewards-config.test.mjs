import assert from "node:assert/strict";
import test from "node:test";
import { zeroAddress } from "viem";
import {
  buildLPRewardsCreateRequest,
  lpRewardTokenAddress,
} from "./lp-rewards-config.ts";

const zeroSalt = `0x${"00".repeat(32)}`;
const side = { burn: "1", liquidity: "2", marketing: "9", rewards: "3" };

test("LP rewards blank asset uses immutable onchain USDT defaulting", () => {
  assert.equal(lpRewardTokenAddress(""), zeroAddress);
  assert.equal(
    lpRewardTokenAddress(" 0x55d398326f99059ff775485246999027b3197955 "),
    "0x55d398326f99059ff775485246999027b3197955",
  );
});

test("LP rewards request is independent and contains only three tax buckets", () => {
  assert.deepEqual(
    buildLPRewardsCreateRequest({
      name: "LP Rewards",
      symbol: "LPR",
      graduationTargetBNB: 1,
      metadataURI: "ipfs://lp",
      vanitySalt: zeroSalt,
      rewardToken: "",
      buyTaxes: side,
      sellTaxes: side,
    }),
    {
      name: "LP Rewards",
      symbol: "LPR",
      graduationTargetBNB: 1,
      metadataURI: "ipfs://lp",
      vanitySalt: zeroSalt,
      rewardToken: zeroAddress,
      taxes: {
        buy: { liquidity: 200, rewards: 300, burn: 100 },
        sell: { liquidity: 200, rewards: 300, burn: 100 },
      },
    },
  );
});
