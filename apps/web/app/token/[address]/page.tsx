import { notFound } from "next/navigation";
import { validateTokenProject } from "@/lib/token-project-server";
import { ProjectState } from "./project-state";
import { TokenTradingPage } from "./token-trading-page";

export const dynamic = "force-dynamic";

export default async function TokenProjectPage({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>) {
  const { address } = await params;
  const project = await validateTokenProject(address);

  if (project.status === "not_found") {
    notFound();
  }
  if (project.status === "unavailable") {
    return <ProjectState state="unavailable" />;
  }

  return <TokenTradingPage tokenAddress={project.token} />;
}
