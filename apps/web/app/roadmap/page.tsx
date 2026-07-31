"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import {
  LIVE_NETWORK,
  networkRoadmapCopy,
  ROADMAP_NETWORKS,
} from "@/lib/network-roadmap";

export default function NetworkRoadmapPage() {
  const { language } = useLanguage();
  const copy = networkRoadmapCopy[language];

  return (
    <main className="security-page network-roadmap-page">
      <section className="security-hero">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
      </section>

      <section className="network-roadmap-live" aria-label={copy.liveStatus}>
        <div
          className="network-option-logo"
          style={{ background: LIVE_NETWORK.color }}
          aria-hidden="true"
        >
          {LIVE_NETWORK.mark}
        </div>
        <div>
          <span>{copy.liveStatus}</span>
          <h2>{copy.liveTitle}</h2>
          <p>{copy.liveHelp}</p>
        </div>
        <strong>{LIVE_NETWORK.short}</strong>
      </section>

      <section
        className="network-roadmap-section"
        aria-labelledby="network-roadmap-candidates"
      >
        <div>
          <p className="eyebrow">{copy.evaluationStatus}</p>
          <h2 id="network-roadmap-candidates">{copy.evaluationTitle}</h2>
          <p>{copy.evaluationHelp}</p>
        </div>
        <div className="network-roadmap-grid">
          {ROADMAP_NETWORKS.map((network) => (
            <article key={network.name}>
              <span
                className="network-option-logo"
                style={{
                  background: network.color,
                  color: network.name === "X Layer" ? "#050505" : "#071007",
                }}
                aria-hidden="true"
              >
                {network.mark}
              </span>
              <div>
                <strong>{network.name}</strong>
                <small>{network.short}</small>
              </div>
              <em>{copy.evaluationStatus}</em>
            </article>
          ))}
        </div>
        <p className="trust-warning">{copy.noTimeline}</p>
      </section>

      <Link className="button secondary" href="/?market=hotInternal#market">
        ← {copy.backMarket}
      </Link>
    </main>
  );
}
