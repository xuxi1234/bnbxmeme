import type { Metadata } from "next";
import { validateCreatorProject } from "@/lib/creator-project-server";
import { buildCreatorPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>): Promise<Metadata> {
  const { address } = await params;
  const creator = await validateCreatorProject(address);
  if (creator.status !== "valid") {
    return { robots: { index: false, follow: false } };
  }
  const normalizedAddress = creator.address.toLowerCase();
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
