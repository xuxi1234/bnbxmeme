import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isAddress, type Address, type Hex } from "viem";
import { resolveAdminSigningWallet } from "@/lib/admin-signing-wallet";
import {
  buildFlapMirrorLoginMessage,
  decodeFlapMirrorSession,
  encodeFlapMirrorSession,
  FlapMirrorRateLimiter,
} from "@/lib/flap-mirror-auth-core";
import { resolveFourMirrorAuthorizedWallets } from "@/lib/four-mirror-page-core";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import {
  isSupportedWalletSignature,
  MAX_ADMIN_SIGNATURE_BYTES,
} from "@/lib/comment-signature-core";

const COOKIE = "bnbx_flap_mirror_session";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 60 * 60;
const prepareLimiter = new FlapMirrorRateLimiter({
  maximum: 20,
  windowMs: 10 * 60_000,
});

export class FlapMirrorAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FlapMirrorAuthError";
    this.status = status;
  }
}

function secret() {
  const value =
    process.env.BNBX_MIRROR_SESSION_SECRET ??
    process.env.BNBX_AI_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("BNBX mirror session secret is not configured");
  }
  return value;
}

function authorizedWallets() {
  const primary = resolveAdminSigningWallet(
    process.env.BNBX_ADMIN_SIGNING_WALLET,
  );
  return resolveFourMirrorAuthorizedWallets(primary);
}

function isAuthorized(address: string) {
  return authorizedWallets().includes(address.toLowerCase());
}

export function flapMirrorFingerprint(request: Request) {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  return createHmac("sha256", secret())
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

export function createFlapMirrorChallenge(request: Request, address: string) {
  if (!isAddress(address) || !isAuthorized(address)) {
    throw new FlapMirrorAuthError("Unauthorized Flap mirror wallet", 403);
  }
  const normalizedAddress = address.toLowerCase();
  const exp = Math.floor(Date.now() / 1_000) + CHALLENGE_TTL_SECONDS;
  const nonce = randomBytes(18).toString("hex");
  const origin = new URL(request.url).origin;
  const token = encodeFlapMirrorSession(
    {
      address: normalizedAddress,
      exp,
      nonce,
      fp: flapMirrorFingerprint(request),
      origin,
    },
    secret(),
  );
  return {
    token,
    message: buildFlapMirrorLoginMessage({
      address: normalizedAddress,
      nonce,
      expiresAt: exp * 1_000,
      origin,
    }),
    expiresAt: exp * 1_000,
  };
}

export async function establishFlapMirrorSession(
  request: Request,
  input: { token?: unknown; message?: unknown; signature?: unknown },
) {
  if (
    typeof input.token !== "string" ||
    typeof input.message !== "string" ||
    typeof input.signature !== "string"
  ) {
    throw new FlapMirrorAuthError("Invalid Flap mirror login", 400);
  }
  const payload = decodeFlapMirrorSession(input.token, secret());
  if (
    !payload?.nonce ||
    payload.fp !== flapMirrorFingerprint(request) ||
    payload.origin !== new URL(request.url).origin ||
    !isAddress(payload.address) ||
    !isAuthorized(payload.address)
  ) {
    throw new FlapMirrorAuthError("Flap mirror challenge expired", 401);
  }
  const expectedMessage = buildFlapMirrorLoginMessage({
    address: payload.address,
    nonce: payload.nonce,
    expiresAt: payload.exp * 1_000,
    origin: payload.origin,
  });
  if (
    input.message !== expectedMessage ||
    !isSupportedWalletSignature(input.signature, MAX_ADMIN_SIGNATURE_BYTES)
  ) {
    throw new FlapMirrorAuthError("Flap mirror challenge mismatch", 401);
  }
  const verified = await verifyWalletMessage({
    address: payload.address as Address,
    message: expectedMessage,
    signature: input.signature as Hex,
  }).catch(() => false);
  if (!verified) throw new FlapMirrorAuthError("Invalid wallet signature", 401);

  const exp = Math.floor(Date.now() / 1_000) + SESSION_TTL_SECONDS;
  (await cookies()).set(
    COOKIE,
    encodeFlapMirrorSession(
      { address: payload.address.toLowerCase(), exp, fp: payload.fp },
      secret(),
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/flap-mirrors",
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  return { address: payload.address.toLowerCase(), expiresAt: exp * 1_000 };
}

export async function requireFlapMirrorSession(request: Request) {
  const payload = decodeFlapMirrorSession(
    (await cookies()).get(COOKIE)?.value,
    secret(),
  );
  if (
    !payload ||
    payload.fp !== flapMirrorFingerprint(request) ||
    !isAddress(payload.address) ||
    !isAuthorized(payload.address)
  ) {
    throw new FlapMirrorAuthError("Unauthorized Flap mirror session", 401);
  }
  return payload.address.toLowerCase();
}

export function consumeFlapMirrorPrepareQuota(request: Request, wallet: string) {
  const key = `${wallet}:${flapMirrorFingerprint(request)}`;
  if (!prepareLimiter.consume(key)) {
    throw new FlapMirrorAuthError("Flap mirror preparation rate limit exceeded", 429);
  }
}
