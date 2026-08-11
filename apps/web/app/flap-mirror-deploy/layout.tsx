import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flap 镜像部署预览 | BNBX",
  description: "BNBX 管理员专用 Flap.sh 最新外盘社区镜像部署预览入口。",
  robots: { index: false, follow: false },
};

export default function FlapMirrorDeployLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
