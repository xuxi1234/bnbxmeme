import { NextResponse } from "next/server";
import { prepareFourMirrorMetadata } from "@/lib/four-mirror-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sourceAddress?: unknown };
    if (typeof body.sourceAddress !== "string") {
      return NextResponse.json({ error: "Invalid Four token address" }, { status: 400 });
    }
    const prepared = await prepareFourMirrorMetadata(body.sourceAddress);
    return NextResponse.json(prepared, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mirror preparation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
