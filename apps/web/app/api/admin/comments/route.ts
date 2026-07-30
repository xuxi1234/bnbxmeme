import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
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

type WalletBanRow = {
  wallet_address: string;
  reason: string;
  active: boolean;
  banned_at: string;
  banned_by: string;
  updated_at: string;
  updated_by: string;
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
  walletBan: WalletBanRow | undefined,
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
    walletBanned: Boolean(walletBan),
    walletBanReason: walletBan?.reason ?? null,
  };
}

function publicWalletBan(row: WalletBanRow) {
  return {
    wallet: row.wallet_address,
    reason: row.reason,
    active: row.active,
    bannedAt: row.banned_at,
    bannedBy: row.banned_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
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
  const bansEndpoint = supabaseTableEndpoint("comment_wallet_bans");
  if (!headers || !endpoint || !reportsEndpoint || !bansEndpoint) {
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
  bansEndpoint.searchParams.set(
    "select",
    "wallet_address,reason,active,banned_at,banned_by,updated_at,updated_by",
  );
  bansEndpoint.searchParams.set("active", "eq.true");
  bansEndpoint.searchParams.set("order", "updated_at.desc");
  bansEndpoint.searchParams.set("limit", "1000");
  const [settings, commentsResponse, reportsResponse, bansResponse] =
    await Promise.all([
      readCommentModerationSettings(),
      fetch(endpoint, {
        headers: { ...headers, Prefer: "count=exact" },
        cache: "no-store",
      }).catch(() => null),
      fetch(reportsEndpoint, {
        headers,
        cache: "no-store",
      }).catch(() => null),
      fetch(bansEndpoint, {
        headers,
        cache: "no-store",
      }).catch(() => null),
    ]);
  if (
    !settings ||
    !commentsResponse?.ok ||
    !reportsResponse?.ok ||
    !bansResponse?.ok
  ) {
    return NextResponse.json(
      { error: "Moderation data is temporarily unavailable" },
      { status: 502 },
    );
  }
  const rows = (await commentsResponse.json()) as AdminCommentRow[];
  const reports = (await reportsResponse.json()) as CommentReportRow[];
  const bans = (await bansResponse.json()) as WalletBanRow[];
  const bansByWallet = new Map(
    bans.map((ban) => [ban.wallet_address, ban] as const),
  );
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
        publicAdminComment(
          row,
          reportsByComment.get(row.id) ?? {},
          bansByWallet.get(row.wallet_address),
        ),
      ),
      bans: bans.map(publicWalletBan),
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

  if (input.action === "set_wallet_ban") {
    const wallet = typeof input.wallet === "string" ? input.wallet.trim() : "";
    const active = input.active;
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (
      !isAddress(wallet) ||
      typeof active !== "boolean" ||
      (active &&
        (reason.length < 1 ||
          reason.length > 280 ||
          /[\u0000-\u001F\u007F]/.test(reason)))
    ) {
      return NextResponse.json(
        { error: "Invalid wallet ban request" },
        {
          status: 400,
        },
      );
    }
    const endpoint = supabaseTableEndpoint("comment_wallet_bans");
    if (!endpoint) {
      return NextResponse.json(
        { error: "Service unavailable" },
        {
          status: 503,
        },
      );
    }
    const normalizedWallet = wallet.toLowerCase();
    const now = new Date().toISOString();
    let response: Response | null;
    if (active) {
      endpoint.searchParams.set("on_conflict", "wallet_address");
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          wallet_address: normalizedWallet,
          reason,
          active: true,
          banned_at: now,
          banned_by: adminWallet,
          updated_at: now,
          updated_by: adminWallet,
        }),
      }).catch(() => null);
    } else {
      endpoint.searchParams.set("wallet_address", `eq.${normalizedWallet}`);
      endpoint.searchParams.set("active", "eq.true");
      response = await fetch(endpoint, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          active: false,
          updated_at: now,
          updated_by: adminWallet,
        }),
      }).catch(() => null);
    }
    if (!response?.ok) {
      return NextResponse.json(
        { error: "Wallet ban could not be updated" },
        {
          status: 502,
        },
      );
    }
    await writeAudit(
      adminWallet,
      active ? "ban_wallet" : "unban_wallet",
      null,
      {
        wallet: normalizedWallet,
        ...(active ? { reason } : {}),
      },
    );
    return NextResponse.json({ ok: true });
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
