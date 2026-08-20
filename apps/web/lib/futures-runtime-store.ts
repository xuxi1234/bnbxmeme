import "server-only";

import { FuturesApiError, readBoundedBody } from "@/lib/futures-api-core";
import { createFuturesRuntimeStore } from "@/lib/futures-runtime-store-core";

const TIMEOUT_MS = 4_000;
const MAX_RPC_BYTES = 2_200_000;

function configuration() {
  const rawUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !secret) throw new FuturesApiError("service_unavailable", 503);
  const url = new URL(rawUrl);
  if (url.protocol !== "https:")
    throw new FuturesApiError("service_unavailable", 503);
  return { url, secret };
}

async function runtimeRpc(name: string, body: Record<string, unknown>) {
  const { url, secret } = configuration();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    }).catch(() => {
      throw new FuturesApiError("service_unavailable", 503);
    });
    if (!response.ok) throw new FuturesApiError("service_unavailable", 503);
    try {
      return JSON.parse(
        await readBoundedBody(
          response.body,
          MAX_RPC_BYTES,
          503,
          "service_unavailable",
        ),
      ) as unknown;
    } catch (error) {
      if (error instanceof FuturesApiError) throw error;
      throw new FuturesApiError("service_unavailable", 503);
    }
  } finally {
    clearTimeout(timer);
  }
}

export const futuresRuntimeStore = createFuturesRuntimeStore(runtimeRpc);
