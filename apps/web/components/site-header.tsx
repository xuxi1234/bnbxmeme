"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WalletButton } from "./wallet-button";
import { useLanguage, type Language } from "./language-provider";

const languageLabels: Record<Language, string> = {
  zh: "中文",
  en: "English",
  ko: "한국어",
  ja: "日本語",
};

export function SiteHeader() {
  const { language, setLanguage, theme, toggleTheme, t } = useLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const languageMenu = useRef<HTMLDivElement>(null);
  const navigation = [
    [t("market"), "/#market"],
    [t("create"), "/create"],
    [t("today"), "/#market"],
    [t("history"), "/#market"],
  ];

  useEffect(() => {
    function closeLanguageMenu(event: PointerEvent) {
      if (!languageMenu.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeLanguageMenu);
    return () => document.removeEventListener("pointerdown", closeLanguageMenu);
  }, []);

  function chooseLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);
  }

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
        <div className="language-menu" ref={languageMenu}>
          <button
            className="language-trigger"
            type="button"
            aria-label="Language"
            aria-haspopup="menu"
            aria-expanded={languageMenuOpen}
            onClick={() => setLanguageMenuOpen((open) => !open)}
          >
            <span>{languageLabels[language]}</span>
            <i aria-hidden="true">⌄</i>
          </button>
          {languageMenuOpen && (
            <div className="language-options" role="menu" aria-label="Language">
              {(Object.keys(languageLabels) as Language[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={language === option}
                  onClick={() => chooseLanguage(option)}
                >
                  <span>{languageLabels[option]}</span>
                  {language === option && <strong aria-hidden="true">✓</strong>}
                </button>
              ))}
            </div>
          )}
        </div>
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
          MAINNET
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
