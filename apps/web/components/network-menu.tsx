"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./language-provider";

const networks = [
  { name: "BNB Chain", short: "BNB", mark: "B", color: "#f3ba2f", active: true },
  { name: "Ethereum", short: "ETH", mark: "◆", color: "#627eea" },
  { name: "Base", short: "BASE", mark: "B", color: "#0052ff" },
  { name: "Arbitrum", short: "ARB", mark: "A", color: "#28a0f0" },
  { name: "Optimism", short: "OP", mark: "O", color: "#ff0420" },
  { name: "Solana", short: "SOL", mark: "S", color: "#14f195" },
  { name: "Polygon", short: "POL", mark: "P", color: "#8247e5" },
  { name: "Avalanche", short: "AVAX", mark: "A", color: "#e84142" },
  { name: "Monad", short: "MON", mark: "M", color: "#836ef9" },
  { name: "Sui", short: "SUI", mark: "S", color: "#6fbcf0" },
  { name: "TON", short: "TON", mark: "T", color: "#0098ea" },
  { name: "X Layer", short: "XL", mark: "X", color: "#ffffff" },
  { name: "Linea", short: "LINEA", mark: "L", color: "#61dfff" },
] as const;

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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="network-logo">B</span>
        <span>BSC</span>
        <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="network-popover" role="menu" aria-label={t("chooseNetwork")}>
          <div className="network-popover-heading">
            <strong>{t("chooseNetwork")}</strong>
            <span>{t("networkRoadmap")}</span>
          </div>
          <div className="network-list">
            {networks.map((network) => {
              const isActive = network.name === "BNB Chain";
              return (
                <button
                  key={network.name}
                  className={isActive ? "active" : ""}
                  type="button"
                  role="menuitem"
                  disabled={!isActive}
                >
                  <span className="network-option-logo" style={{ background: network.color, color: network.name === "X Layer" ? "#050505" : "#071007" }}>
                    {network.mark}
                  </span>
                  <span>
                    <strong>{network.name}</strong>
                    <small>{network.short}</small>
                  </span>
                  {isActive ? (
                    <em>{t("currentNetwork")} ✓</em>
                  ) : (
                    <em>{t("comingSoon")}</em>
                  )}
                </button>
              );
            })}
          </div>
          <p>{t("networkSoonHelp")}</p>
        </div>
      )}
    </div>
  );
}
