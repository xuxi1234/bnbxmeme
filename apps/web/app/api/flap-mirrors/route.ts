import { NextResponse } from "next/server";
import { discoverFlapMirrors } from "@/lib/flap-mirror-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const mirrors = await discoverFlapMirrors();
    return NextResponse.json(
      { mirrors, refreshedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flap discovery failed";
    return NextResponse.json({ error: message, mirrors: [] }, { status: 502 });
  }
}
