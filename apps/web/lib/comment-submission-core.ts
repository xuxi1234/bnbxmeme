export type CommentSubmissionFailure = {
  httpStatus: number;
  code?: string;
  message?: string;
};

export function normalizeCommentSignature(signature: string) {
  return signature.toLowerCase();
}

export function mapCommentSubmissionFailure({
  httpStatus,
  code,
  message,
}: CommentSubmissionFailure) {
  const databaseError = `${code ?? ""} ${message ?? ""}`;
  if (databaseError.includes("COMMENT_RATE_LIMIT")) {
    return {
      status: 429,
      code: "COMMENT_RATE_LIMIT",
      error: "Please wait 30 seconds before posting again",
    } as const;
  }
  if (databaseError.includes("COMMENT_WALLET_BANNED")) {
    return {
      status: 403,
      code: "WALLET_BANNED",
      error: "This wallet is blocked from project discussions",
    } as const;
  }
  if (
    databaseError.includes("COMMENT_SIGNATURE_REPLAY") ||
    code === "23505" ||
    httpStatus === 409
  ) {
    return {
      status: 409,
      code: "COMMENT_SIGNATURE_REPLAY",
      error: "This signed comment was already submitted",
    } as const;
  }
  return {
    status: 502,
    code: "COMMENT_SAVE_FAILED",
    error: "Comment could not be saved",
  } as const;
}
