"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { blockExplorerUrl } from "@/lib/web3";
import { useLanguage } from "./language-provider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type WalletButtonProps = {
  className?: string;
  connectLabel?: string;
};

const walletOptions = [
  { name: "MetaMask", mark: "M", color: "#f6851b", match: ["metamask"], install: "https://metamask.io/download/" },
  { name: "Binance Wallet", mark: "B", color: "#f3ba2f", match: ["binance"], install: "https://www.binance.com/en/web3wallet" },
  { name: "OKX Wallet", mark: "O", color: "#ffffff", match: ["okx"], install: "https://www.okx.com/web3" },
  { name: "TokenPocket", mark: "T", color: "#2980fe", match: ["tokenpocket", "token pocket"], install: "https://www.tokenpocket.pro/" },
  { name: "Bitget Wallet", mark: "B", color: "#00f0ff", match: ["bitget"], install: "https://web3.bitget.com/" },
  { name: "Bybit Wallet", mark: "Y", color: "#f7a600", match: ["bybit"], install: "https://www.bybit.com/web3" },
  { name: "Gate Wallet", mark: "G", color: "#17e6a1", match: ["gate"], install: "https://www.gate.com/web3" },
] as const;

export function WalletButton({
  className = "button",
  connectLabel,
}: WalletButtonProps = {}) {
  const { t } = useLanguage();
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function findConnector(match: readonly string[]) {
    return connectors.find((connector) => {
      const identity = `${connector.id} ${connector.name}`.toLowerCase();
      return match.some((keyword) => identity.includes(keyword));
    });
  }

  function chooseWallet(option: (typeof walletOptions)[number]) {
    const connector = findConnector(option.match);
    if (connector) {
      connect({ connector });
      setMenuOpen(false);
      return;
    }
    window.open(option.install, "_blank", "noopener,noreferrer");
  }

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <div className="wallet-menu" ref={menu}>
      <button
        className={`${className}${isConnected ? " secondary" : ""}`}
        type="button"
        disabled={isPending}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {isPending
          ? t("connectingWallet")
          : isConnected && address
            ? shortAddress(address)
            : (connectLabel ?? t("connectWallet"))}
        <span className="wallet-chevron" aria-hidden="true">⌄</span>
      </button>

      {menuOpen && (
        <div className="wallet-popover" role="dialog" aria-label={isConnected ? t("walletAccount") : t("chooseWallet")}>
          {isConnected && address ? (
            <>
              <div className="wallet-account-card">
                <span className="wallet-avatar" aria-hidden="true">{address.slice(2, 4).toUpperCase()}</span>
                <div>
                  <small>{t("walletAccount")}</small>
                  <strong>{shortAddress(address)}</strong>
                  <span>BNB Chain</span>
                </div>
              </div>
              <button className="wallet-action" type="button" onClick={copyAddress}>
                <span aria-hidden="true">⧉</span>
                <strong>{copied ? t("copied") : t("copyAddress")}</strong>
              </button>
              <a className="wallet-action" href={`${blockExplorerUrl}/address/${address}`} target="_blank" rel="noreferrer">
                <span aria-hidden="true">↗</span>
                <strong>{t("viewExplorer")}</strong>
              </a>
              <button className="wallet-action wallet-disconnect" type="button" onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}>
                <span aria-hidden="true">↪</span>
                <strong>{t("disconnectWallet")}</strong>
              </button>
            </>
          ) : (
            <>
              <div className="wallet-popover-heading">
                <div>
                  <strong>{t("chooseWallet")}</strong>
                  <span>{t("walletConnectHelp")}</span>
                </div>
                <button type="button" aria-label={t("close")} onClick={() => setMenuOpen(false)}>×</button>
              </div>
              <div className="wallet-options">
                {walletOptions.map((option) => {
                  const installed = Boolean(findConnector(option.match));
                  return (
                    <button key={option.name} type="button" onClick={() => chooseWallet(option)}>
                      <span className="wallet-option-mark" style={{ background: option.color, color: option.name === "OKX Wallet" ? "#050505" : "#081008" }}>
                        {option.mark}
                      </span>
                      <strong>{option.name}</strong>
                      <small>{installed ? t("installed") : t("install")}</small>
                    </button>
                  );
                })}
              </div>
              <p className="wallet-popover-note">{t("walletSafety")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
