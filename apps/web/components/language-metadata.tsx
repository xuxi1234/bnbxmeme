"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  buildCreatorSeoDescription,
  buildCreatorSeoTitle,
  seoCopy,
} from "@/lib/seo";
import { useLanguage } from "./language-provider";

function updateMeta(selector: string, content: string) {
  document.head
    .querySelector<HTMLMetaElement>(selector)
    ?.setAttribute("content", content);
}

export function LanguageMetadata() {
  const { language } = useLanguage();
  const pathname = usePathname();

  useEffect(() => {
    const copy = seoCopy[language];
    const tokenPage = pathname.startsWith("/token/");
    if (tokenPage) return;
    const creatorAddress = pathname.match(
      /^\/creator\/(0x[a-f0-9]{40})$/i,
    )?.[1];
    const title = creatorAddress
      ? (buildCreatorSeoTitle(creatorAddress, language) ?? copy.title)
      : copy.title;
    const description = creatorAddress
      ? (buildCreatorSeoDescription(creatorAddress, language) ??
        copy.description)
      : copy.description;

    document.title = title;
    updateMeta('meta[property="og:title"]', title);
    updateMeta('meta[name="twitter:title"]', title);
    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[property="og:locale"]', copy.locale);
    updateMeta('meta[name="twitter:description"]', description);
  }, [language, pathname]);

  return null;
}
