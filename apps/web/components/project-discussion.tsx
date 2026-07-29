"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildCommentMessage } from "@/lib/comment-message";
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
  const [error, setError] = useState("");

  const loadComments = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/comments?token=${token}`, { signal });
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
  }, [t, token]);

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
        throw new Error(result.error ?? t("commentFailed"));
      }
      setComments((current) => [result.comment!, ...current]);
      setBody("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("commentFailed"),
      );
    } finally {
      setIsPosting(false);
    }
  }

  const locale =
    language === "zh"
      ? "zh-CN"
      : language === "ko"
        ? "ko-KR"
        : language === "ja"
          ? "ja-JP"
          : "en-US";

  if (!isLoading && !enabled) return null;

  return (
    <section className="project-discussion">
      <div className="activity-heading">
        <div>
          <p className="eyebrow">SIGNED COMMUNITY</p>
          <h2>{t("discussion")}</h2>
        </div>
        <span>{t("signatureNoGas")}</span>
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
      {error && <p className="error" role="alert">{error}</p>}
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
