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
  assert.equal(foundationShareholders.length, 52);
  assert.deepEqual(
    foundationShareholders.map(({ id }) => id),
    Array.from({ length: 52 }, (_, index) => String(index + 1).padStart(3, "0")),
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
  assert.deepEqual(foundationShareholders[34], {
    id: "035",
    name: "琳姐",
    shares: 1,
  });
  assert.deepEqual(foundationShareholders.slice(35), [
    { id: "036", name: "勇往直前", shares: 1 },
    { id: "037", name: "春花秋月", shares: 1 },
    { id: "038", name: "飞飞总", shares: 1 },
    { id: "039", name: "上玄月🌙老师", shares: 1 },
    { id: "040", name: "幸运老师", shares: 1 },
    { id: "041", name: "约你一起奔跑", shares: 1 },
    { id: "042", name: "百万哥", shares: 1 },
    { id: "043", name: "龙行天下", shares: 1 },
    { id: "044", name: "孩子他爹", shares: 2 },
    { id: "045", name: "财神V总", shares: 1 },
    { id: "046", name: "王子", shares: 1 },
    { id: "047", name: "4343姐", shares: 1 },
    { id: "048", name: "大山森林哥", shares: 1 },
    { id: "049", name: "福顺天贝总", shares: 1 },
    { id: "050", name: "MACK总", shares: 1 },
    { id: "051", name: "福", shares: 1 },
    { id: "052", name: "绿水青山", shares: 1 },
  ]);
});

test("derives the exact approved share and token totals", () => {
  assert.equal(SHARE_TOKEN_AMOUNT, 1_000_000);
  assert.equal(TOTAL_FOUNDATION_SHARES, 500);
  assert.deepEqual(foundationSummary, {
    registeredShares: 72,
    remainingShares: 428,
    registeredTokenAmount: 72_000_000,
    remainingTokenAmount: 428_000_000,
    totalTokenAmount: 500_000_000,
    registrationPercent: 14.4,
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
