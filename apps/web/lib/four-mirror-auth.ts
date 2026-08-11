import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isAddress, type Address, type Hex } from "viem";
import {
  decodeFlapMirrorSession,
  encodeFlapMirrorSession,
  FlapMirrorRateLimiter,
} from "@/lib/flap-mirror-auth-core";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import {
  isSupportedWalletSignature,
  MAX_ADMIN_SIGNATURE_BYTES,
} from "@/lib/comment-signature-core";

const COOKIE = "bnbx_four_mirror_session";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 60 * 60;
const prepareLimiter = new FlapMirrorRateLimiter({
  maximum: 20,
  windowMs: 10 * 60_000,
});

export class FourMirrorAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FourMirrorAuthError";
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

function fingerprint(request: Request) {
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

function loginMessage({
  address,
  nonce,
  expiresAt,
  origin,
}: {
  address: string;
  nonce: string;
  expiresAt: number;
  origin: string;
}) {
  return [
    "BNBX Four mirror access",
    "",
    `Origin: ${origin}`,
    "Chain ID: 56",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "This signature is gasless and does not authorize transactions.",
  ].join("\n");
}

export function createFourMirrorChallenge(request: Request, address: string) {
  if (!isAddress(address)) {
    throw new FourMirrorAuthError(
      "Four mirror wallet must be a valid BSC address",
      400,
    );
  }
  const normalizedAddress = address.toLowerCase();
  const exp = Math.floor(Date.now() / 1_000) + CHALLENGE_TTL_SECONDS;
  const nonce = randomBytes(18).toString("hex");
  const origin = new URL(request.url).origin;
  const token = encodeFlapMirrorSession(
    { address: normalizedAddress, exp, nonce, fp: fingerprint(request), origin },
    secret(),
  );
  return {
    token,
    message: loginMessage({
      address: normalizedAddress,
      nonce,
      expiresAt: exp * 1_000,
      origin,
    }),
    expiresAt: exp * 1_000,
  };
}

export async function establishFourMirrorSession(
  request: Request,
  input: { token?: unknown; message?: unknown; signature?: unknown },
) {
  if (
    typeof input.token !== "string" ||
    typeof input.message !== "string" ||
    typeof input.signature !== "string"
  ) {
    throw new FourMirrorAuthError("Invalid Four mirror login", 400);
  }
  const payload = decodeFlapMirrorSession(input.token, secret());
  if (
    !payload?.nonce ||
    payload.fp !== fingerprint(request) ||
    payload.origin !== new URL(request.url).origin ||
    !isAddress(payload.address)
  ) {
    throw new FourMirrorAuthError("Four mirror challenge expired", 401);
  }
  const expectedMessage = loginMessage({
    address: payload.address,
    nonce: payload.nonce,
    expiresAt: payload.exp * 1_000,
    origin: payload.origin,
  });
  if (
    input.message !== expectedMessage ||
    !isSupportedWalletSignature(input.signature, MAX_ADMIN_SIGNATURE_BYTES)
  ) {
    throw new FourMirrorAuthError("Four mirror challenge mismatch", 401);
  }
  const verified = await verifyWalletMessage({
    address: payload.address as Address,
    message: expectedMessage,
    signature: input.signature as Hex,
  }).catch(() => false);
  if (!verified) throw new FourMirrorAuthError("Invalid wallet signature", 401);

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
      path: "/api/four-mirrors",
      maxAge: SESSION_TTL_SECONDS,
    },
  );
  return { address: payload.address.toLowerCase(), expiresAt: exp * 1_000 };
}

export async function requireFourMirrorSession(request: Request) {
  const payload = decodeFlapMirrorSession(
    (await cookies()).get(COOKIE)?.value,
    secret(),
  );
  if (
    !payload ||
    payload.fp !== fingerprint(request) ||
    !isAddress(payload.address)
  ) {
    throw new FourMirrorAuthError("Unauthorized Four mirror session", 401);
  }
  return payload.address.toLowerCase();
}

export function consumeFourMirrorPrepareQuota(request: Request, wallet: string) {
  const key = `${wallet}:${fingerprint(request)}`;
  if (!prepareLimiter.consume(key)) {
    throw new FourMirrorAuthError(
      "Four mirror preparation rate limit exceeded",
      429,
    );
  }
}
