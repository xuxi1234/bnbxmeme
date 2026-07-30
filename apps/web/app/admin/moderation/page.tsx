"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { WalletButton } from "@/components/wallet-button";
import { useLanguage } from "@/components/language-provider";
import { buildCommentAdminLoginMessage } from "@/lib/comment-admin-message";
import {
  adminCopy,
  interpolate,
  localeByLanguage,
} from "@/lib/localization-copy";

type AdminComment = {
  id: string;
  token: string;
  wallet: string;
  body: string;
  createdAt: string;
  hidden: boolean;
  moderatedAt: string | null;
  moderatedBy: string | null;
  moderationReason: string | null;
  reportCount: number;
  reportReasons: Record<string, number>;
  walletBanned: boolean;
  walletBanReason: string | null;
};

type WalletBan = {
  wallet: string;
  reason: string;
  active: boolean;
  bannedAt: string;
  bannedBy: string;
  updatedAt: string;
  updatedBy: string;
};

type ModerationPayload = {
  adminWallet: string;
  totalComments: number;
  settings: {
    commentsEnabled: boolean;
    blockedTerms: string[];
    updatedAt: string | null;
    updatedBy: string | null;
  };
  comments: AdminComment[];
  bans: WalletBan[];
};

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function CommentModerationPage() {
  const { language, t } = useLanguage();
  const copy = adminCopy[language];
  const { address } = useAccount();
  const { signMessageAsync, isPending } = useSignMessage();
  const [payload, setPayload] = useState<ModerationPayload | null>(null);
  const [terms, setTerms] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/comments", {
      cache: "no-store",
    });
    if (response.status === 401) {
      setPayload(null);
      return false;
    }
    const result = (await response.json()) as ModerationPayload & {
      error?: string;
    };
    if (!response.ok) throw new Error(copy.loadError);
    setPayload(result);
    setTerms(result.settings.blockedTerms.join("\n"));
    return true;
  }, [copy.loadError]);

  useEffect(() => {
    void load()
      .catch(() => setError(copy.loadError))
      .finally(() => setCheckingSession(false));
  }, [copy.loadError, load]);

  async function authenticate() {
    if (!address || busy || isPending) return;
    setError("");
    setBusy(true);
    try {
      const signedAt = new Date().toISOString();
      const message = buildCommentAdminLoginMessage({
        wallet: address,
        signedAt,
      });
      const signature = await signMessageAsync({ message });
      const response = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "authenticate",
          wallet: address,
          signedAt,
          signature,
        }),
      });
      await response.json();
      if (!response.ok) {
        throw new Error(copy.accessDenied);
      }
      await load();
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "";
      setError(
        message === copy.accessDenied ? message : copy.authenticationFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function action(input: Record<string, unknown>) {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      await response.json();
      if (!response.ok) throw new Error(copy.actionFailed);
      await load();
    } catch {
      setError(copy.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  function banWallet(wallet: string) {
    const reason = window.prompt(copy.banReasonPrompt, copy.defaultBanReason);
    if (!reason?.trim()) return;
    void action({
      action: "set_wallet_ban",
      wallet,
      active: true,
      reason: reason.trim(),
    });
  }

  function unbanWallet(wallet: string) {
    if (!window.confirm(copy.unbanConfirm)) return;
    void action({
      action: "set_wallet_ban",
      wallet,
      active: false,
    });
  }

  const filteredComments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? (payload?.comments ?? []).filter((comment) =>
          [comment.token, comment.wallet, comment.body].some((value) =>
            value.toLowerCase().includes(normalized),
          ),
        )
      : [...(payload?.comments ?? [])];
    return matches.sort(
      (left, right) =>
        right.reportCount - left.reportCount ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }, [payload?.comments, query]);

  return (
    <main className="moderation-page">
      <section className="moderation-shell">
        <div className="moderation-heading">
          <div>
            <p className="eyebrow">BNBX ADMIN · COMMENT MODERATION</p>
            <h1>{copy.title}</h1>
            <p>{copy.lead}</p>
          </div>
          <Link href="/">{copy.returnMarket}</Link>
        </div>

        {checkingSession ? (
          <p className="activity-empty">{copy.checkingSession}</p>
        ) : !payload ? (
          <section className="moderation-login">
            <WalletButton />
            <button
              className="button"
              type="button"
              disabled={!address || busy || isPending}
              onClick={authenticate}
            >
              {busy || isPending ? copy.walletConfirm : copy.authenticate}
            </button>
            <small>{copy.loginHelp}</small>
          </section>
        ) : (
          <>
            <section className="moderation-settings">
              <article>
                <div>
                  <span>{copy.commentsFeature}</span>
                  <strong>
                    {payload.settings.commentsEnabled
                      ? copy.enabled
                      : copy.disabled}
                  </strong>
                </div>
                <button
                  className={`button ${
                    payload.settings.commentsEnabled ? "danger" : ""
                  }`}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action({
                      action: "set_enabled",
                      enabled: !payload.settings.commentsEnabled,
                    })
                  }
                >
                  {payload.settings.commentsEnabled
                    ? copy.disableComments
                    : copy.enableComments}
                </button>
                <small>{copy.disableHelp}</small>
              </article>
              <article>
                <label htmlFor="blocked-terms">
                  {copy.blockedTerms}
                  <small>{copy.blockedTermsHelp}</small>
                </label>
                <textarea
                  id="blocked-terms"
                  value={terms}
                  placeholder={copy.blockedTermsPlaceholder}
                  onChange={(event) => setTerms(event.target.value)}
                />
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    action({
                      action: "set_blocked_terms",
                      terms: terms
                        .split(/\r?\n|,/)
                        .map((term) => term.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  {copy.saveTerms}
                </button>
              </article>
            </section>

            {payload.bans.length > 0 && (
              <section className="moderation-bans">
                <div className="moderation-comments-heading">
                  <div>
                    <h2>{copy.bannedWallets}</h2>
                    <span>
                      {interpolate(copy.bannedWalletsSummary, {
                        count: payload.bans.length,
                      })}
                    </span>
                  </div>
                </div>
                <div className="moderation-ban-list">
                  {payload.bans.map((ban) => (
                    <article key={ban.wallet}>
                      <div>
                        <strong>{shortAddress(ban.wallet)}</strong>
                        <span>{ban.reason}</span>
                        <time dateTime={ban.updatedAt}>
                          {new Date(ban.updatedAt).toLocaleString(
                            localeByLanguage[language],
                          )}
                        </time>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => unbanWallet(ban.wallet)}
                      >
                        {copy.unbanWallet}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="moderation-comments">
              <div className="moderation-comments-heading">
                <div>
                  <h2>{copy.commentsList}</h2>
                  <span>
                    {interpolate(copy.commentsSummary, {
                      shown: payload.comments.length,
                      total: payload.totalComments,
                      hidden: payload.comments.filter(
                        (comment) => comment.hidden,
                      ).length,
                    })}
                  </span>
                </div>
                <input
                  value={query}
                  placeholder={copy.searchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {filteredComments.length === 0 ? (
                <p className="activity-empty">{copy.noMatches}</p>
              ) : (
                <div className="moderation-comment-list">
                  {filteredComments.map((comment) => (
                    <article
                      className={comment.hidden ? "is-hidden" : ""}
                      key={comment.id}
                    >
                      <div className="moderation-comment-meta">
                        <span>{shortAddress(comment.wallet)}</span>
                        <Link href={`/token/${comment.token}`}>
                          {shortAddress(comment.token)} ↗
                        </Link>
                        <time dateTime={comment.createdAt}>
                          {new Date(comment.createdAt).toLocaleString(
                            localeByLanguage[language],
                          )}
                        </time>
                        {comment.hidden && <strong>{copy.hidden}</strong>}
                        {comment.walletBanned && (
                          <strong>{copy.walletBanned}</strong>
                        )}
                        {comment.reportCount > 0 && (
                          <strong>
                            {copy.reports} {comment.reportCount}
                          </strong>
                        )}
                      </div>
                      <p>{comment.body}</p>
                      {comment.reportCount > 0 && (
                        <small className="moderation-report-reasons">
                          {Object.entries(comment.reportReasons)
                            .map(([reason, count]) => {
                              const key =
                                reason === "spam"
                                  ? "reportSpam"
                                  : reason === "scam"
                                    ? "reportScam"
                                    : reason === "harassment"
                                      ? "reportHarassment"
                                      : reason === "illegal"
                                        ? "reportIllegal"
                                        : "reportOther";
                              return `${t(key)} ×${count}`;
                            })
                            .join(" · ")}
                        </small>
                      )}
                      <div className="moderation-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            action({
                              action: "set_hidden",
                              commentId: comment.id,
                              hidden: !comment.hidden,
                            })
                          }
                        >
                          {comment.hidden ? copy.restore : copy.hide}
                        </button>
                        <button
                          className={comment.walletBanned ? "" : "danger"}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            comment.walletBanned
                              ? unbanWallet(comment.wallet)
                              : banWallet(comment.wallet)
                          }
                        >
                          {comment.walletBanned
                            ? copy.unbanWallet
                            : copy.banWallet}
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(copy.deleteConfirm)) {
                              void action({
                                action: "delete",
                                commentId: comment.id,
                              });
                            }
                          }}
                        >
                          {copy.delete}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
