import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata("/");

export default function Home() {
  return <HomePage />;
}
