import "server-only";

import { createHmac } from "node:crypto";
import { FuturesApiError, readBoundedBody } from "@/lib/futures-api-core";

const TIMEOUT_MS = 3_000;
const policies = {
  request: { maximum: 120, windowSeconds: 600 },
  read: { maximum: 120, windowSeconds: 600 },
  write: { maximum: 30, windowSeconds: 600 },
} as const;

function configuration() {
  const rawUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !secret) throw new FuturesApiError("service_unavailable", 503);
  const url = new URL(rawUrl);
  if (url.protocol !== "https:")
    throw new FuturesApiError("service_unavailable", 503);
  const hmacSecret = process.env.FUTURES_SESSION_SECRET;
  if (!hmacSecret || hmacSecret.length < 32)
    throw new FuturesApiError("service_unavailable", 503);
  return { url, secret, hmacSecret };
}

const digest = (value: string, secret: string) =>
  createHmac("sha256", secret).update(value).digest("hex");

async function rpc(name: string, body: Record<string, unknown>) {
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
    const payload = JSON.parse(
      await readBoundedBody(response.body, 32, 503, "service_unavailable"),
    );
    if (typeof payload !== "boolean")
      throw new FuturesApiError("service_unavailable", 503);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function consumeSharedFuturesQuota(
  scope: keyof typeof policies,
  identity: string,
) {
  const { hmacSecret } = configuration();
  const policy = policies[scope];
  return rpc("consume_futures_api_quota", {
    p_quota_key: digest(`${scope}:${identity}`, hmacSecret),
    p_maximum: policy.maximum,
    p_window_seconds: policy.windowSeconds,
  });
}

export async function registerFuturesNonce(
  nonce: string,
  fingerprint: string,
  expiresAt: number,
) {
  const { hmacSecret } = configuration();
  return rpc("register_futures_api_nonce", {
    p_nonce_hash: digest(nonce, hmacSecret),
    p_fingerprint_hash: digest(fingerprint, hmacSecret),
    p_expires_at: new Date(expiresAt * 1_000).toISOString(),
  });
}

export async function consumeFuturesNonce(nonce: string, fingerprint: string) {
  const { hmacSecret } = configuration();
  return rpc("consume_futures_api_nonce", {
    p_nonce_hash: digest(nonce, hmacSecret),
    p_fingerprint_hash: digest(fingerprint, hmacSecret),
  });
}
