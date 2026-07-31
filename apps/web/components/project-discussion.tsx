"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildCommentMessage } from "@/lib/comment-message";
import {
  buildCommentReportMessage,
  type CommentReportReason,
} from "@/lib/comment-report-core";
import { localeByLanguage } from "@/lib/localization-copy";
import { useLanguage } from "./language-provider";

type ProjectComment = {
  id: string;
  wallet: string;
  body: string;
  createdAt: string;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ProjectDiscussion({ token }: { token: `0x${string}` }) {
  const { address } = useAccount();
  const { signMessageAsync, isPending } = useSignMessage();
  const { language, t } = useLanguage();
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [reportingId, setReportingId] = useState("");
  const [reportedIds, setReportedIds] = useState<Set<string>>(() => new Set());
  const [reportReasons, setReportReasons] = useState<
    Record<string, CommentReportReason>
  >({});
  const [error, setError] = useState("");
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const loadComments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/comments?token=${token}`, {
          signal,
        });
        if (!response.ok) throw new Error("comments unavailable");
        const data = (await response.json()) as {
          enabled: boolean;
          comments: ProjectComment[];
        };
        if (!signal?.aborted) {
          setEnabled(data.enabled);
          setComments(data.comments);
        }
      } catch {
        if (!signal?.aborted) setError(t("commentsUnavailable"));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [t, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadComments(controller.signal);
    return () => controller.abort();
  }, [loadComments]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!address || !body.trim() || isPosting) return;
    setError("");
    setIsPosting(true);
    try {
      const trimmedBody = body.trim();
      const signedAt = new Date().toISOString();
      const message = buildCommentMessage({
        token,
        wallet: address,
        body: trimmedBody,
        signedAt,
      });
      const signature = await signMessageAsync({ message });
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          wallet: address,
          body: trimmedBody,
          signedAt,
          signature,
        }),
      });
      const result = (await response.json()) as {
        comment?: ProjectComment;
        code?: string;
        error?: string;
      };
      if (!response.ok || !result.comment) {
        if (result.code === "CONTENT_BLOCKED") {
          throw new Error(t("commentBlocked"));
        }
        if (result.code === "COMMENTS_DISABLED") {
          setEnabled(false);
          throw new Error(t("commentsDisabled"));
        }
        if (result.code === "WALLET_BANNED") {
          throw new Error(t("walletBanned"));
        }
        throw new Error(t("commentFailed"));
      }
      setComments((current) => [result.comment!, ...current]);
      setBody("");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "";
      setError(
        message === t("commentBlocked") ||
          message === t("commentsDisabled") ||
          message === t("walletBanned")
          ? message
          : t("commentFailed"),
      );
    } finally {
      setIsPosting(false);
    }
  }

  async function reportComment(commentId: string) {
    if (!address || reportingId || reportedIds.has(commentId)) return;
    setError("");
    setReportingId(commentId);
    try {
      const reason = reportReasons[commentId] ?? "spam";
      const signedAt = new Date().toISOString();
      const message = buildCommentReportMessage({
        token,
        commentId,
        wallet: address,
        reason,
        signedAt,
      });
      const signature = await signMessageAsync({ message });
      const response = await fetch("/api/comments/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          commentId,
          wallet: address,
          reason,
          signedAt,
          signature,
        }),
      });
      const result = (await response.json()) as {
        code?: string;
        error?: string;
      };
      if (result.code === "WALLET_BANNED") {
        throw new Error(t("walletBanned"));
      }
      if (!response.ok && result.code !== "REPORT_ALREADY_SUBMITTED") {
        throw new Error(t("reportFailed"));
      }
      setReportedIds((current) => new Set(current).add(commentId));
    } catch (reportError) {
      const message = reportError instanceof Error ? reportError.message : "";
      setError(message === t("walletBanned") ? message : t("reportFailed"));
    } finally {
      setReportingId("");
    }
  }

  const locale = localeByLanguage[language];

  if (!isLoading && !enabled) return null;

  return (
    <section
      className={`project-discussion${mobileExpanded ? " mobile-expanded" : ""}`}
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">SIGNED COMMUNITY</p>
          <h2>{t("discussion")}</h2>
        </div>
        <div className="discussion-heading-actions">
          <span>{t("signatureNoGas")}</span>
          <button
            className="mobile-section-toggle"
            type="button"
            aria-expanded={mobileExpanded}
            onClick={() => setMobileExpanded((expanded) => !expanded)}
          >
            <span>{mobileExpanded ? t("hideLinks") : t("moreLinks")}</span>
            <strong aria-hidden="true">{mobileExpanded ? "−" : "+"}</strong>
          </button>
        </div>
      </div>
      <form onSubmit={submit}>
        <textarea
          maxLength={280}
          value={body}
          placeholder={
            address ? t("commentPlaceholder") : t("connectToComment")
          }
          disabled={!address || isPosting || isPending}
          onChange={(event) => setBody(event.target.value)}
        />
        <div>
          <small>{body.length}/280</small>
          <button
            className="button"
            type="submit"
            disabled={!address || !body.trim() || isPosting || isPending}
          >
            {isPosting || isPending ? t("walletConfirm") : t("postComment")}
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="activity-empty">{t("loading")}</p>
      ) : comments.length === 0 ? (
        <p className="activity-empty">{t("noComments")}</p>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => (
            <article key={comment.id}>
              <div>
                <strong>{shortAddress(comment.wallet)}</strong>
                <time dateTime={comment.createdAt}>
                  {new Intl.DateTimeFormat(locale, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(comment.createdAt))}
                </time>
              </div>
              <p>{comment.body}</p>
              <div className="comment-actions">
                <select
                  aria-label={t("reportReason")}
                  value={reportReasons[comment.id] ?? "spam"}
                  disabled={
                    !address ||
                    Boolean(reportingId) ||
                    reportedIds.has(comment.id)
                  }
                  onChange={(event) =>
                    setReportReasons((current) => ({
                      ...current,
                      [comment.id]: event.target.value as CommentReportReason,
                    }))
                  }
                >
                  <option value="spam">{t("reportSpam")}</option>
                  <option value="scam">{t("reportScam")}</option>
                  <option value="harassment">{t("reportHarassment")}</option>
                  <option value="illegal">{t("reportIllegal")}</option>
                  <option value="other">{t("reportOther")}</option>
                </select>
                <button
                  type="button"
                  disabled={
                    !address ||
                    Boolean(reportingId) ||
                    reportedIds.has(comment.id)
                  }
                  onClick={() => void reportComment(comment.id)}
                >
                  {reportedIds.has(comment.id)
                    ? t("reported")
                    : reportingId === comment.id
                      ? t("walletConfirm")
                      : t("reportComment")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
