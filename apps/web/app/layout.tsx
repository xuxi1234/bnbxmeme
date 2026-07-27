import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product-polish.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { LanguageProvider } from "@/components/language-provider";
import { SiteFooter } from "@/components/site-footer";
import { AnnouncementBar } from "@/components/announcement-bar";

export const metadata: Metadata = {
  title: "BNBX — Build Next Bull System",
  description:
    "BNB Chain 0% 代币税公平发射平台。固定 10 亿供应、联合曲线交易、自动迁移 PancakeSwap V2。",
};

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
