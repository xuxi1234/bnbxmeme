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
      error: "Please wait 30 seconds before posting again",
    } as const;
  }
  if (
    databaseError.includes("COMMENT_SIGNATURE_REPLAY") ||
    code === "23505" ||
    httpStatus === 409
  ) {
    return {
      status: 409,
      error: "This signed comment was already submitted",
    } as const;
  }
  return {
    status: 502,
    error: "Comment could not be saved",
  } as const;
}
