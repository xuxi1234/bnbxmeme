import type { Metadata } from "next";
import { isAddress } from "viem";
import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) {
    return { robots: { index: false, follow: false } };
  }
  return buildPageMetadata(`/creator/${address.toLowerCase()}`);
}

export default function CreatorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
