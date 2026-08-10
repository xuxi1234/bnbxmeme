import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Four 镜像部署预览 | BNBX",
  description: "BNBX 管理员专用 Four.meme 社区镜像部署预览入口。",
  robots: { index: false, follow: false },
};

export default function FourMirrorDeployLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
