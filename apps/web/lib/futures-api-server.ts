import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import {
  isSupportedWalletSignature,
  MAX_ADMIN_SIGNATURE_BYTES,
} from "@/lib/comment-signature-core";
import {
  buildFuturesAuthMessage,
  FuturesApiError,
  FUTURES_API_RESOURCES,
  parseFuturesApiInput,
  parseFuturesApiResponse,
  readBoundedBody,
  requireFuturesWriteEnvironment,
  type FuturesApiResource,
} from "@/lib/futures-api-core";
import {
  consumeFuturesNonce,
  consumeSharedFuturesQuota,
  registerFuturesNonce,
} from "@/lib/futures-security-store";

const COOKIE = "bnbx_futures_testnet_session";
const CHALLENGE_SECONDS = 5 * 60;
const SESSION_SECONDS = 60 * 60;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const serviceTimeoutMs = 5_000;

type SessionPayload = {
  wallet: string;
  chainId: 97;
  exp: number;
  nonce?: string;
  origin: string;
  fingerprint: string;
};

function sessionSecret() {
  const value =
    process.env.FUTURES_SESSION_SECRET ?? process.env.BNBX_AI_SESSION_SECRET;
  if (!value || value.length < 32)
    throw new FuturesApiError("service_unavailable", 503);
  return value;
}

function serviceConfiguration() {
  const endpoint = process.env.FUTURES_SERVICE_URL;
  const secret = process.env.FUTURES_SERVICE_SECRET;
  if (!endpoint || !secret || secret.length < 32)
    throw new FuturesApiError("service_unavailable", 503);
  let origin: URL;
  try {
    origin = new URL(endpoint);
  } catch {
    throw new FuturesApiError("service_unavailable", 503);
  }
  if (origin.protocol !== "https:")
    throw new FuturesApiError("service_unavailable", 503);
  return { origin, secret };
}

function fingerprint(request: Request) {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return createHmac("sha256", sessionSecret())
    .update(`${ip}|${request.headers.get("user-agent") ?? "unknown"}`)
    .digest("hex")
    .slice(0, 32);
}

function requestQuotaKey(request: Request) {
  const trustedIp =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return createHmac("sha256", sessionSecret())
    .update(trustedIp)
    .digest("hex")
    .slice(0, 32);
}

function encodeSession(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function decodeSession(token: string | undefined) {
  if (!token) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;
  const expected = createHmac("sha256", sessionSecret())
    .update(encoded)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(supplied, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (
      !isAddress(payload.wallet) ||
      payload.chainId !== 97 ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1_000) ||
      typeof payload.origin !== "string" ||
      typeof payload.fingerprint !== "string"
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}

export async function consumeFuturesRequestQuota(request: Request) {
  if (!(await consumeSharedFuturesQuota("request", requestQuotaKey(request))))
    throw new FuturesApiError("rate_limited", 429);
}

export async function createFuturesChallenge(request: Request, wallet: string) {
  await consumeFuturesRequestQuota(request);
  if (!isAddress(wallet)) throw new FuturesApiError("invalid_schema", 400);
  const origin = new URL(request.url).origin;
  const exp = Math.floor(Date.now() / 1_000) + CHALLENGE_SECONDS;
  const payload: SessionPayload = {
    wallet: getAddress(wallet).toLowerCase(),
    chainId: 97,
    exp,
    nonce: randomBytes(18).toString("hex"),
    origin,
    fingerprint: fingerprint(request),
  };
  if (
    !(await registerFuturesNonce(
      payload.nonce as string,
      payload.fingerprint,
      payload.exp,
    ))
  )
    throw new FuturesApiError("service_unavailable", 503);
  return {
    token: encodeSession(payload),
    message: buildFuturesAuthMessage({
      origin,
      wallet: payload.wallet,
      chainId: 97,
      nonce: payload.nonce as string,
      expiresAt: exp * 1_000,
    }),
    expiresAt: exp * 1_000,
  };
}

export async function establishFuturesSession(
  request: Request,
  rawInput: unknown,
) {
  await consumeFuturesRequestQuota(request);
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput))
    throw new FuturesApiError("invalid_schema", 400);
  const input = rawInput as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["token", "message", "signature"].includes(key),
    ) ||
    typeof input.token !== "string" ||
    typeof input.message !== "string" ||
    typeof input.signature !== "string"
  )
    throw new FuturesApiError("invalid_schema", 400);
  const challenge = decodeSession(input.token);
  if (
    !challenge?.nonce ||
    challenge.origin !== new URL(request.url).origin ||
    challenge.fingerprint !== fingerprint(request)
  )
    throw new FuturesApiError("unauthorized", 401);
  const expectedMessage = buildFuturesAuthMessage({
    origin: challenge.origin,
    wallet: challenge.wallet,
    chainId: 97,
    nonce: challenge.nonce,
    expiresAt: challenge.exp * 1_000,
  });
  if (
    input.message !== expectedMessage ||
    !isSupportedWalletSignature(input.signature, MAX_ADMIN_SIGNATURE_BYTES) ||
    !(await verifyWalletMessage({
      address: challenge.wallet as Address,
      message: expectedMessage,
      signature: input.signature as Hex,
    }).catch(() => false))
  )
    throw new FuturesApiError("unauthorized", 401);
  if (!(await consumeFuturesNonce(challenge.nonce, challenge.fingerprint)))
    throw new FuturesApiError("unauthorized", 401);
  const session: SessionPayload = {
    ...challenge,
    nonce: undefined,
    exp: Math.floor(Date.now() / 1_000) + SESSION_SECONDS,
  };
  (await cookies()).set(COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/futures",
    maxAge: SESSION_SECONDS,
  });
  return {
    wallet: session.wallet,
    chainId: 97,
    expiresAt: session.exp * 1_000,
  };
}

export async function requireFuturesSession(request: Request) {
  const session = decodeSession((await cookies()).get(COOKIE)?.value);
  if (
    !session ||
    session.origin !== new URL(request.url).origin ||
    session.fingerprint !== fingerprint(request)
  )
    throw new FuturesApiError("unauthorized", 401);
  return session;
}

export async function consumeFuturesQuota(wallet: string, method: string) {
  if (
    !(await consumeSharedFuturesQuota(
      method === "GET" ? "read" : "write",
      wallet.toLowerCase(),
    ))
  )
    throw new FuturesApiError("rate_limited", 429);
}

function configuration() {
  const chainId = Number(process.env.FUTURES_CHAIN_ID);
  const orderBook = process.env.FUTURES_ORDER_BOOK ?? "";
  if (chainId !== 97 || !isAddress(orderBook))
    throw new FuturesApiError("service_unavailable", 503);
  return { chainId, orderBook: getAddress(orderBook) };
}

export async function forwardFuturesRequest(
  request: Request,
  resource: string,
  method: "GET" | "POST" | "DELETE",
) {
  if (!FUTURES_API_RESOURCES.includes(resource as FuturesApiResource))
    throw new FuturesApiError("invalid_resource", 404);
  if (method !== "GET") requireFuturesWriteEnvironment(process.env);
  const { origin: serviceOrigin, secret } = serviceConfiguration();
  let raw: unknown;
  if (method === "GET") {
    raw = Object.fromEntries(new URL(request.url).searchParams);
  } else {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(declared) || declared > MAX_REQUEST_BYTES)
      throw new FuturesApiError("invalid_schema", 413);
    const text = await readBoundedBody(
      request.body,
      MAX_REQUEST_BYTES,
      413,
      "invalid_schema",
    );
    try {
      raw = JSON.parse(text);
    } catch {
      throw new FuturesApiError("invalid_schema", 400);
    }
  }
  const responseConfig = configuration();
  const parsed = parseFuturesApiInput(resource, method, raw, responseConfig);
  const upstreamUrl = new URL(`/v1/futures/${resource}`, serviceOrigin);
  if (method === "GET") {
    for (const [key, value] of Object.entries(parsed)) {
      upstreamUrl.searchParams.set(key, `${value}`);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), serviceTimeoutMs);
  try {
    const response = await fetch(upstreamUrl, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "X-BNBX-Wallet": (await requireFuturesSession(request)).wallet,
      },
      body: method === "GET" ? undefined : JSON.stringify(parsed),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    }).catch(() => {
      throw new FuturesApiError("service_unavailable", 503);
    });
    const allowedStatuses = method === "GET" ? [200] : [200, 201, 202];
    if (!allowedStatuses.includes(response.status)) {
      throw new FuturesApiError(
        response.status >= 500 ? "service_unavailable" : "request_rejected",
        response.status >= 500 ? 503 : 409,
      );
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_RESPONSE_BYTES)
      throw new FuturesApiError("response_too_large", 502);
    const text = await readBoundedBody(response.body, MAX_RESPONSE_BYTES, 502);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new FuturesApiError("service_unavailable", 503);
    }
    return {
      status: response.status,
      payload: parseFuturesApiResponse(resource, payload, responseConfig),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Explicit allowlist retained here for route/audit discoverability.
export const authenticatedFuturesResources = {
  "market-status": ["GET"],
  orders: ["GET", "POST"],
  cancellations: ["POST", "DELETE"],
  fills: ["GET"],
  positions: ["GET"],
  "collateral-intents": ["POST"],
  "keeper-health": ["GET"],
} as const;
