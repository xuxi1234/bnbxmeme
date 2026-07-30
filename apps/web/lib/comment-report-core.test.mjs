import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommentReportMessage,
  COMMENT_REPORT_REASONS,
  isCommentReportReason,
} from "./comment-report-core.ts";

test("builds a deterministic wallet-bound comment report message", () => {
  assert.equal(
    buildCommentReportMessage({
      token: "0xf7e01DeaF3F9261383185b2e1388a42259141111",
      commentId: "9D8D8EA1-7A31-4B8C-9F21-010203040506",
      wallet: "0x1111111111111111111111111111111111111111",
      reason: "scam",
      signedAt: "2026-07-30T11:12:40.000Z",
    }),
    [
      "BNBX Community Comment Report",
      "Chain: BNB Smart Chain (56)",
      "Token: 0xf7e01deaf3f9261383185b2e1388a42259141111",
      "Comment: 9d8d8ea1-7a31-4b8c-9f21-010203040506",
      "Reporter: 0x1111111111111111111111111111111111111111",
      "Reason: scam",
      "Signed at: 2026-07-30T11:12:40.000Z",
    ].join("\n"),
  );
});

test("accepts only the published report reasons", () => {
  assert.deepEqual(COMMENT_REPORT_REASONS, [
    "spam",
    "scam",
    "harassment",
    "illegal",
    "other",
  ]);
  assert.equal(isCommentReportReason("spam"), true);
  assert.equal(isCommentReportReason("other"), true);
  assert.equal(isCommentReportReason(""), false);
  assert.equal(isCommentReportReason("politics"), false);
});
