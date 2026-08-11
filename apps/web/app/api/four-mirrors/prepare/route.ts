import { NextResponse } from "next/server";
import { prepareFourMirrorMetadata } from "@/lib/four-mirror-server";
import {
  consumeFourMirrorPrepareQuota,
  FourMirrorAuthError,
  requireFourMirrorSession,
} from "@/lib/four-mirror-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const wallet = await requireFourMirrorSession(request);
    consumeFourMirrorPrepareQuota(request, wallet);
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
    const status = error instanceof FourMirrorAuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
