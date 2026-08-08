"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { parseEther } from "viem";
import { bsc } from "viem/chains";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { bnbxAiCopy, type BnbxAiCopy } from "@/lib/bnbx-ai-copy";
import { readChatErrorCode } from "@/lib/bnbx-ai-chat-reliability";
import { useLanguage } from "./language-provider";

type Message = { role: "user" | "assistant"; content: string };
type Membership = {
  member: boolean;
  creditMicrousd: number;
  lifetimeSpentMicrousd: number;
  paymentCount: number;
};
type PaymentStage = "idle" | "wallet" | "submitted" | "verifying" | "success";

const PAYMENT_ADDRESS = "0x3c97e99441cf86778d81fd6fef61bda84be9634a";
const POSITION_KEY = "bnbx-ai-orb-position-v1";

const paymentStages: Exclude<PaymentStage, "idle">[] = [
  "wallet",
  "submitted",
  "verifying",
  "success",
];

function MembershipCard({
  membership,
  copy,
}: {
  membership: Membership;
  copy: BnbxAiCopy;
}) {
  return (
    <section className="bnbx-ai-membership" aria-label={copy.myXOne}>
      <div className="bnbx-ai-membership-title">
        <strong>{copy.myXOne}</strong>
        <span>{copy.activeStatus}</span>
      </div>
      <dl>
        <div>
          <dt>{copy.permanentMember}</dt>
          <dd>✓</dd>
        </div>
        <div>
          <dt>{copy.creditBalance}</dt>
          <dd>{copy.activeStatus}</dd>
        </div>
        <div>
          <dt>{copy.paymentCount}</dt>
          <dd>
            {membership.paymentCount} {copy.times}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function BnbxAiAssistant() {
  const { language } = useLanguage();
  const copy = bnbxAiCopy[language];
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
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("idle");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: copy.hello },
  ]);
  const [position, setPosition] = useState({ x: 24, y: 100 });
  const orbRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    pointerId: number;
    startRight: number;
    startBottom: number;
    startX: number;
    startY: number;
    nextRight: number;
    nextBottom: number;
    frame: number | null;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant"
        ? [{ role: "assistant", content: copy.hello }]
        : current,
    );
  }, [copy.hello]);
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
          setError(copy.membershipLoadFailed);
      })
      .finally(() => setLoadingMembership(false));
    return () => controller.abort();
  }, [address, copy.membershipLoadFailed]);
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
    const resize = () =>
      setPosition((current) => {
        const next = clamp(current);
        localStorage.setItem(POSITION_KEY, JSON.stringify(next));
        return next;
      });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (drag.current?.frame != null) {
        cancelAnimationFrame(drag.current.frame);
      }
    };
  }, []);

  function moveOrb(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const size = window.innerWidth < 720 ? 62 : 72;
    const clamp = (value: number, limit: number) =>
      Math.max(12, Math.min(limit - size - 12, value));
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (Math.hypot(deltaX, deltaY) > 6) current.moved = true;
    current.nextRight = clamp(current.startRight - deltaX, window.innerWidth);
    current.nextBottom = clamp(
      current.startBottom - deltaY,
      window.innerHeight,
    );
    if (current.frame !== null) return;
    current.frame = requestAnimationFrame(() => {
      const latest = drag.current;
      const orb = orbRef.current;
      if (!latest || !orb) return;
      latest.frame = null;
      orb.style.transform = `translate3d(${latest.startRight - latest.nextRight}px, ${latest.startBottom - latest.nextBottom}px, 0)`;
    });
  }

  function finishOrbDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    const orb = orbRef.current;
    const size = window.innerWidth < 720 ? 62 : 72;
    if (current.moved) {
      suppressClick.current = true;
      const snapped = {
        x:
          current.nextRight + size / 2 < window.innerWidth / 2
            ? 12
            : window.innerWidth - size - 12,
        y: current.nextBottom,
      };
      if (orb) {
        orb.style.right = `${snapped.x}px`;
        orb.style.bottom = `${snapped.y}px`;
        orb.style.transform = "";
      }
      setPosition(snapped);
      localStorage.setItem(POSITION_KEY, JSON.stringify(snapped));
    } else if (orb) {
      orb.style.transform = "";
    }
    orb?.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
  }

  async function payForMembership() {
    if (!address || !publicClient) {
      setError(copy.connectWalletFirst);
      return;
    }
    setBusy(true);
    setError("");
    setPaymentStage("wallet");
    try {
      if (chainId !== bsc.id) await switchChainAsync({ chainId: bsc.id });
      const hash = await sendTransactionAsync({
        account: address,
        chainId: bsc.id,
        to: PAYMENT_ADDRESS,
        value: parseEther("0.05"),
      });
      setPaymentStage("submitted");
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setPaymentStage("verifying");
      const response = await fetch("/api/bnbx-ai/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, wallet: address }),
      });
      const result = await response.json();
      if (!response.ok) {
        const requestError = new Error(result.error);
        requestError.name = String(result.code ?? "request_failed");
        throw requestError;
      }
      setMembership(result as Membership);
      setPaymentStage("success");
    } catch {
      setPaymentStage("idle");
      setError(copy.paymentFailed);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    if (!address) {
      setError(copy.connectWalletFirst);
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
    } catch {
      setError(copy.signatureFailed);
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
        body: JSON.stringify({ messages: next, language }),
      });
      const result = await response.json();
      if (!response.ok) {
        const requestError = new Error(result.error || "Request failed");
        requestError.name = readChatErrorCode(result);
        throw requestError;
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.content },
      ]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      const code = cause instanceof Error ? cause.name : "request_failed";
      setError(
        code === "provider_quota"
          ? copy.providerQuota
          : code === "provider_rate_limit" || code === "fair_use_limit"
            ? copy.providerRateLimit
            : code === "provider_unavailable" ||
                code === "provider_access" ||
                code === "provider_empty_response"
              ? copy.providerUnavailable
              : code === "session_expired"
                ? copy.sessionExpired
                : copy.sendFailed,
      );
      if (
        code === "session_expired" ||
        message.includes("Unauthorized") ||
        message.includes("membership")
      )
        setAuthorized(false);
    } finally {
      setBusy(false);
    }
  }

  const currentPaymentStageIndex = paymentStages.findIndex(
    (stage) => stage === paymentStage,
  );
  const paymentStageLabels: Record<Exclude<PaymentStage, "idle">, string> = {
    wallet: copy.paymentWallet,
    submitted: copy.paymentSubmitted,
    verifying: copy.paymentVerifying,
    success: copy.paymentSuccess,
  };

  return (
    <>
      {!open && (
        <button
          ref={orbRef}
          className="bnbx-ai-orb"
          style={{ right: position.x, bottom: position.y }}
          onPointerDown={(e) => {
            if (!e.isPrimary) return;
            suppressClick.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.classList.add("is-dragging");
            drag.current = {
              pointerId: e.pointerId,
              startRight: position.x,
              startBottom: position.y,
              startX: e.clientX,
              startY: e.clientY,
              nextRight: position.x,
              nextBottom: position.y,
              frame: null,
              moved: false,
            };
          }}
          onPointerMove={moveOrb}
          onPointerUp={finishOrbDrag}
          onPointerCancel={finishOrbDrag}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setOpen(true);
          }}
          aria-label={copy.open}
        >
          <span className="bnbx-ai-face" aria-hidden="true" />
          <span className="bnbx-ai-orb-label">AI</span>
        </button>
      )}
      {open && (
        <section className="bnbx-ai-panel" aria-label={copy.title}>
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
                  aria-label={copy.name}
                />
                <h2>{copy.name}</h2>
                <p>{!membership?.member ? copy.join : copy.active}</p>
                {membership?.member && (
                  <MembershipCard membership={membership} copy={copy} />
                )}
                {paymentStage !== "idle" && (
                  <section
                    className="bnbx-ai-payment-progress"
                    aria-label={copy.paymentProgress}
                    aria-live="polite"
                  >
                    {paymentStages.map((stage, index) => {
                      return (
                        <div
                          key={stage}
                          className={
                            index < currentPaymentStageIndex
                              ? "complete"
                              : index === currentPaymentStageIndex
                                ? "current"
                                : "pending"
                          }
                        >
                          <span>
                            {index < currentPaymentStageIndex ? "✓" : index + 1}
                          </span>
                          <small>{paymentStageLabels[stage]}</small>
                        </div>
                      );
                    })}
                  </section>
                )}
                {!membership?.member ? (
                  <button
                    disabled={busy || !isConnected || loadingMembership}
                    onClick={payForMembership}
                  >
                    {loadingMembership
                      ? copy.loadingMembership
                      : busy
                        ? paymentStage === "wallet"
                          ? copy.paymentWallet
                          : paymentStage === "submitted"
                            ? copy.paymentSubmitted
                            : copy.paymentVerifying
                        : membership?.member
                          ? copy.refillButton
                          : copy.permanentClaim}
                  </button>
                ) : (
                  <button disabled={busy || !isConnected} onClick={unlock}>
                    {busy ? copy.verifyingSignature : copy.unlock}
                  </button>
                )}
                {!isConnected && <small>{copy.connectWallet}</small>}
              </div>
            )}
            {authorized && membership?.member && (
              <MembershipCard membership={membership} copy={copy} />
            )}
            {authorized &&
              messages.map((message, index) => (
                <div key={index} className={`bnbx-ai-message ${message.role}`}>
                  {message.content}
                </div>
              ))}
            {authorized && busy && (
              <div className="bnbx-ai-message assistant">{copy.thinking}</div>
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
