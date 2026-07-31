import type { MetadataRoute } from "next";
import { readOfficialCreatorAddresses } from "@/lib/creator-project-server";
import { readOfficialTokenCatalog } from "@/lib/official-token-catalog-server";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 300;
const MAX_SITEMAP_URLS = 50_000;

const publicPages = [
  { path: "", changeFrequency: "hourly", priority: 1 },
  { path: "/create", changeFrequency: "monthly", priority: 0.8 },
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/roadmap", changeFrequency: "monthly", priority: 0.6 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tokens, creators] = await Promise.all([
    readOfficialTokenCatalog(),
    readOfficialCreatorAddresses(),
  ]);
  const creatorLimit = Math.max(
    0,
    MAX_SITEMAP_URLS - publicPages.length - tokens.length,
  );

  return [
    ...publicPages.map(({ path, changeFrequency, priority }) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency,
      priority,
    })),
    ...tokens.map((token) => ({
      url: `${SITE_URL}/token/${token}`,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    ...creators.slice(0, creatorLimit).map((creator) => ({
      url: `${SITE_URL}/creator/${creator}`,
      changeFrequency: "hourly" as const,
      priority: 0.5,
    })),
  ];
}
