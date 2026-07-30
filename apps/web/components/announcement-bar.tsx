"use client";

import { announcementCopy } from "@/lib/security-copy";
import { useLanguage } from "./language-provider";

export function AnnouncementBar() {
  const { language } = useLanguage();
  const copy = announcementCopy[language];
  return (
    <div className="announcement-bar" aria-label="BNBX protocol">
      <div><span>{copy}</span><span aria-hidden="true">{copy}</span></div>
    </div>
  );
}
