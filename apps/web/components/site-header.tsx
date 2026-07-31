"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WalletButton } from "./wallet-button";
import { NetworkMenu } from "./network-menu";
import { useLanguage, type Language } from "./language-provider";
import { accessibilityCopy } from "@/lib/localization-copy";

const languageLabels: Record<Language, string> = {
  zh: "中文",
  en: "English",
  ko: "한국어",
  ja: "日本語",
};

export function SiteHeader() {
  const { language, setLanguage, theme, toggleTheme, t } = useLanguage();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const languageMenu = useRef<HTMLDivElement>(null);
  const mobileMenu = useRef<HTMLDivElement>(null);
  const a11y = accessibilityCopy[language];
  const navigation = [
    [t("market"), "/?market=hot#market"],
    [t("today"), "/?market=graduating#market"],
    [t("create"), "/create"],
    [t("history"), "/?market=graduated#market"],
    [t("securityCenter"), "/security"],
  ];

  useEffect(() => {
    function closeLanguageMenu(event: PointerEvent) {
      if (!languageMenu.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
      if (!mobileMenu.current?.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLanguageMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeLanguageMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeLanguageMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  function chooseLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);
    setMobileMenuOpen(false);
  }

  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label={a11y.brandHome}>
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
          <small>BNB CHAIN LAUNCHPAD</small>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label={a11y.primaryNavigation}>
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
            aria-label={t("language")}
            aria-haspopup="menu"
            aria-expanded={languageMenuOpen}
            onClick={() => setLanguageMenuOpen((open) => !open)}
          >
            <span>{languageLabels[language]}</span>
            <i aria-hidden="true">⌄</i>
          </button>
          {languageMenuOpen && (
            <div className="language-options" role="menu" aria-label={t("language")}>
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
        <NetworkMenu />
        <WalletButton />
        <div className="mobile-menu" ref={mobileMenu}>
          <button
            className="mobile-menu-trigger"
            type="button"
            aria-label={t("mobileMenu")}
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          {mobileMenuOpen && (
            <div className="mobile-menu-panel" role="menu">
              <div className="mobile-menu-heading">
                <strong>BNBX</strong>
                <button
                  type="button"
                  aria-label={t("close")}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <nav aria-label={t("mobileMenu")}>
                {navigation.map(([label, href]) => (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="mobile-menu-section">
                <span>{t("language")}</span>
                <div className="mobile-language-grid">
                  {(Object.keys(languageLabels) as Language[]).map((option) => (
                    <button
                      key={option}
                      className={language === option ? "active" : ""}
                      type="button"
                      onClick={() => chooseLanguage(option)}
                    >
                      {languageLabels[option]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="mobile-theme-action"
                type="button"
                onClick={toggleTheme}
              >
                <span>{theme === "dark" ? "☀" : "◐"}</span>
                <strong>{t("theme")}</strong>
              </button>
            </div>
          )}
        </div>
      </div>
      <nav className="mobile-nav" aria-label={a11y.mobileNavigation}>
        {navigation.map(([label, href]) => (
          <Link key={label} href={href}>{label}</Link>
        ))}
      </nav>
    </header>
  );
}
