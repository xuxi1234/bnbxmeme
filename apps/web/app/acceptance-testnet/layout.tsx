import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BNBX V4 Testnet Acceptance",
  robots: { index: false, follow: false },
};

export default function AcceptanceTestnetLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
