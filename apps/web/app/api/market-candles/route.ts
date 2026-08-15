import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  geckoOhlcvRequest,
  parseGeckoOhlcv,
} from "@/lib/external-market-candles";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const pair = request.nextUrl.searchParams.get("pair");
  const token = request.nextUrl.searchParams.get("token");
  const period = Number(request.nextUrl.searchParams.get("period"));
  if (!pair || !token || !isAddress(pair) || !isAddress(token)) {
    return NextResponse.json({ error: "Invalid market" }, { status: 400 });
  }

  let timeframe: string;
  let aggregate: string;
  try {
    ({ timeframe, aggregate } = geckoOhlcvRequest({ pair, token, period }));
  } catch {
    return NextResponse.json({ error: "Invalid chart period" }, { status: 400 });
  }

  const endpoint = new URL(
    `/api/v2/networks/bsc/pools/${pair}/ohlcv/${timeframe}`,
    "https://api.geckoterminal.com",
  );
  endpoint.searchParams.set("aggregate", aggregate);
  endpoint.searchParams.set("limit", "240");
  endpoint.searchParams.set("currency", "usd");
  endpoint.searchParams.set("token", token);

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json;version=20230302" },
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "External candles unavailable" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    const candles = parseGeckoOhlcv(await response.json());
    return NextResponse.json(
      { candles, refreshedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "X-BNBX-Market-Source": "GECKOTERMINAL",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "External candles unavailable" },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }
}
