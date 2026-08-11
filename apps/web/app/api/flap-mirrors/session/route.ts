import { NextResponse } from "next/server";
import {
  createFlapMirrorChallenge,
  establishFlapMirrorSession,
  FlapMirrorAuthError,
} from "@/lib/flap-mirror-auth";

export const runtime = "nodejs";

function failure(error: unknown) {
  const status = error instanceof FlapMirrorAuthError ? error.status : 400;
  const message = error instanceof Error ? error.message : "Flap mirror login failed";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    return NextResponse.json(createFlapMirrorChallenge(request, address), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await establishFlapMirrorSession(request, body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
