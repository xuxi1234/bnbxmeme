"use client";

import { useState } from "react";
import { FoundationGoldX } from "@/components/foundation-gold-x";
import { useLanguage } from "@/components/language-provider";
import { foundationCopy } from "@/lib/foundation-copy";
import {
  FOUNDATION_MULTISIG_ADDRESS,
  FOUNDATION_MULTISIG_EXPLORER_URL,
  SHARE_TOKEN_AMOUNT,
  TOTAL_FOUNDATION_SHARES,
  foundationShareholders,
  foundationSummary,
} from "@/lib/foundation-directory";

const locales = {
  zh: "zh-CN",
  en: "en-US",
  ko: "ko-KR",
  ja: "ja-JP",
} as const;

export default function FoundationPage() {
  const { language } = useLanguage();
  const copy = foundationCopy[language];
  const [copied, setCopied] = useState(false);
  const format = (value: number) => value.toLocaleString(locales[language]);

  async function copyMultisigAddress() {
    await navigator.clipboard.writeText(FOUNDATION_MULTISIG_ADDRESS);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  return (
    <main className="foundation-page">
      <section className="foundation-hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.lead}</p>
        </div>
        <FoundationGoldX className="foundation-hero-mark" />
      </section>

      <section className="foundation-stats" aria-label={copy.progress}>
        <article>
          <span>{copy.perShare}</span>
          <strong>{format(SHARE_TOKEN_AMOUNT)}</strong>
          <small>BNBX</small>
        </article>
        <article>
          <span>{copy.totalShares}</span>
          <strong>{format(TOTAL_FOUNDATION_SHARES)}</strong>
          <small>{copy.shareUnit}</small>
        </article>
        <article>
          <span>{copy.registered}</span>
          <strong>{format(foundationSummary.registeredShares)}</strong>
          <small>{format(foundationSummary.registeredTokenAmount)} BNBX</small>
        </article>
        <article>
          <span>{copy.remaining}</span>
          <strong>{format(foundationSummary.remainingShares)}</strong>
          <small>{format(foundationSummary.remainingTokenAmount)} BNBX</small>
        </article>
      </section>

      <section className="foundation-progress-card">
        <div>
          <span>{copy.progress}</span>
          <strong>{foundationSummary.registrationPercent}%</strong>
        </div>
        <div className="foundation-progress-track" aria-hidden="true">
          <span style={{ width: `${foundationSummary.registrationPercent}%` }} />
        </div>
      </section>

      <section className="foundation-multisig">
        <div>
          <span>{copy.multisig}</span>
          <strong>{copy.multisigType}</strong>
        </div>
        <code>{FOUNDATION_MULTISIG_ADDRESS}</code>
        <div className="foundation-multisig-actions">
          <button type="button" onClick={copyMultisigAddress}>
            {copied ? copy.copied : copy.copyAddress}
          </button>
          <a
            href={FOUNDATION_MULTISIG_EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
          >
            {copy.viewBscScan} ↗
          </a>
        </div>
      </section>

      <section className="foundation-directory">
        <header>
          <div>
            <p className="eyebrow">BNBX FOUNDATION</p>
            <h2>{copy.directoryTitle}</h2>
          </div>
          <p>{copy.directoryHelp}</p>
        </header>
        <div className="foundation-directory-table" role="table">
          <div className="foundation-directory-head" role="row">
            <span role="columnheader">{copy.number}</span>
            <span role="columnheader">{copy.shareholder}</span>
            <span role="columnheader">{copy.shares}</span>
            <span role="columnheader">{copy.tokenAmount}</span>
          </div>
          {foundationShareholders.map((shareholder) => (
            <div className="foundation-directory-row" role="row" key={shareholder.id}>
              <span role="cell" data-label={copy.number}>{shareholder.id}</span>
              <strong role="cell" data-label={copy.shareholder}>{shareholder.name}</strong>
              <span role="cell" data-label={copy.shares}>
                {format(shareholder.shares)} {copy.shareUnit}
              </span>
              <span role="cell" data-label={copy.tokenAmount}>
                {format(shareholder.shares * SHARE_TOKEN_AMOUNT)} BNBX
              </span>
            </div>
          ))}
        </div>
        <p className="foundation-notice">{copy.notice}</p>
      </section>
    </main>
  );
}
