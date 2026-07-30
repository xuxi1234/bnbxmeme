"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { seoCopy } from "@/lib/seo";
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
    document.title = copy.title;
    updateMeta('meta[name="description"]', copy.description);
    updateMeta('meta[property="og:title"]', copy.title);
    updateMeta('meta[property="og:description"]', copy.description);
    updateMeta('meta[property="og:locale"]', copy.locale);
    updateMeta('meta[name="twitter:title"]', copy.title);
    updateMeta('meta[name="twitter:description"]', copy.description);
  }, [language, pathname]);

  return null;
}
