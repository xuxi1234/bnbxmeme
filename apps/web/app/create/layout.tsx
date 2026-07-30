import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("/create");

export default function CreateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
