import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isAddress, type Address, type Hex } from "viem";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import { serverPublicClient } from "@/lib/server-chain";

const COOKIE = "bnbx_ai_session";
const CHALLENGE_TTL = 5 * 60;
const SESSION_TTL = 60 * 60;
const MIN_BALANCE = 10n ** 18n;

type Payload = { address: string; exp: number; nonce?: string; fp?: string };

function secret() {
  const value = process.env.BNBX_AI_SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Error("BNBX_AI_SESSION_SECRET is not configured");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(payload: Payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  if (
    mac.length !== expected.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  )
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as Payload;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export function fingerprint(request: Request) {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";
  return createHmac("sha256", secret())
    .update(`${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

export function createChallenge(address: string, fp: string) {
  if (!isAddress(address)) throw new Error("Invalid wallet address");
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL;
  const nonce = randomBytes(18).toString("hex");
  const token = encode({ address: address.toLowerCase(), exp, nonce, fp });
  const message = [
    "BNBX AI access request",
    "",
    `Domain: www.bnbx.meme`,
    `Chain ID: 56`,
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(exp * 1000).toISOString()}`,
    "",
    "This signature is gasless and does not authorize transactions.",
  ].join("\n");
  return { token, message, expiresAt: exp * 1000 };
}

export async function establishSession(
  request: Request,
  input: { token?: string; message?: string; signature?: string },
) {
  const payload = decode(input.token);
  const fp = fingerprint(request);
  if (
    !payload?.nonce ||
    payload.fp !== fp ||
    !input.message ||
    !input.signature
  )
    throw new Error("Challenge expired");
  if (
    !input.message.includes(`Wallet: ${payload.address}`) ||
    !input.message.includes(`Nonce: ${payload.nonce}`)
  )
    throw new Error("Challenge mismatch");
  const address = payload.address as Address;
  const valid = await verifyWalletMessage({
    address,
    message: input.message,
    signature: input.signature as Hex,
  });
  if (!valid) throw new Error("Invalid wallet signature");
  await assertBalance(address);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  (await cookies()).set(COOKIE, encode({ address, exp, fp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return { address, expiresAt: exp * 1000 };
}

export async function requireSession(request: Request) {
  const payload = decode((await cookies()).get(COOKIE)?.value);
  if (
    !payload ||
    payload.fp !== fingerprint(request) ||
    !isAddress(payload.address)
  )
    throw new Error("Unauthorized");
  await assertBalance(payload.address);
  return payload.address.toLowerCase();
}

async function assertBalance(address: Address) {
  const balance = await serverPublicClient.getBalance({ address });
  if (balance <= MIN_BALANCE) throw new Error("More than 1 BNB is required");
}
