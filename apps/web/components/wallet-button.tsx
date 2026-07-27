"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type WalletButtonProps = {
  className?: string;
  connectLabel?: string;
};

export function WalletButton({
  className = "button",
  connectLabel = "连接钱包",
}: WalletButtonProps = {}) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [walletDeepLink, setWalletDeepLink] = useState("");

  useEffect(() => {
    const injectedProvider = Boolean(
      (window as Window & { ethereum?: unknown }).ethereum,
    );
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!injectedProvider && isMobile) {
      const dappPath = `${window.location.host}${window.location.pathname}${window.location.search}`;
      setWalletDeepLink(`https://metamask.app.link/dapp/${dappPath}`);
    }
  }, []);

  if (isConnected && address) {
    return (
      <button className={`${className} secondary`} type="button" onClick={() => disconnect()}>
        {shortAddress(address)}
      </button>
    );
  }

  if (walletDeepLink) {
    return (
      <a className={className} href={walletDeepLink}>
        在钱包中打开
      </a>
    );
  }

  return (
    <button
      className={className}
      type="button"
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      {isPending ? "连接中…" : connectLabel}
    </button>
  );
}
