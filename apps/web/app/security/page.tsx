"use client";

import Link from "next/link";
import {
  autoLiquidityFactoryAddress,
  blockExplorerUrl,
  legacyRewardsFactoryAddress,
  legacyStandardFactoryAddress,
  lpBurnAddress,
  pancakeRouterAddress,
  rewardsFactoryAddress,
  v3StandardFactoryAddress,
} from "@/lib/web3";
import { useLanguage } from "@/components/language-provider";
import { resolveSecurityCopy } from "@/lib/security-copy";
import { MAX_TEMPLATE_SIDE_TAX_PERCENT } from "@/lib/template-rules";

const officialDomains = [
  "bnbx.meme",
  "bnbx.sh",
  "bnbx.fun",
  "bnbx.dev",
  "bnbx.app",
] as const;

export default function SecurityPage() {
  const { language, t } = useLanguage();
  const content = resolveSecurityCopy(language, MAX_TEMPLATE_SIDE_TAX_PERCENT);
  const officialAddresses = [
    ...(v3StandardFactoryAddress
      ? [
          {
            label: content.factoryLabels.standard,
            address: v3StandardFactoryAddress,
            sourceCode: true,
          },
        ]
      : []),
    ...(rewardsFactoryAddress
      ? [
          {
            label: content.factoryLabels.rewards,
            address: rewardsFactoryAddress,
            sourceCode: true,
          },
        ]
      : []),
    {
      label: content.factoryLabels.legacyStandard,
      address: legacyStandardFactoryAddress,
      sourceCode: true,
    },
    {
      label: content.factoryLabels.autoLiquidity,
      address: autoLiquidityFactoryAddress,
      sourceCode: true,
    },
    {
      label: content.factoryLabels.legacyRewards,
      address: legacyRewardsFactoryAddress,
      sourceCode: true,
    },
    {
      label: content.factoryLabels.router,
      address: pancakeRouterAddress,
      sourceCode: true,
    },
    {
      label: content.factoryLabels.burnAddress,
      address: lpBurnAddress,
      sourceCode: false,
    },
  ].filter(
    (entry, index, entries) =>
      entries.findIndex(
        (candidate) =>
          candidate.address.toLowerCase() === entry.address.toLowerCase(),
      ) === index,
  );

  return (
    <main className="security-page">
      <section className="security-hero">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.lead}</p>
      </section>
      <section className="trust-grid">
        <article>
          <h2>{content.domain}</h2>
          {officialDomains.map((domain) => (
            <a key={domain} href={`https://${domain}/`}>
              {domain}
            </a>
          ))}
        </article>
        <article>
          <h2>{content.fees}</h2>
          <dl>
            {content.feeItems.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
      <section className="official-contracts">
        <h2>{content.contracts}</h2>
        {officialAddresses.map(({ label, address, sourceCode }) => (
          <a
            key={address}
            href={`${blockExplorerUrl}/address/${address}${sourceCode ? "#code" : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>{label}</span>
            <strong>{address}</strong>
            <b>BSCSCAN ↗</b>
          </a>
        ))}
      </section>
      <section className="trust-grid">
        <article>
          <h2>{content.templateRules}</h2>
          <p>{content.templateRuleHelp}</p>
          <dl>
            {content.templateItems.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
        <article>
          <h2>{content.dataStatus}</h2>
          <p>{content.dataStatusHelp}</p>
          <dl>
            {content.dataItems.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
      <section className="trust-grid">
        <article>
          <h2>{content.wallet}</h2>
          <ul>
            {content.walletItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <h2>{content.source}</h2>
          <p>{content.sourceText}</p>
          <h3>{content.lpProof}</h3>
          <p>{content.lpProofText}</p>
          <a
            href={`${blockExplorerUrl}/address/${lpBurnAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {content.verifyBurnAddress} ↗
          </a>
          <p className="trust-warning">{content.report}</p>
          <Link className="button secondary" href="/create">
            {t("createToken")}
          </Link>
        </article>
      </section>
    </main>
  );
}
