import { NextResponse } from "next/server";
import { prepareFlapMirrorMetadata } from "@/lib/flap-mirror-server";
import {
  consumeFlapMirrorPrepareQuota,
  FlapMirrorAuthError,
  requireFlapMirrorSession,
} from "@/lib/flap-mirror-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const wallet = await requireFlapMirrorSession(request);
    consumeFlapMirrorPrepareQuota(request, wallet);
    const body = (await request.json()) as { sourceAddress?: unknown };
    if (typeof body.sourceAddress !== "string") {
      return NextResponse.json({ error: "Invalid Flap token address" }, { status: 400 });
    }
    const prepared = await prepareFlapMirrorMetadata(body.sourceAddress);
    return NextResponse.json(prepared, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Flap mirror preparation failed";
    const status = error instanceof FlapMirrorAuthError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
