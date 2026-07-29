import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400;

const PUBLIC_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs",
  "https://ipfs.io/ipfs",
];

function gatewayCandidates(path: string) {
  const configuredGateway = process.env.IPFS_GATEWAY?.replace(/\/+$/, "");
  return [
    ...(configuredGateway ? [configuredGateway] : []),
    ...PUBLIC_GATEWAYS,
  ].map((gateway) => `${gateway}/${path}`);
}

function safePath(parts: string[]) {
  try {
    const decoded = parts.map((part) => decodeURIComponent(part));
    if (
      decoded.length === 0 ||
      decoded.some((part) => !part || part === "." || part === ".." || part.includes("/"))
    ) {
      return null;
    }
    return decoded.map(encodeURIComponent).join("/");
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: parts } = await context.params;
  const path = safePath(parts);
  if (!path) {
    return NextResponse.json({ error: "Invalid IPFS path" }, { status: 400 });
  }

  for (const candidate of gatewayCandidates(path)) {
    try {
      const response = await fetch(candidate, {
        signal: AbortSignal.timeout(8_000),
        next: { revalidate: 86400 },
      });
      if (!response.ok || !response.body) continue;

      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      // Try the next gateway. The browser only talks to bnbx.meme, avoiding
      // mobile-network blocks against individual public IPFS gateways.
    }
  }

  return NextResponse.json(
    { error: "IPFS content is temporarily unavailable" },
    { status: 502 },
  );
}
