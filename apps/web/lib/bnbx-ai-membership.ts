import "server-only";

import { randomUUID } from "node:crypto";
import { isAddress } from "viem";
import {
  supabaseRpcEndpoint,
  supabaseServiceHeaders,
} from "@/lib/comments-server";

export const BNBX_AI_PAYMENT_ADDRESS =
  "0x3c97e99441cf86778d81fd6fef61bda84be9634a" as const;
export const BNBX_AI_PAYMENT_WEI = 50_000_000_000_000_000n;
export const BNBX_AI_CREDIT_MICROUSD = 68_000_000;
export const BNBX_AI_RESERVE_MICROUSD = 5_000;

export type AiMemberStatus = {
  member: boolean;
  creditMicrousd: number;
  lifetimeSpentMicrousd: number;
  paymentCount: number;
};

type RpcResult = Record<string, unknown> | Array<Record<string, unknown>>;

async function callRpc(name: string, body: Record<string, unknown>) {
  const endpoint = supabaseRpcEndpoint(name);
  const headers = supabaseServiceHeaders();
  if (!endpoint || !headers)
    throw new Error("AI membership service unavailable");
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("AI membership service unavailable");
  const data = (await response.json()) as RpcResult;
  return Array.isArray(data) ? (data[0] ?? {}) : data;
}

function safeNumber(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function parseMember(data: Record<string, unknown>): AiMemberStatus {
  return {
    member: data.member === true,
    creditMicrousd: safeNumber(data.credit_microusd),
    lifetimeSpentMicrousd: safeNumber(data.lifetime_spent_microusd),
    paymentCount: safeNumber(data.payment_count),
  };
}

export async function getAiMemberStatus(wallet: string) {
  const normalized = wallet.toLowerCase();
  if (!isAddress(normalized)) return parseMember({});
  return parseMember(
    await callRpc("get_bnbx_ai_member", { p_wallet: normalized }),
  );
}

export async function assertAiMember(wallet: string) {
  const status = await getAiMemberStatus(wallet);
  if (!status.member) throw new Error("BNBX AI membership required");
  return status;
}

export async function recordAiPayment(input: {
  hash: string;
  wallet: string;
  amountWei: bigint;
  blockNumber: bigint;
}) {
  const data = await callRpc("record_bnbx_ai_payment", {
    p_tx_hash: input.hash.toLowerCase(),
    p_wallet: input.wallet.toLowerCase(),
    p_amount_wei: input.amountWei.toString(),
    p_block_number: Number(input.blockNumber),
    p_credit_microusd: BNBX_AI_CREDIT_MICROUSD,
  });
  return parseMember(data);
}

export async function reserveAiCredit(wallet: string) {
  const reservationId = randomUUID();
  const data = await callRpc("reserve_bnbx_ai_credit", {
    p_wallet: wallet.toLowerCase(),
    p_reservation_id: reservationId,
    p_reserve_microusd: BNBX_AI_RESERVE_MICROUSD,
  });
  if (data.allowed !== true) {
    throw new Error(
      data.reason === "membership_required"
        ? "BNBX AI membership required"
        : "BNBX AI credit required",
    );
  }
  return reservationId;
}

export async function settleAiCredit(
  reservationId: string,
  actualMicrousd: number,
  release = false,
) {
  return callRpc("settle_bnbx_ai_credit", {
    p_reservation_id: reservationId,
    p_actual_microusd: release ? 0 : Math.max(0, Math.ceil(actualMicrousd)),
    p_release: release,
  });
}

export function aiCostMicrousd(promptTokens: number, completionTokens: number) {
  // GPT-5 mini: $0.25 / 1M input tokens and $2 / 1M output tokens.
  return Math.max(1, Math.ceil(promptTokens * 0.25 + completionTokens * 2));
}
