import { NextResponse } from "next/server";
import {
  createChallenge,
  establishSession,
  fingerprint,
} from "@/lib/bnbx-ai-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    return NextResponse.json(createChallenge(address, fingerprint(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json();
    return NextResponse.json(await establishSession(request, input));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access denied" },
      { status: 401 },
    );
  }
}
