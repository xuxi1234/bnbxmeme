"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button className="button secondary" type="button" onClick={() => disconnect()}>
        {shortAddress(address)}
      </button>
    );
  }

  return (
    <button
      className="button"
      type="button"
      disabled={isPending || connectors.length === 0}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      {isPending ? "连接中…" : "连接钱包"}
    </button>
  );
}
