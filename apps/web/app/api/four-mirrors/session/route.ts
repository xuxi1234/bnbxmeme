import { NextResponse } from "next/server";
import {
  createFourMirrorChallenge,
  establishFourMirrorSession,
  FourMirrorAuthError,
} from "@/lib/four-mirror-auth";

export const runtime = "nodejs";

function failure(error: unknown) {
  const status = error instanceof FourMirrorAuthError ? error.status : 400;
  const message = error instanceof Error ? error.message : "Four mirror login failed";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    return NextResponse.json(createFourMirrorChallenge(request, address), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(await establishFourMirrorSession(request, body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
