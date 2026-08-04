import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession, fingerprint } from "@/lib/bnbx-ai-auth";
import { consumeAiQuota } from "@/lib/bnbx-ai-quota";
import {
  BNBX_AI_RESERVE_MICROUSD,
  aiCostMicrousd,
  reserveAiCredit,
  settleAiCredit,
} from "@/lib/bnbx-ai-membership";

export const runtime = "nodejs";

const SYSTEM = `You are BNBX AI, also called 小壹 / X-One, the read-only assistant for BNBX.MEME on BNB Chain. Answer in the user's language. Be concise and factual. Explain BNBX token creation, bonding-curve trading, 1% curve buy/sell fee, 0.001 BNB creation fee, 0.01-0.18 BNB graduation targets, PancakeSwap V2 graduation, permanent LP burn, wallet safety, and contract-risk education. Never request a seed phrase or private key. Never claim guaranteed returns. You cannot trade, sign, deploy, move funds, or predict profit. Tell users to verify addresses and wallet transaction details.`;

export async function POST(request: Request) {
  let reservationId: string | null = null;
  try {
    const wallet = await requireSession(request);
    reservationId = await reserveAiCredit(wallet);
    await consumeAiQuota(
      wallet,
      createHash("sha256").update(fingerprint(request)).digest("hex"),
    );
    const body = (await request.json()) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const messages = (body.messages ?? [])
      .slice(-12)
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content ?? "").slice(0, 1200),
      }))
      .filter((item) => item.content.trim());
    if (!messages.length || JSON.stringify(messages).length > 8000)
      throw new Error("Invalid message");
    const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) throw new Error("AI provider is not configured");
    const base = process.env.AI_GATEWAY_API_KEY
      ? "https://ai-gateway.vercel.sh/v1"
      : "https://api.openai.com/v1";
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.BNBX_AI_MODEL ?? "gpt-5-mini",
        messages: [{ role: "system", content: SYSTEM }, ...messages],
        max_completion_tokens: 900,
      }),
    });
    if (!response.ok) throw new Error("AI provider unavailable");
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");
    const actualCost = aiCostMicrousd(
      result.usage?.prompt_tokens ?? BNBX_AI_RESERVE_MICROUSD * 4,
      result.usage?.completion_tokens ?? 0,
    );
    const credit = await settleAiCredit(reservationId, actualCost);
    reservationId = null;
    return NextResponse.json({
      content,
      creditMicrousd: Number(credit.credit_microusd ?? 0),
    });
  } catch (error) {
    if (reservationId)
      await settleAiCredit(reservationId, 0, true).catch(() => null);
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      message === "Unauthorized" || message.includes("membership")
        ? 401
        : message.includes("limit") || message.includes("10 seconds")
          ? 429
          : message.includes("credit")
            ? 402
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
