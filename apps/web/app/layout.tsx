import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "BNBX — Build Next Bull System",
  description:
    "BNB Chain 0% 代币税公平发射平台。固定 10 亿供应、联合曲线交易、自动迁移 PancakeSwap V2。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <SiteHeader />
          {children}
          <footer className="site-footer">
            <div>
              <strong>BNBX</strong>
              <span>Build Next Bull System</span>
            </div>
            <p>
              数字资产具有高度风险。平台不保证任何代币的价值或盈利能力，请独立研究并谨慎交易。
            </p>
            <small>© 2026 BNBX</small>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
