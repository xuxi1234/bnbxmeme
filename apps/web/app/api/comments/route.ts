import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { buildCommentMessage } from "@/lib/comment-message";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

type CommentRow = {
  id: string;
  token_address: string;
  wallet_address: string;
  body: string;
  created_at: string;
};

function serviceHeaders() {
  if (!supabaseSecret) return null;
  const headers: Record<string, string> = {
    apikey: supabaseSecret,
    "Content-Type": "application/json",
  };
  if (supabaseSecret.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${supabaseSecret}`;
  }
  return headers;
}

function commentsEndpoint() {
  if (!supabaseUrl) return null;
  return new URL("/rest/v1/token_comments", supabaseUrl);
}

function publicComment(row: CommentRow) {
  return {
    id: row.id,
    wallet: row.wallet_address,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const headers = serviceHeaders();
  const endpoint = commentsEndpoint();
  if (!token || !isAddress(token)) {
    return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
  }
  if (!headers || !endpoint) {
    return NextResponse.json(
      { error: "Community service is not configured" },
      { status: 503 },
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
    { comments: rows.map(publicComment) },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } },
  );
}

export async function POST(request: NextRequest) {
  const headers = serviceHeaders();
  const endpoint = commentsEndpoint();
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
  const signedTime = Date.parse(signedAt);
  if (
    !Number.isFinite(signedTime) ||
    signedTime < Date.now() - 10 * 60_000 ||
    signedTime > Date.now() + 2 * 60_000 ||
    !/^0x[0-9a-fA-F]{130}$/.test(signature)
  ) {
    return NextResponse.json(
      { error: "Comment signature is invalid or expired" },
      { status: 401 },
    );
  }
  const message = buildCommentMessage({ token, wallet, body, signedAt });
  const verified = await verifyMessage({
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

  const recent = new URL(endpoint);
  recent.searchParams.set("select", "created_at");
  recent.searchParams.set("wallet_address", `eq.${wallet.toLowerCase()}`);
  recent.searchParams.set(
    "created_at",
    `gte.${new Date(Date.now() - 30_000).toISOString()}`,
  );
  recent.searchParams.set("limit", "1");
  const recentResponse = await fetch(recent, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!recentResponse?.ok) {
    return NextResponse.json(
      { error: "Community service is temporarily unavailable" },
      { status: 502 },
    );
  }
  const recentRows = (await recentResponse.json()) as Array<{
    created_at: string;
  }>;
  if (recentRows.length > 0) {
    return NextResponse.json(
      { error: "Please wait 30 seconds before posting again" },
      { status: 429 },
    );
  }

  const insert = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      chain_id: 56,
      token_address: token.toLowerCase(),
      wallet_address: wallet.toLowerCase(),
      body,
      signature,
      signed_at: new Date(signedTime).toISOString(),
    }),
  }).catch(() => null);
  if (!insert?.ok) {
    return NextResponse.json(
      {
        error:
          insert?.status === 409
            ? "This signed comment was already submitted"
            : "Comment could not be saved",
      },
      { status: insert?.status === 409 ? 409 : 502 },
    );
  }
  const rows = (await insert.json()) as CommentRow[];
  return NextResponse.json(
    { comment: publicComment(rows[0]) },
    { status: 201 },
  );
}
