"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <main
      className="project-state-page"
      data-project-state="not-found"
      aria-labelledby="page-not-found-title"
    >
      <section className="project-state-card" role="alert">
        <span className="eyebrow">BNBX / 404</span>
        <div className="project-state-mark" aria-hidden="true">
          ×
        </div>
        <h1 id="page-not-found-title">{t("pageNotFoundTitle")}</h1>
        <p>{t("pageNotFoundHelp")}</p>
        <div className="project-state-actions">
          <Link href="/?market=hot#market">{t("returnMarket")}</Link>
        </div>
      </section>
    </main>
  );
}
