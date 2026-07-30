import assert from "node:assert/strict";
import test from "node:test";
import { buildModerationAuditCsv } from "./moderation-audit-core.ts";

test("exports moderation audit rows as stable quoted CSV", () => {
  assert.equal(
    buildModerationAuditCsv([
      {
        createdAt: "2026-07-30T11:18:35.000Z",
        adminWallet: "0x1111111111111111111111111111111111111111",
        action: "ban_wallet",
        commentId: null,
        details: {
          wallet: "0x2222222222222222222222222222222222222222",
          reason: 'spam, "scam"',
        },
      },
    ]),
    [
      '"created_at","admin_wallet","action","comment_id","details"',
      '"2026-07-30T11:18:35.000Z","0x1111111111111111111111111111111111111111","ban_wallet","","{""wallet"":""0x2222222222222222222222222222222222222222"",""reason"":""spam, \\""scam\\""""}"',
      "",
    ].join("\r\n"),
  );
});

test("neutralizes spreadsheet formula prefixes", () => {
  const csv = buildModerationAuditCsv([
    {
      createdAt: "=NOW()",
      adminWallet: "+cmd",
      action: "-1",
      commentId: "@SUM(A1:A2)",
      details: {},
    },
  ]);
  assert.match(csv, /"'=NOW\(\)"/);
  assert.match(csv, /"'\+cmd"/);
  assert.match(csv, /"'-1"/);
  assert.match(csv, /"'@SUM\(A1:A2\)"/);
});
