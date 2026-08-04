"use client";

import { Suspense } from "react";
import { HomeBanner } from "@/components/home-banner";
import { TokenMarket } from "@/components/token-market";

export function HomePage() {
  return (
    <main className="home">
      <section className="market-section" id="market">
        <Suspense fallback={null}>
          <TokenMarket />
        </Suspense>
      </section>

      <HomeBanner />
    </main>
  );
}
