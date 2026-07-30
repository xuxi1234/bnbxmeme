import "server-only";

import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { resolveAdminSigningWallet } from "@/lib/admin-signing-wallet";
import {
  isSupportedWalletSignature,
  MAX_ADMIN_SIGNATURE_BYTES,
} from "@/lib/comment-signature-core";
import { verifyWalletMessage } from "@/lib/comment-signature-server";
import { buildCommentAdminLoginMessage } from "@/lib/comment-admin-message";

export const COMMENT_ADMIN_COOKIE = "bnbx_comment_admin";
const LOGIN_WINDOW_MS = 10 * 60_000;
const SESSION_LIFETIME_MS = 2 * 60 * 60_000;

type AdminSession = {
  wallet: string;
  signedAt: string;
  signature: string;
};

function allowedAdminWallet() {
  return resolveAdminSigningWallet(process.env.BNBX_ADMIN_SIGNING_WALLET);
}

async function verifyAdminSignature(session: AdminSession, lifetimeMs: number) {
  if (
    !isAddress(session.wallet) ||
    !isSupportedWalletSignature(session.signature, MAX_ADMIN_SIGNATURE_BYTES)
  ) {
    return null;
  }
  const signedTime = Date.parse(session.signedAt);
  if (
    !Number.isFinite(signedTime) ||
    signedTime > Date.now() + 2 * 60_000 ||
    signedTime < Date.now() - lifetimeMs
  ) {
    return null;
  }
  if (session.wallet.toLowerCase() !== allowedAdminWallet()) return null;
  const message = buildCommentAdminLoginMessage({
    wallet: session.wallet,
    signedAt: session.signedAt,
  });
  const verified = await verifyWalletMessage({
    address: session.wallet,
    message,
    signature: session.signature as `0x${string}`,
  }).catch(() => false);
  return verified ? session.wallet.toLowerCase() : null;
}

export async function authenticateCommentAdmin(input: AdminSession) {
  return verifyAdminSignature(input, LOGIN_WINDOW_MS);
}

export function encodeCommentAdminSession(input: AdminSession) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export async function readCommentAdminSession(request: NextRequest) {
  const raw = request.cookies.get(COMMENT_ADMIN_COOKIE)?.value;
  if (!raw || raw.length > 3_500) return null;
  try {
    const session = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as AdminSession;
    return verifyAdminSignature(session, SESSION_LIFETIME_MS);
  } catch {
    return null;
  }
}
