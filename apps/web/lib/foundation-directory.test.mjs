import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDATION_MULTISIG_ADDRESS,
  FOUNDATION_MULTISIG_EXPLORER_URL,
  SHARE_TOKEN_AMOUNT,
  TOTAL_FOUNDATION_SHARES,
  foundationShareholders,
  foundationSummary,
} from "./foundation-directory.ts";

test("keeps the approved foundation registry in its original order", () => {
  assert.equal(foundationShareholders.length, 34);
  assert.deepEqual(
    foundationShareholders.map(({ id }) => id),
    Array.from({ length: 34 }, (_, index) => String(index + 1).padStart(3, "0")),
  );
  assert.deepEqual(foundationShareholders[0], {
    id: "001",
    name: "道兵导师",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[1], {
    id: "002",
    name: "霏霏老师",
    shares: 2,
  });
  assert.deepEqual(foundationShareholders[8], {
    id: "009",
    name: "张先生",
    shares: 5,
  });
  assert.deepEqual(foundationShareholders[21], {
    id: "022",
    name: "范总",
    shares: 10,
  });
  assert.deepEqual(foundationShareholders[22], {
    id: "023",
    name: "杨爱华",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[23], {
    id: "024",
    name: "空白格",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[24], {
    id: "025",
    name: "神秘大佬、",
    shares: 6,
  });
  assert.deepEqual(foundationShareholders[25], {
    id: "026",
    name: "铠泽",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[26], {
    id: "027",
    name: "567总",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[27], {
    id: "028",
    name: "龙哥",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[28], {
    id: "029",
    name: "养猪仙人",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[29], {
    id: "030",
    name: "相濡以沫大美女",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[30], {
    id: "031",
    name: "阳光老师",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[31], {
    id: "032",
    name: "阿星",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[32], {
    id: "033",
    name: "無敵爾天蠍",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders[33], {
    id: "034",
    name: "鬼王大人老师",
    shares: 1,
  });
});

test("derives the exact approved share and token totals", () => {
  assert.equal(SHARE_TOKEN_AMOUNT, 1_000_000);
  assert.equal(TOTAL_FOUNDATION_SHARES, 500);
  assert.deepEqual(foundationSummary, {
    registeredShares: 53,
    remainingShares: 447,
    registeredTokenAmount: 53_000_000,
    remainingTokenAmount: 447_000_000,
    totalTokenAmount: 500_000_000,
    registrationPercent: 10.6,
  });
});

test("publishes only the approved foundation multisig address", () => {
  assert.equal(
    FOUNDATION_MULTISIG_ADDRESS,
    "0x3485534a9b3a2630febe0708d82d94a63fe9d8bd",
  );
  assert.equal(
    FOUNDATION_MULTISIG_EXPLORER_URL,
    `https://bscscan.com/address/${FOUNDATION_MULTISIG_ADDRESS}`,
  );
  assert.equal(
    Object.values(foundationShareholders).some((entry) => "address" in entry),
    false,
  );
});
