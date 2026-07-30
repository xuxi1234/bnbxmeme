import { NextRequest, NextResponse } from "next/server";
import {
  COMMENT_ADMIN_COOKIE,
  authenticateCommentAdmin,
  encodeCommentAdminSession,
  readCommentAdminSession,
} from "@/lib/comment-admin-server";
import {
  readCommentModerationSettings,
  supabaseServiceHeaders,
  supabaseTableEndpoint,
} from "@/lib/comments-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminCommentRow = {
  id: string;
  token_address: string;
  wallet_address: string;
  body: string;
  created_at: string;
  hidden: boolean;
  moderated_at: string | null;
  moderated_by: string | null;
  moderation_reason: string | null;
};

type CommentReportRow = {
  comment_id: string;
  reason: string;
};

function unauthorized() {
  return NextResponse.json(
    { error: "Administrator authorization required" },
    {
      status: 401,
    },
  );
}

function publicAdminComment(
  row: AdminCommentRow,
  reportReasons: Record<string, number>,
) {
  return {
    id: row.id,
    token: row.token_address,
    wallet: row.wallet_address,
    body: row.body,
    createdAt: row.created_at,
    hidden: row.hidden,
    moderatedAt: row.moderated_at,
    moderatedBy: row.moderated_by,
    moderationReason: row.moderation_reason,
    reportCount: Object.values(reportReasons).reduce(
      (total, count) => total + count,
      0,
    ),
    reportReasons,
  };
}

async function writeAudit(
  adminWallet: string,
  action: string,
  commentId: string | null,
  details: Record<string, unknown>,
) {
  const headers = supabaseServiceHeaders();
  const endpoint = supabaseTableEndpoint("comment_moderation_audit");
  if (!headers || !endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      admin_wallet: adminWallet,
      action,
      comment_id: commentId,
      details,
    }),
  }).catch(() => null);
}

export async function GET(request: NextRequest) {
  const adminWallet = await readCommentAdminSession(request);
  if (!adminWallet) return unauthorized();
  const headers = supabaseServiceHeaders();
  const endpoint = supabaseTableEndpoint("token_comments");
  const reportsEndpoint = supabaseTableEndpoint("comment_reports");
  if (!headers || !endpoint || !reportsEndpoint) {
    return NextResponse.json(
      { error: "Moderation service is not configured" },
      { status: 503 },
    );
  }
  endpoint.searchParams.set(
    "select",
    "id,token_address,wallet_address,body,created_at,hidden,moderated_at,moderated_by,moderation_reason",
  );
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "250");
  reportsEndpoint.searchParams.set("select", "comment_id,reason");
  reportsEndpoint.searchParams.set("limit", "5000");
  const [settings, commentsResponse, reportsResponse] = await Promise.all([
    readCommentModerationSettings(),
    fetch(endpoint, {
      headers: { ...headers, Prefer: "count=exact" },
      cache: "no-store",
    }).catch(() => null),
    fetch(reportsEndpoint, {
      headers,
      cache: "no-store",
    }).catch(() => null),
  ]);
  if (!settings || !commentsResponse?.ok || !reportsResponse?.ok) {
    return NextResponse.json(
      { error: "Moderation data is temporarily unavailable" },
      { status: 502 },
    );
  }
  const rows = (await commentsResponse.json()) as AdminCommentRow[];
  const reports = (await reportsResponse.json()) as CommentReportRow[];
  const reportsByComment = new Map<string, Record<string, number>>();
  for (const report of reports) {
    const reasons = reportsByComment.get(report.comment_id) ?? {};
    reasons[report.reason] = (reasons[report.reason] ?? 0) + 1;
    reportsByComment.set(report.comment_id, reasons);
  }
  const contentRange = commentsResponse.headers.get("content-range");
  const totalComments = Number(contentRange?.split("/").at(-1));
  return NextResponse.json(
    {
      adminWallet,
      settings,
      totalComments: Number.isFinite(totalComments)
        ? totalComments
        : rows.length,
      comments: rows.map((row) =>
        publicAdminComment(row, reportsByComment.get(row.id) ?? {}),
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (input.action === "authenticate") {
    const wallet = typeof input.wallet === "string" ? input.wallet : "";
    const signedAt = typeof input.signedAt === "string" ? input.signedAt : "";
    const signature =
      typeof input.signature === "string" ? input.signature : "";
    const adminWallet = await authenticateCommentAdmin({
      wallet,
      signedAt,
      signature,
    });
    if (!adminWallet) return unauthorized();
    const response = NextResponse.json({ ok: true, adminWallet });
    response.cookies.set(
      COMMENT_ADMIN_COOKIE,
      encodeCommentAdminSession({ wallet, signedAt, signature }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 2 * 60 * 60,
      },
    );
    return response;
  }

  const adminWallet = await readCommentAdminSession(request);
  if (!adminWallet) return unauthorized();
  const headers = supabaseServiceHeaders();
  if (!headers) {
    return NextResponse.json(
      { error: "Moderation service is not configured" },
      { status: 503 },
    );
  }

  if (input.action === "logout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COMMENT_ADMIN_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  if (input.action === "set_enabled") {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid enabled state" },
        {
          status: 400,
        },
      );
    }
    const endpoint = supabaseTableEndpoint("comment_moderation_settings");
    if (!endpoint) {
      return NextResponse.json(
        { error: "Service unavailable" },
        {
          status: 503,
        },
      );
    }
    endpoint.searchParams.set("id", "eq.1");
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        comments_enabled: input.enabled,
        updated_at: new Date().toISOString(),
        updated_by: adminWallet,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      return NextResponse.json(
        { error: "Setting could not be updated" },
        {
          status: 502,
        },
      );
    }
    await writeAudit(adminWallet, "set_enabled", null, {
      enabled: input.enabled,
    });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "set_blocked_terms") {
    if (!Array.isArray(input.terms)) {
      return NextResponse.json(
        { error: "Invalid blocked terms" },
        {
          status: 400,
        },
      );
    }
    const terms = [
      ...new Set(
        input.terms
          .filter((term): term is string => typeof term === "string")
          .map((term) => term.normalize("NFKC").trim())
          .filter(Boolean),
      ),
    ];
    if (
      terms.length > 200 ||
      terms.some(
        (term) => term.length > 64 || /[\u0000-\u001F\u007F]/.test(term),
      )
    ) {
      return NextResponse.json(
        { error: "Use at most 200 terms of 1–64 characters" },
        { status: 400 },
      );
    }
    const endpoint = supabaseTableEndpoint("comment_moderation_settings");
    if (!endpoint) {
      return NextResponse.json(
        { error: "Service unavailable" },
        {
          status: 503,
        },
      );
    }
    endpoint.searchParams.set("id", "eq.1");
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        blocked_terms: terms,
        updated_at: new Date().toISOString(),
        updated_by: adminWallet,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      return NextResponse.json(
        { error: "Blocked terms could not be updated" },
        {
          status: 502,
        },
      );
    }
    await writeAudit(adminWallet, "set_blocked_terms", null, {
      termCount: terms.length,
    });
    return NextResponse.json({ ok: true, terms });
  }

  if (input.action === "set_hidden") {
    const commentId =
      typeof input.commentId === "string" ? input.commentId : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        commentId,
      ) ||
      typeof input.hidden !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Invalid moderation request" },
        {
          status: 400,
        },
      );
    }
    const endpoint = supabaseTableEndpoint("token_comments");
    if (!endpoint) {
      return NextResponse.json(
        { error: "Service unavailable" },
        {
          status: 503,
        },
      );
    }
    endpoint.searchParams.set("id", `eq.${commentId}`);
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        hidden: input.hidden,
        moderated_at: input.hidden ? new Date().toISOString() : null,
        moderated_by: input.hidden ? adminWallet : null,
        moderation_reason: input.hidden ? "manual" : null,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      return NextResponse.json(
        { error: "Comment could not be updated" },
        {
          status: 502,
        },
      );
    }
    await writeAudit(adminWallet, "set_hidden", commentId, {
      hidden: input.hidden,
    });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "delete") {
    const commentId =
      typeof input.commentId === "string" ? input.commentId : "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        commentId,
      )
    ) {
      return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
    }
    const endpoint = supabaseTableEndpoint("token_comments");
    if (!endpoint) {
      return NextResponse.json(
        { error: "Service unavailable" },
        {
          status: 503,
        },
      );
    }
    endpoint.searchParams.set("id", `eq.${commentId}`);
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    }).catch(() => null);
    if (!response?.ok) {
      return NextResponse.json(
        { error: "Comment could not be deleted" },
        {
          status: 502,
        },
      );
    }
    await writeAudit(adminWallet, "delete", commentId, {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Unknown moderation action" },
    {
      status: 400,
    },
  );
}
