"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress } from "viem";
import { TokenMarket } from "@/components/token-market";
import { useLanguage } from "@/components/language-provider";
import { blockExplorerUrl } from "@/lib/web3";

export default function CreatorProfilePage() {
  const params = useParams<{ address: string }>();
  const address = isAddress(params.address) ? params.address : null;
  const { t } = useLanguage();

  return (
    <main className="home">
      <section className="market-section creator-profile">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CREATOR PROFILE · BNB CHAIN</p>
            <h1>{t("creatorProjects")}</h1>
            <p className="lead creator-address">
              {address ?? t("dataUnavailable")}
            </p>
          </div>
          {address && (
            <a
              className="button secondary"
              href={`${blockExplorerUrl}/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              BscScan ↗
            </a>
          )}
        </div>
        {address ? (
          <TokenMarket creator={address} />
        ) : (
          <div className="market-no-results">
            {t("dataUnavailableHelp")}
          </div>
        )}
        <Link className="button secondary" href="/?market=hot#market">
          ← {t("market")}
        </Link>
      </section>
    </main>
  );
}
