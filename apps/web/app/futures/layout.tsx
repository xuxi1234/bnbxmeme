import type { Metadata } from "next";
import "./futures.css";

export const metadata: Metadata = {
  title: "BNBX Futures — BSC Testnet",
  description: "BNBX perpetual Futures acceptance console for BSC Testnet.",
  robots: { index: false, follow: false },
};

export default function FuturesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
