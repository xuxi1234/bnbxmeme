import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/deploy-mainnet",
        "/deploy-lp-rewards-mainnet",
        "/deploy-testnet",
        "/four-mirror-deploy",
        "/flap-mirror-deploy",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
