"use client";

import Image from "next/image";
import Link from "next/link";
import { WalletButton } from "./wallet-button";
import { useLanguage, type Language } from "./language-provider";

export function SiteHeader() {
  const { language, setLanguage, theme, toggleTheme, t } = useLanguage();
  const navigation = [
    [t("market"), "/#market"],
    [t("create"), "/create"],
    [t("today"), "/#market"],
    [t("history"), "/#market"],
  ];
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="BNBX 首页">
        <Image
          className="brand-logo"
          src="/bnbx-logo.png"
          width={40}
          height={40}
          priority
          alt="BNBX"
        />
        <span>
          <strong>BNBX</strong>
          <small>ZERO-TAX LAUNCHPAD</small>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label="主导航">
        {navigation.map(([label, href]) => (
          <Link key={label} href={href}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <select
          className="language-select"
          aria-label="Language"
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
        >
          <option value="zh">中文</option>
          <option value="en">EN</option>
          <option value="ko">한국어</option>
          <option value="ja">日本語</option>
        </select>
        <button
          className="theme-toggle"
          type="button"
          aria-label={t("theme")}
          title={t("theme")}
          onClick={toggleTheme}
        >
          {theme === "dark" ? "☀" : "◐"}
        </button>
        <span className="network-chip">
          <i />
          TESTNET
        </span>
        <WalletButton />
      </div>
      <nav className="mobile-nav" aria-label="移动端导航">
        {navigation.slice(0, 3).map(([label, href]) => (
          <Link key={label} href={href}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
