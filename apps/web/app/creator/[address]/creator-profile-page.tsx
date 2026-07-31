"use client";

import Link from "next/link";
import { TokenMarket } from "@/components/token-market";
import { useLanguage } from "@/components/language-provider";
import { blockExplorerUrl } from "@/lib/web3";

export function CreatorProfilePage({
  address,
}: Readonly<{ address: `0x${string}` }>) {
  const { t } = useLanguage();

  return (
    <main className="home">
      <section className="market-section creator-profile">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CREATOR PROFILE · BNB CHAIN</p>
            <h1>{t("creatorProjects")}</h1>
            <p className="lead creator-address">{address}</p>
          </div>
          <a
            className="button secondary"
            href={`${blockExplorerUrl}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            BscScan ↗
          </a>
        </div>
        <TokenMarket creator={address} />
        <Link className="button secondary" href="/?market=hotInternal#market">
          ← {t("market")}
        </Link>
      </section>
    </main>
  );
}
