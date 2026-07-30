import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  buildCommentReportMessage,
  isCommentReportReason,
} from "@/lib/comment-report-core";
import { isSupportedWalletSignature } from "@/lib/comment-signature-core";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import { normalizeCommentSignature } from "@/lib/comment-submission-core";
import {
  supabaseServiceHeaders,
  supabaseTableEndpoint,
} from "@/lib/comments-server";
import { validateTokenProject } from "@/lib/token-project-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const headers = supabaseServiceHeaders();
  const reportsEndpoint = supabaseTableEndpoint("comment_reports");
  const commentsEndpoint = supabaseTableEndpoint("token_comments");
  if (!headers || !reportsEndpoint || !commentsEndpoint) {
    return NextResponse.json(
      { error: "Community service is not configured" },
      { status: 503 },
    );
  }

  let input: {
    token?: string;
    commentId?: string;
    wallet?: string;
    reason?: string;
    signedAt?: string;
    signature?: string;
  };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = input.token?.trim() ?? "";
  const commentId = input.commentId?.trim() ?? "";
  const wallet = input.wallet?.trim() ?? "";
  const reason = input.reason?.trim() ?? "";
  const signedAt = input.signedAt?.trim() ?? "";
  const signature = input.signature?.trim() ?? "";
  if (
    !isAddress(token) ||
    !isAddress(wallet) ||
    !UUID_PATTERN.test(commentId) ||
    !isCommentReportReason(reason)
  ) {
    return NextResponse.json(
      { code: "INVALID_REPORT", error: "Invalid comment report" },
      { status: 400 },
    );
  }

  const project = await validateTokenProject(token);
  if (project.status === "not_found") {
    return NextResponse.json(
      {
        code: "PROJECT_NOT_FOUND",
        error: "Token is not registered by an official BNBX Factory",
      },
      { status: 404 },
    );
  }
  if (project.status === "unavailable") {
    return NextResponse.json(
      {
        code: "PROJECT_VALIDATION_UNAVAILABLE",
        error: "BNB Chain project validation is temporarily unavailable",
      },
      { status: 503 },
    );
  }

  const signedTime = Date.parse(signedAt);
  if (
    !Number.isFinite(signedTime) ||
    signedTime < Date.now() - 10 * 60_000 ||
    signedTime > Date.now() + 2 * 60_000 ||
    !isSupportedWalletSignature(signature)
  ) {
    return NextResponse.json(
      {
        code: "INVALID_SIGNATURE",
        error: "Report signature is invalid or expired",
      },
      { status: 401 },
    );
  }

  const message = buildCommentReportMessage({
    token,
    commentId,
    wallet,
    reason,
    signedAt,
  });
  const verified = await verifyWalletMessage({
    address: wallet,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!verified) {
    return NextResponse.json(
      {
        code: "INVALID_SIGNATURE",
        error: "Wallet signature verification failed",
      },
      { status: 401 },
    );
  }

  commentsEndpoint.searchParams.set("select", "id");
  commentsEndpoint.searchParams.set("id", `eq.${commentId}`);
  commentsEndpoint.searchParams.set("chain_id", "eq.56");
  commentsEndpoint.searchParams.set(
    "token_address",
    `eq.${token.toLowerCase()}`,
  );
  commentsEndpoint.searchParams.set("hidden", "eq.false");
  commentsEndpoint.searchParams.set("limit", "1");
  const commentResponse = await fetch(commentsEndpoint, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!commentResponse?.ok) {
    return NextResponse.json(
      { error: "Community service is temporarily unavailable" },
      { status: 502 },
    );
  }
  const comments = (await commentResponse.json()) as Array<{ id: string }>;
  if (!comments[0]) {
    return NextResponse.json(
      { code: "COMMENT_NOT_FOUND", error: "Comment is not available" },
      { status: 404 },
    );
  }

  const reportResponse = await fetch(reportsEndpoint, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      comment_id: commentId.toLowerCase(),
      reporter_wallet: wallet.toLowerCase(),
      reason,
      signature: normalizeCommentSignature(signature),
      signed_at: new Date(signedTime).toISOString(),
    }),
  }).catch(() => null);
  if (!reportResponse) {
    return NextResponse.json(
      { error: "Community service is temporarily unavailable" },
      { status: 502 },
    );
  }
  if (!reportResponse.ok) {
    if (reportResponse.status === 409) {
      return NextResponse.json(
        {
          code: "REPORT_ALREADY_SUBMITTED",
          error: "This wallet already reported this comment",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Comment report could not be saved" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
