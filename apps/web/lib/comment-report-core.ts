export const COMMENT_REPORT_REASONS = [
  "spam",
  "scam",
  "harassment",
  "illegal",
  "other",
] as const;

export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number];

export function isCommentReportReason(
  value: string,
): value is CommentReportReason {
  return COMMENT_REPORT_REASONS.includes(value as CommentReportReason);
}

export function buildCommentReportMessage(input: {
  token: string;
  commentId: string;
  wallet: string;
  reason: CommentReportReason;
  signedAt: string;
}) {
  return [
    "BNBX Community Comment Report",
    "Chain: BNB Smart Chain (56)",
    `Token: ${input.token.toLowerCase()}`,
    `Comment: ${input.commentId.toLowerCase()}`,
    `Reporter: ${input.wallet.toLowerCase()}`,
    `Reason: ${input.reason}`,
    `Signed at: ${input.signedAt}`,
  ].join("\n");
}
