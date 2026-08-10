import { NextResponse } from "next/server";
import { discoverFourMirrors } from "@/lib/four-mirror-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mirrors = await discoverFourMirrors();
    return NextResponse.json(
      { mirrors, refreshedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Four discovery failed";
    return NextResponse.json({ error: message, mirrors: [] }, { status: 502 });
  }
}
