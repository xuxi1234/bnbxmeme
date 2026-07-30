import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { buildCommentMessage } from "@/lib/comment-message";
import { isSupportedWalletSignature } from "@/lib/comment-signature-core";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import {
  mapCommentSubmissionFailure,
  normalizeCommentSignature,
} from "@/lib/comment-submission-core";
import {
  findBlockedTerm,
  readCommentModerationSettings,
  supabaseRpcEndpoint,
  supabaseServiceHeaders,
  supabaseTableEndpoint,
} from "@/lib/comments-server";
import { validateTokenProject } from "@/lib/token-project-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CommentRow = {
  id: string;
  token_address: string;
  wallet_address: string;
  body: string;
  created_at: string;
};

function commentsEndpoint() {
  return supabaseTableEndpoint("token_comments");
}

function publicComment(row: CommentRow) {
  return {
    id: row.id,
    wallet: row.wallet_address,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function projectAccessError(token: string) {
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
  return null;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !isAddress(token)) {
    return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
  }
  const projectError = await projectAccessError(token);
  if (projectError) return projectError;

  const headers = supabaseServiceHeaders();
  const endpoint = commentsEndpoint();
  if (!headers || !endpoint) {
    return NextResponse.json(
      { error: "Community service is not configured" },
      { status: 503 },
    );
  }
  const settings = await readCommentModerationSettings();
  if (!settings) {
    return NextResponse.json(
      { error: "Community moderation service is unavailable" },
      { status: 503 },
    );
  }
  if (!settings.commentsEnabled) {
    return NextResponse.json(
      { enabled: false, comments: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  }
  endpoint.searchParams.set(
    "select",
    "id,token_address,wallet_address,body,created_at",
  );
  endpoint.searchParams.set("chain_id", "eq.56");
  endpoint.searchParams.set("token_address", `eq.${token.toLowerCase()}`);
  endpoint.searchParams.set("hidden", "eq.false");
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "100");
  const response = await fetch(endpoint, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    return NextResponse.json(
      { error: "Community comments are temporarily unavailable" },
      { status: 502 },
    );
  }
  const rows = (await response.json()) as CommentRow[];
  return NextResponse.json(
    { enabled: true, comments: rows.map(publicComment) },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } },
  );
}

export async function POST(request: NextRequest) {
  const headers = supabaseServiceHeaders();
  const endpoint = supabaseRpcEndpoint("submit_token_comment");
  if (!headers || !endpoint) {
    return NextResponse.json(
      { error: "Community service is not configured" },
      { status: 503 },
    );
  }
  let input: {
    token?: string;
    wallet?: string;
    body?: string;
    signedAt?: string;
    signature?: string;
  };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const token = input.token?.trim() ?? "";
  const wallet = input.wallet?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  const signedAt = input.signedAt?.trim() ?? "";
  const signature = input.signature?.trim() ?? "";
  if (!isAddress(token) || !isAddress(wallet)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const projectError = await projectAccessError(token);
  if (projectError) return projectError;

  if (
    body.length < 1 ||
    body.length > 280 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body)
  ) {
    return NextResponse.json(
      { error: "Comment must contain 1–280 valid characters" },
      { status: 400 },
    );
  }
  const settings = await readCommentModerationSettings();
  if (!settings) {
    return NextResponse.json(
      {
        code: "MODERATION_UNAVAILABLE",
        error: "Community moderation service is unavailable",
      },
      { status: 503 },
    );
  }
  if (!settings.commentsEnabled) {
    return NextResponse.json(
      { code: "COMMENTS_DISABLED", error: "Project discussions are disabled" },
      { status: 403 },
    );
  }
  if (findBlockedTerm(body, settings.blockedTerms)) {
    return NextResponse.json(
      {
        code: "CONTENT_BLOCKED",
        error: "This comment does not meet the community rules",
      },
      { status: 422 },
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
      { error: "Comment signature is invalid or expired" },
      { status: 401 },
    );
  }
  const message = buildCommentMessage({ token, wallet, body, signedAt });
  const verified = await verifyWalletMessage({
    address: wallet,
    message,
    signature: signature as `0x${string}`,
  }).catch(() => false);
  if (!verified) {
    return NextResponse.json(
      { error: "Wallet signature verification failed" },
      { status: 401 },
    );
  }

  const submission = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      p_chain_id: 56,
      p_token_address: token.toLowerCase(),
      p_wallet_address: wallet.toLowerCase(),
      p_body: body,
      p_signature: normalizeCommentSignature(signature),
      p_signed_at: new Date(signedTime).toISOString(),
    }),
  }).catch(() => null);
  if (!submission) {
    return NextResponse.json(
      { error: "Community service is temporarily unavailable" },
      { status: 502 },
    );
  }
  const result = (await submission.json().catch(() => null)) as
    CommentRow[] | { code?: string; message?: string } | null;
  if (!submission.ok) {
    const failure = mapCommentSubmissionFailure({
      httpStatus: submission.status,
      code: !Array.isArray(result) ? result?.code : undefined,
      message: !Array.isArray(result) ? result?.message : undefined,
    });
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
  const rows = Array.isArray(result) ? result : [];
  if (!rows[0]) {
    return NextResponse.json(
      { error: "Comment could not be saved" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { comment: publicComment(rows[0]) },
    { status: 201 },
  );
}
