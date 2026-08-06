import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DeployLPRewardsMainnetLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
