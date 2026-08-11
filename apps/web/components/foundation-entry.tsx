"use client";

import Link from "next/link";
import { foundationCopy } from "@/lib/foundation-copy";
import { useLanguage } from "./language-provider";

export function FoundationEntry() {
  const { language } = useLanguage();
  const copy = foundationCopy[language];

  return (
    <Link className="foundation-entry" href="/foundation" aria-label={copy.entry}>
      <span className="foundation-entry-shield" aria-hidden="true">F</span>
      <strong>{copy.entry}</strong>
    </Link>
  );
}
