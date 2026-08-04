"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

type Message = { role: "user" | "assistant"; content: string };
const copy = {
  title: "BNBX AI",
  name: "小壹 · X-One",
  hello: "你好，我是小壹。可以问我 BNBX 发币、内盘交易、毕业机制和钱包安全。",
  gate: "连接钱包并签名后使用。钱包余额必须严格大于 1 BNB。签名不消耗 Gas，也不会授权交易。",
  unlock: "签名解锁",
  placeholder: "问问 BNBX AI…",
  send: "发送",
  close: "关闭",
  disclaimer: "AI 可能出错，请独立核实；小壹不能替你交易或操作钱包。",
};

export function BnbxAiAssistant() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: copy.hello },
  ]);
  const [position, setPosition] = useState({ x: 24, y: 100 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthorized(false);
  }, [address]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current || window.innerWidth < 720) return;
      setPosition({
        x: Math.max(
          12,
          Math.min(window.innerWidth - 92, event.clientX - drag.current.dx),
        ),
        y: Math.max(
          12,
          Math.min(window.innerHeight - 92, event.clientY - drag.current.dy),
        ),
      });
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

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
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "发送失败";
      setError(message);
      if (message.includes("Unauthorized") || message.includes("1 BNB"))
        setAuthorized(false);
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
            drag.current = {
              dx: e.clientX - (window.innerWidth - position.x - 72),
              dy: e.clientY - (window.innerHeight - position.y - 72),
            };
          }}
          onClick={() => {
            if (!drag.current) setOpen(true);
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
                <p>{copy.gate}</p>
                <button disabled={busy || !isConnected} onClick={unlock}>
                  {busy ? "验证中…" : copy.unlock}
                </button>
                {!isConnected && <small>请先连接钱包</small>}
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
          <footer>{copy.disclaimer}</footer>
        </section>
      )}
    </>
  );
}
