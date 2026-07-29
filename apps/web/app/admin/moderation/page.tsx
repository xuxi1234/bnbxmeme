"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { WalletButton } from "@/components/wallet-button";
import { buildCommentAdminLoginMessage } from "@/lib/comment-admin-message";

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
};

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function CommentModerationPage() {
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
    if (!response.ok) throw new Error(result.error ?? "管理数据读取失败");
    setPayload(result);
    setTerms(result.settings.blockedTerms.join("\n"));
    return true;
  }, []);

  useEffect(() => {
    void load()
      .catch((loadError) =>
        setError(
          loadError instanceof Error ? loadError.message : "管理数据读取失败",
        ),
      )
      .finally(() => setCheckingSession(false));
  }, [load]);

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
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "该钱包没有评论管理权限");
      }
      await load();
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "管理员验证失败",
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
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "管理操作失败");
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "管理操作失败",
      );
    } finally {
      setBusy(false);
    }
  }

  const filteredComments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return payload?.comments ?? [];
    return (payload?.comments ?? []).filter((comment) =>
      [comment.token, comment.wallet, comment.body].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [payload?.comments, query]);

  return (
    <main className="moderation-page">
      <section className="moderation-shell">
        <div className="moderation-heading">
          <div>
            <p className="eyebrow">BNBX ADMIN · COMMENT MODERATION</p>
            <h1>评论管理</h1>
            <p>
              平台总开关、关键词拦截和单条评论处理。管理验证只使用钱包签名，不发送交易、不消耗 Gas。
            </p>
          </div>
          <Link href="/">返回市场</Link>
        </div>

        {checkingSession ? (
          <p className="activity-empty">正在检查管理员会话…</p>
        ) : !payload ? (
          <section className="moderation-login">
            <WalletButton />
            <button
              className="button"
              type="button"
              disabled={!address || busy || isPending}
              onClick={authenticate}
            >
              {busy || isPending ? "请在钱包确认…" : "签名验证管理员"}
            </button>
            <small>
              只有 BNBX 官方 Factory 的手续费接收钱包或预先配置的钱包可以进入。
            </small>
          </section>
        ) : (
          <>
            <section className="moderation-settings">
              <article>
                <div>
                  <span>评论功能</span>
                  <strong>
                    {payload.settings.commentsEnabled ? "已开放" : "已下架"}
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
                    ? "立即下架评论功能"
                    : "重新开放评论功能"}
                </button>
                <small>
                  下架后，所有代币页停止展示评论和发布入口；历史评论不会被删除。
                </small>
              </article>
              <article>
                <label htmlFor="blocked-terms">
                  敏感关键词
                  <small>每行一个；忽略大小写、空格和常见符号。</small>
                </label>
                <textarea
                  id="blocked-terms"
                  value={terms}
                  placeholder={"政治关键词\n宗教关键词\n垃圾广告词"}
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
                  保存关键词
                </button>
              </article>
            </section>

            <section className="moderation-comments">
              <div className="moderation-comments-heading">
                <div>
                  <h2>评论列表</h2>
                  <span>
                    显示最近 {payload.comments.length} / 共{" "}
                    {payload.totalComments} 条 · 已隐藏{" "}
                    {payload.comments.filter((comment) => comment.hidden).length} 条
                  </span>
                </div>
                <input
                  value={query}
                  placeholder="搜索评论、钱包或代币地址"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {filteredComments.length === 0 ? (
                <p className="activity-empty">没有符合条件的评论。</p>
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
                          {new Date(comment.createdAt).toLocaleString("zh-CN")}
                        </time>
                        {comment.hidden && <strong>已隐藏</strong>}
                      </div>
                      <p>{comment.body}</p>
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
                          {comment.hidden ? "恢复展示" : "隐藏评论"}
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "永久删除后无法恢复，确定删除这条评论吗？",
                              )
                            ) {
                              void action({
                                action: "delete",
                                commentId: comment.id,
                              });
                            }
                          }}
                        >
                          永久删除
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
