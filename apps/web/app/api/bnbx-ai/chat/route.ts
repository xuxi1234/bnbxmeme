import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession, fingerprint } from "@/lib/bnbx-ai-auth";
import { consumeAiQuota } from "@/lib/bnbx-ai-quota";

export const runtime = "nodejs";

const SYSTEM = `You are BNBX AI, also called 小壹 / X-One, the read-only assistant for BNBX.MEME on BNB Chain. Answer in the user's language. Be concise and factual. Explain BNBX token creation, bonding-curve trading, 1% curve buy/sell fee, 0.001 BNB creation fee, 0.01-0.18 BNB graduation targets, PancakeSwap V2 graduation, permanent LP burn, wallet safety, and contract-risk education. Never request a seed phrase or private key. Never claim guaranteed returns. You cannot trade, sign, deploy, move funds, or predict profit. Tell users to verify addresses and wallet transaction details.`;
const interfaceLanguages = {
  zh: "Simplified Chinese",
  en: "English",
  ko: "Korean",
  ja: "Japanese",
} as const;
const MAX_HISTORY_JSON_CHARS = 7000;

function trimConversationHistory(
  messages: Array<{ role: "assistant" | "user"; content: string }>,
) {
  const trimmed = [...messages];
  while (
    trimmed.length > 1 &&
    JSON.stringify(trimmed).length > MAX_HISTORY_JSON_CHARS
  ) {
    trimmed.shift();
  }
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const wallet = await requireSession(request);
    await consumeAiQuota(
      wallet,
      createHash("sha256").update(fingerprint(request)).digest("hex"),
    );
    const body = (await request.json()) as {
      messages?: Array<{ role?: string; content?: string }>;
      language?: keyof typeof interfaceLanguages;
    };
    const interfaceLanguage =
      interfaceLanguages[body.language ?? "en"] ?? interfaceLanguages.en;
    const messages = trimConversationHistory(
      (body.messages ?? [])
        .slice(-12)
        .map((item) => ({
          role:
            item.role === "assistant"
              ? ("assistant" as const)
              : ("user" as const),
          content: String(item.content ?? "").slice(0, 1200),
        }))
        .filter((item) => item.content.trim()),
    );
    if (!messages.length) throw new Error("Invalid message");
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
        messages: [
          {
            role: "system",
            content: `${SYSTEM}\nThe interface language is ${interfaceLanguage}. Reply in that language unless the user explicitly requests another language.`,
          },
          ...messages,
        ],
        max_completion_tokens: 900,
      }),
    });
    if (!response.ok) throw new Error("AI provider unavailable");
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty AI response");
    return NextResponse.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status =
      message === "Unauthorized" || message.includes("membership")
        ? 401
        : message.includes("limit") || message.includes("10 seconds")
          ? 429
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
