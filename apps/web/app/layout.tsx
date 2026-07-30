import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product-polish.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar } from "@/components/announcement-bar";
import { LanguageMetadata } from "@/components/language-metadata";
import { buildSiteMetadata } from "@/lib/seo";

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
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
