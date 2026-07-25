"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { queryClient, wagmiConfig } from "@/lib/web3";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
