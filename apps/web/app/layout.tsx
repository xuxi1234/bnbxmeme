import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./product-polish.css";
import "./bnbx-ai.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar } from "@/components/announcement-bar";
import { LanguageMetadata } from "@/components/language-metadata";
import { buildSiteMetadata } from "@/lib/seo";
import { BnbxAiAssistant } from "@/components/bnbx-ai-assistant";

export const metadata: Metadata = buildSiteMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <LanguageProvider>
            <LanguageMetadata />
            <SiteHeader />
            <AnnouncementBar />
            {children}
            <SiteFooter />
            <BnbxAiAssistant />
            <Analytics />
            <SpeedInsights />
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
