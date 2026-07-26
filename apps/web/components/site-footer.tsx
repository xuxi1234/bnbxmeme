"use client";

import { useLanguage } from "./language-provider";

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <div><strong>BNBX</strong><span>Build Next Bull System</span></div>
      <p>{t("risk")}</p>
      <nav className="footer-socials" aria-label="BNBX">
        <a href="https://t.me/bnbxmeme" target="_blank" rel="noreferrer">Telegram ↗</a>
        <a href="https://x.com/bnbxmeme" target="_blank" rel="noreferrer">X / Twitter ↗</a>
        <a href="https://m.debox.pro/group?id=6wsohe3g&amp;code=57h6sfxd" target="_blank" rel="noreferrer">DeBox ↗</a>
      </nav>
      <small>© 2026 BNBX</small>
    </footer>
  );
}
