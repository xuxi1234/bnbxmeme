"use client";

import Link from "next/link";
import { foundationCopy } from "@/lib/foundation-copy";
import { FoundationGoldX } from "./foundation-gold-x";
import { useLanguage } from "./language-provider";

export function FoundationEntry() {
  const { language } = useLanguage();
  const copy = foundationCopy[language];

  return (
    <Link className="foundation-entry" href="/foundation" aria-label={copy.entry}>
      <FoundationGoldX className="foundation-entry-mark" />
      <strong>{copy.entry}</strong>
    </Link>
  );
}
