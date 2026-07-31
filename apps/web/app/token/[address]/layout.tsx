import type { Metadata } from "next";
import { isAddress } from "viem";
import { buildPageMetadata, buildTokenPageMetadata } from "@/lib/seo";
import { readTokenIdentity } from "@/lib/token-identity-server";
import { validateTokenProject } from "@/lib/token-project-server";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) {
    return { robots: { index: false, follow: false } };
  }
  const path = `/token/${address.toLowerCase()}`;
  const project = await validateTokenProject(address);
  if (project.status === "not_found") {
    return {
      ...buildPageMetadata(path),
      robots: { index: false, follow: false },
    };
  }
  if (project.status === "unavailable") {
    return buildPageMetadata(path);
  }

  const identity = await readTokenIdentity(project.token);
  return buildTokenPageMetadata(path, identity?.name, identity?.symbol);
}

export default function TokenProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
