"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

export function ProjectState({
  state,
}: {
  state: "not-found" | "unavailable";
}) {
  const { t } = useLanguage();
  const unavailable = state === "unavailable";

  return (
    <main
      className="project-state-page"
      data-project-state={state}
      aria-labelledby="project-state-title"
    >
      <section className="project-state-card" role={unavailable ? "status" : "alert"}>
        <span className="eyebrow">BNBX / {unavailable ? "TEMPORARY" : "404"}</span>
        <div className="project-state-mark" aria-hidden="true">
          {unavailable ? "↻" : "×"}
        </div>
        <h1 id="project-state-title">
          {t(unavailable ? "projectUnavailableTitle" : "projectNotFoundTitle")}
        </h1>
        <p>
          {t(unavailable ? "projectUnavailableHelp" : "projectNotFoundHelp")}
        </p>
        <div className="project-state-actions">
          {unavailable && (
            <button type="button" onClick={() => window.location.reload()}>
              {t("retryNow")}
            </button>
          )}
          <Link href="/?market=hot#market">{t("returnMarket")}</Link>
        </div>
      </section>
    </main>
  );
}
