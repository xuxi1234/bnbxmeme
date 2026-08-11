import { createHmac, timingSafeEqual } from "node:crypto";

export type FlapMirrorSessionPayload = {
  address: string;
  exp: number;
  nonce?: string;
  fp: string;
  origin?: string;
};

function signature(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeFlapMirrorSession(
  payload: FlapMirrorSessionPayload,
  secret: string,
) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeFlapMirrorSession(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): FlapMirrorSessionPayload | null {
  if (!token || token.length > 3_500) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = signature(body, secret);
  if (
    mac.length !== expected.length ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as FlapMirrorSessionPayload;
    return payload.exp >= nowSeconds ? payload : null;
  } catch {
    return null;
  }
}

export function buildFlapMirrorLoginMessage({
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
    "BNBX Flap mirror operator access",
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

export class FlapMirrorRateLimiter {
  private entries = new Map<string, { count: number; resetsAt: number }>();
  private maximum: number;
  private windowMs: number;

  constructor({ maximum, windowMs }: { maximum: number; windowMs: number }) {
    this.maximum = maximum;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()) {
    const current = this.entries.get(key);
    if (!current || current.resetsAt < now) {
      this.entries.set(key, { count: 1, resetsAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.maximum) return false;
    current.count += 1;
    return true;
  }
}
