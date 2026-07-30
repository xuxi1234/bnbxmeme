import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("/roadmap");

export default function RoadmapLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
