"use client";

import { useEffect, useRef, useState } from "react";
import { parseEther } from "viem";
import { bsc } from "viem/chains";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
} from "wagmi";

type Message = { role: "user" | "assistant"; content: string };
type Membership = {
  member: boolean;
  creditMicrousd: number;
  lifetimeSpentMicrousd: number;
  paymentCount: number;
};

const PAYMENT_ADDRESS = "0x3c97e99441cf86778d81fd6fef61bda84be9634a";
const POSITION_KEY = "bnbx-ai-orb-position-v1";
const copy = {
  title: "BNBX AI",
  name: "小壹 · X-One",
  hello: "你好，我是小壹。可以问我 BNBX 发币、内盘交易、毕业机制和钱包安全。",
  join: "支付 0.1 BNB，永久开通 BNBX AI，领取专属于您的小壹 / X-One。开通即获 100 USDT 等值 AI 智能算力额度。",
  active:
    "您已是 BNBX AI 永久会员。签名即可领取专属于您的小壹 / X-One；签名不消耗 Gas，也不会授权交易。",
  refill:
    "您的 BNBX AI 永久会员身份持续有效。仅需 0.1 BNB，即可解锁新一轮价值 100 USDT 的 AI 智能算力额度。",
  unlock: "签名解锁",
  placeholder: "问问 BNBX AI…",
  send: "发送",
  close: "关闭",
  disclaimer: "AI 可能出错，请独立核实；小壹不能替你交易或操作钱包。",
};

export function BnbxAiAssistant() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: bsc.id });
  const [open, setOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: copy.hello },
  ]);
  const [position, setPosition] = useState({ x: 24, y: 100 });
  const drag = useRef<{
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthorized(false);
    setMembership(null);
    if (!address) return;
    const controller = new AbortController();
    setLoadingMembership(true);
    fetch(`/api/bnbx-ai/payment?address=${address}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMembership(result as Membership);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name !== "AbortError")
          setError(cause.message);
      })
      .finally(() => setLoadingMembership(false));
    return () => controller.abort();
  }, [address]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    const size = window.innerWidth < 720 ? 62 : 72;
    const clamp = (value: { x: number; y: number }) => ({
      x: Math.max(12, Math.min(window.innerWidth - size - 12, value.x)),
      y: Math.max(12, Math.min(window.innerHeight - size - 12, value.y)),
    });
    try {
      const stored = localStorage.getItem(POSITION_KEY);
      if (stored) setPosition(clamp(JSON.parse(stored)));
    } catch {
      localStorage.removeItem(POSITION_KEY);
    }
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      if (
        Math.hypot(
          event.clientX - drag.current.startX,
          event.clientY - drag.current.startY,
        ) > 6
      )
        drag.current.moved = true;
      setPosition(
        clamp({
          x: window.innerWidth - size - (event.clientX - drag.current.dx),
          y: window.innerHeight - size - (event.clientY - drag.current.dy),
        }),
      );
    };
    const up = () => {
      if (drag.current?.moved) {
        suppressClick.current = true;
        setPosition((current) => {
          const snapped = clamp({
            x:
              current.x + size / 2 < window.innerWidth / 2
                ? 12
                : window.innerWidth - size - 12,
            y: current.y,
          });
          localStorage.setItem(POSITION_KEY, JSON.stringify(snapped));
          return snapped;
        });
      }
      drag.current = null;
    };
    const resize = () =>
      setPosition((current) => {
        const next = clamp(current);
        localStorage.setItem(POSITION_KEY, JSON.stringify(next));
        return next;
      });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", resize);
    };
  }, []);

  async function payForMembership() {
    if (!address || !publicClient) {
      setError("请先连接钱包");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (chainId !== bsc.id) await switchChainAsync({ chainId: bsc.id });
      const hash = await sendTransactionAsync({
        account: address,
        chainId: bsc.id,
        to: PAYMENT_ADDRESS,
        value: parseEther("0.1"),
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      const response = await fetch("/api/bnbx-ai/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, wallet: address }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMembership(result as Membership);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "支付验证失败");
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    if (!address) {
      setError("请先使用页面顶部按钮连接钱包");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const challengeRes = await fetch(
        `/api/bnbx-ai/session?address=${address}`,
        { cache: "no-store" },
      );
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) throw new Error(challenge.error);
      const signature = await signMessageAsync({ message: challenge.message });
      const response = await fetch("/api/bnbx-ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: challenge.token,
          message: challenge.message,
          signature,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAuthorized(true);
      if (result.membership) setMembership(result.membership as Membership);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "签名验证失败");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/bnbx-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.content },
      ]);
      if (typeof result.creditMicrousd === "number")
        setMembership((current) =>
          current
            ? { ...current, creditMicrousd: result.creditMicrousd }
            : current,
        );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "发送失败";
      setError(message);
      if (message.includes("Unauthorized") || message.includes("membership"))
        setAuthorized(false);
      if (message.includes("credit")) {
        setError("您的永久会员权益已保留，请补充新一轮 AI 智能算力额度。");
        setAuthorized(false);
        setMembership((current) =>
          current ? { ...current, creditMicrousd: 0 } : current,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          className="bnbx-ai-orb"
          style={{ right: position.x, bottom: position.y }}
          onPointerDown={(e) => {
            suppressClick.current = false;
            const size = window.innerWidth < 720 ? 62 : 72;
            drag.current = {
              dx: e.clientX - (window.innerWidth - position.x - size),
              dy: e.clientY - (window.innerHeight - position.y - size),
              startX: e.clientX,
              startY: e.clientY,
              moved: false,
            };
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setOpen(true);
          }}
          aria-label="打开 BNBX AI"
        >
          <span className="bnbx-ai-face" aria-hidden="true" />
          <span className="bnbx-ai-orb-label">AI</span>
        </button>
      )}
      {open && (
        <section className="bnbx-ai-panel" aria-label="BNBX AI 对话">
          <header>
            <div>
              <strong>{copy.title}</strong>
              <span>{copy.name}</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label={copy.close}>
              ×
            </button>
          </header>
          <div className="bnbx-ai-messages">
            {!authorized && (
              <div className="bnbx-ai-gate">
                <div
                  className="bnbx-ai-avatar"
                  role="img"
                  aria-label="小壹 / X-One"
                />
                <h2>{copy.name}</h2>
                <p>
                  {!membership?.member
                    ? copy.join
                    : membership.creditMicrousd > 0
                      ? copy.active
                      : copy.refill}
                </p>
                {membership?.member && (
                  <strong className="bnbx-ai-credit">
                    永久会员 · AI算力余额：$
                    {(membership.creditMicrousd / 1_000_000).toFixed(4)}
                  </strong>
                )}
                {!membership?.member || membership.creditMicrousd <= 0 ? (
                  <button
                    disabled={busy || !isConnected || loadingMembership}
                    onClick={payForMembership}
                  >
                    {busy
                      ? "等待链上确认…"
                      : membership?.member
                        ? "0.1 BNB 立即解锁新一轮"
                        : "0.1 BNB 永久领取"}
                  </button>
                ) : (
                  <button disabled={busy || !isConnected} onClick={unlock}>
                    {busy ? "验证中…" : copy.unlock}
                  </button>
                )}
                {!isConnected && <small>请先连接钱包</small>}
                <small title={PAYMENT_ADDRESS}>
                  BSC 主网 · 官方收款地址 {PAYMENT_ADDRESS.slice(0, 8)}…
                  {PAYMENT_ADDRESS.slice(-6)}
                </small>
              </div>
            )}
            {authorized &&
              messages.map((message, index) => (
                <div key={index} className={`bnbx-ai-message ${message.role}`}>
                  {message.content}
                </div>
              ))}
            {authorized && busy && (
              <div className="bnbx-ai-message assistant">小壹正在思考…</div>
            )}
            <div ref={endRef} />
          </div>
          {error && <div className="bnbx-ai-error">{error}</div>}
          {authorized && (
            <div className="bnbx-ai-compose">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 1200))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={copy.placeholder}
              />
              <button disabled={busy || !input.trim()} onClick={send}>
                {copy.send}
              </button>
            </div>
          )}
          {authorized && membership && (
            <div className="bnbx-ai-balance">
              永久会员 · AI算力余额 $
              {(membership.creditMicrousd / 1_000_000).toFixed(4)}
            </div>
          )}
          <footer>{copy.disclaimer}</footer>
        </section>
      )}
    </>
  );
}
