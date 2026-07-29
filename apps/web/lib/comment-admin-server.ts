import "server-only";

import { NextRequest } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { officialFactoryAddresses } from "@/lib/deployments";
import { serverPublicClient } from "@/lib/server-chain";
import { buildCommentAdminLoginMessage } from "@/lib/comment-admin-message";

export const COMMENT_ADMIN_COOKIE = "bnbx_comment_admin";
const LOGIN_WINDOW_MS = 10 * 60_000;
const SESSION_LIFETIME_MS = 2 * 60 * 60_000;

type AdminSession = {
  wallet: string;
  signedAt: string;
  signature: string;
};

const feeRecipientAbi = [
  {
    type: "function",
    name: "feeRecipient",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

let cachedAdminWallets:
  | { expiresAt: number; wallets: Set<string> }
  | undefined;

async function allowedAdminWallets() {
  if (cachedAdminWallets && cachedAdminWallets.expiresAt > Date.now()) {
    return cachedAdminWallets.wallets;
  }
  const configured = (process.env.BNBX_COMMENT_ADMIN_WALLETS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is `0x${string}` => isAddress(value))
    .map((value) => value.toLowerCase());
  const results = await serverPublicClient.multicall({
    allowFailure: true,
    contracts: officialFactoryAddresses.map((address) => ({
      address,
      abi: feeRecipientAbi,
      functionName: "feeRecipient" as const,
    })),
  });
  const onchain = results.flatMap((result) =>
    result.status === "success" && isAddress(result.result)
      ? [result.result.toLowerCase()]
      : [],
  );
  const wallets = new Set([...configured, ...onchain]);
  cachedAdminWallets = {
    expiresAt: Date.now() + 5 * 60_000,
    wallets,
  };
  return wallets;
}

async function verifyAdminSignature(session: AdminSession, lifetimeMs: number) {
  if (
    !isAddress(session.wallet) ||
    !/^0x[0-9a-fA-F]{130}$/.test(session.signature)
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
  const wallets = await allowedAdminWallets().catch(() => new Set<string>());
  if (!wallets.has(session.wallet.toLowerCase())) return null;
  const message = buildCommentAdminLoginMessage({
    wallet: session.wallet,
    signedAt: session.signedAt,
  });
  const verified = await verifyMessage({
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
  if (!raw || raw.length > 1_024) return null;
  try {
    const session = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as AdminSession;
    return verifyAdminSignature(session, SESSION_LIFETIME_MS);
  } catch {
    return null;
  }
}
