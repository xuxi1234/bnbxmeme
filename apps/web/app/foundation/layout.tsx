import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("/foundation");

export default function FoundationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
