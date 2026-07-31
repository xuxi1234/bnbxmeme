import type { Metadata } from "next";
import { isAddress } from "viem";
import { buildCreatorPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) {
    return { robots: { index: false, follow: false } };
  }
  const normalizedAddress = address.toLowerCase();
  return buildCreatorPageMetadata(
    `/creator/${normalizedAddress}`,
    normalizedAddress,
  );
}

export default function CreatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
