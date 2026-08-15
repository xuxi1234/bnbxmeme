import { NextResponse } from "next/server";
import {
  createFuturesChallenge,
  establishFuturesSession,
} from "@/lib/futures-api-server";
import {
  FuturesApiError,
  localizeFuturesError,
  readBoundedBody,
} from "@/lib/futures-api-core";

export const runtime = "nodejs";
const locale = (request: Request) => {
  const value = request.headers.get("accept-language")?.toLowerCase() ?? "en";
  if (value.startsWith("zh")) return "zh" as const;
  if (value.startsWith("ko")) return "ko" as const;
  if (value.startsWith("ja")) return "ja" as const;
  return "en" as const;
};
const failure = (request: Request, error: unknown) => {
  const value =
    error instanceof FuturesApiError
      ? error
      : new FuturesApiError("service_unavailable", 503);
  return NextResponse.json(
    {
      code: value.code,
      message: localizeFuturesError(value.code, locale(request)),
    },
    { status: value.status, headers: { "Cache-Control": "no-store" } },
  );
};

export async function GET(request: Request) {
  try {
    const wallet = new URL(request.url).searchParams.get("wallet") ?? "";
    return NextResponse.json(await createFuturesChallenge(request, wallet), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(request, error);
  }
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 16_384)
      throw new FuturesApiError("invalid_schema", 413);
    const text = await readBoundedBody(
      request.body,
      16_384,
      413,
      "invalid_schema",
    );
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new FuturesApiError("invalid_schema", 400);
    }
    return NextResponse.json(await establishFuturesSession(request, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(request, error);
  }
}

const unsupported = (request: Request) =>
  failure(request, new FuturesApiError("method_not_allowed", 405));
export const PUT = unsupported;
export const PATCH = unsupported;
export const DELETE = unsupported;
export const OPTIONS = unsupported;
