"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LIVE_NETWORK } from "@/lib/network-roadmap";
import { useLanguage } from "./language-provider";

export function NetworkMenu() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="network-menu" ref={menu}>
      <button
        className="network-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="network-logo">{LIVE_NETWORK.mark}</span>
        <span>{LIVE_NETWORK.short}</span>
        <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div
          className="network-popover"
          role="dialog"
          aria-label={t("chooseNetwork")}
        >
          <div className="network-popover-heading">
            <strong>{t("currentNetwork")}</strong>
            <span>{t("networkRoadmap")}</span>
          </div>
          <div className="network-list">
            <div className="network-current">
              <span
                className="network-option-logo"
                style={{ background: LIVE_NETWORK.color }}
              >
                {LIVE_NETWORK.mark}
              </span>
              <span>
                <strong>{LIVE_NETWORK.name}</strong>
                <small>{LIVE_NETWORK.short}</small>
              </span>
              <em>{t("currentNetwork")} ✓</em>
            </div>
          </div>
          <p>{t("networkSoonHelp")}</p>
          <Link
            className="network-roadmap-link"
            href="/roadmap"
            onClick={() => setOpen(false)}
          >
            {t("networkRoadmap")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
