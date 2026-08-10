import { NextResponse } from "next/server";
import {
  normalizeFeaturedMarket,
  parseBscScanHolderCount,
  parseGoPlusHolderCount,
} from "@/lib/featured-market-data";

const BNBX_TOKEN = "0xfd87628840890c9ea4eb3a0053a691b29d3e1111";

export async function GET() {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${BNBX_TOKEN}`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) throw new Error("featured market unavailable");
    let holderCount: number | undefined;
    try {
      const holderResponse = await fetch(
        `https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${BNBX_TOKEN}`,
        { next: { revalidate: 300 } },
      );
      if (holderResponse.ok) {
        holderCount = parseGoPlusHolderCount(
          await holderResponse.json(),
          BNBX_TOKEN,
        );
      }
      if (holderCount === undefined) {
        const fallbackResponse = await fetch(
          `https://bscscan.com/token/${BNBX_TOKEN}?output=1`,
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "en-US,en;q=0.9",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
            },
            next: { revalidate: 300 },
          },
        );
        if (fallbackResponse.ok) {
          holderCount = parseBscScanHolderCount(await fallbackResponse.text());
        }
      }
    } catch {
      // A partial response is safer than replacing the last known count.
    }
    const market = normalizeFeaturedMarket(await response.json(), holderCount);
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
