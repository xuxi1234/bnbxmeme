import { NextResponse } from "next/server";
import { normalizeFeaturedMarket } from "@/lib/featured-market-data";

const BNBX_TOKEN = "0xfd87628840890c9ea4eb3a0053a691b29d3e1111";

export async function GET() {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${BNBX_TOKEN}`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) throw new Error("featured market unavailable");
    const market = normalizeFeaturedMarket(await response.json());
    return NextResponse.json(market ?? {}, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      {},
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
        },
      },
    );
  }
}
