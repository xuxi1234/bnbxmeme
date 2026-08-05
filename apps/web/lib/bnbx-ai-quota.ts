import "server-only";
import {
  supabaseRpcEndpoint,
  supabaseServiceHeaders,
} from "@/lib/comments-server";

export async function consumeAiQuota(wallet: string, client: string) {
  const endpoint = supabaseRpcEndpoint("consume_bnbx_ai_quota");
  const headers = supabaseServiceHeaders();
  if (!endpoint || !headers) throw new Error("AI quota service unavailable");
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      p_wallet: wallet,
      p_client: client,
      p_wallet_limit: 300,
      p_client_limit: 600,
      p_global_limit: 10000,
      p_min_interval_seconds: 2,
    }),
  });
  if (!response.ok) throw new Error("AI quota service unavailable");
  const data = (await response.json()) as
    | { allowed?: boolean; reason?: string }
    | Array<{ allowed?: boolean; reason?: string }>;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed)
    throw new Error(
      result?.reason === "too_fast"
        ? "Please wait 2 seconds"
        : "Daily AI limit reached",
    );
}
