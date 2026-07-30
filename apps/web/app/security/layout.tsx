import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("/security");

export default function SecurityLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
