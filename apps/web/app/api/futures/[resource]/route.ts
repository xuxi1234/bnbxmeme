import { NextResponse } from "next/server";
import {
  consumeFuturesQuota,
  consumeFuturesRequestQuota,
  forwardFuturesRequest,
  requireFuturesSession,
} from "@/lib/futures-api-server";
import {
  FuturesApiError,
  localizeFuturesError,
  type FuturesLocale,
} from "@/lib/futures-api-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const locale = (request: Request): FuturesLocale => {
  const value = request.headers.get("accept-language")?.toLowerCase() ?? "en";
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("ko")) return "ko";
  if (value.startsWith("ja")) return "ja";
  return "en";
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
const handle = async (
  request: Request,
  context: { params: Promise<{ resource: string }> },
  method: "GET" | "POST" | "DELETE",
) => {
  try {
    await consumeFuturesRequestQuota(request);
    const session = await requireFuturesSession(request);
    await consumeFuturesQuota(session.wallet, method);
    const { resource } = await context.params;
    const result = await forwardFuturesRequest(
      request,
      resource,
      method,
      session.wallet,
    );
    return NextResponse.json(result.payload, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(request, error);
  }
};

export const GET = (
  request: Request,
  context: { params: Promise<{ resource: string }> },
) => handle(request, context, "GET");
export const POST = (
  request: Request,
  context: { params: Promise<{ resource: string }> },
) => handle(request, context, "POST");
export const DELETE = (
  request: Request,
  context: { params: Promise<{ resource: string }> },
) => handle(request, context, "DELETE");

const unsupported = (request: Request) =>
  failure(request, new FuturesApiError("method_not_allowed", 405));
export const PUT = unsupported;
export const PATCH = unsupported;
export const OPTIONS = unsupported;
