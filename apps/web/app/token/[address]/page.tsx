import { notFound, permanentRedirect } from "next/navigation";
import {
  isCanonicalProjectAddress,
  tokenProjectPath,
} from "@/lib/project-paths";
import { buildTokenStructuredData, serializeJsonLd } from "@/lib/seo";
import { readTokenIdentity } from "@/lib/token-identity-server";
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
  if (project.token && !isCanonicalProjectAddress(address, project.token)) {
    permanentRedirect(tokenProjectPath(project.token));
  }
  if (project.status === "unavailable") {
    return <ProjectState state="unavailable" />;
  }

  const identity = await readTokenIdentity(project.token);
  const structuredData = buildTokenStructuredData(
    project.token,
    identity?.name,
    identity?.symbol,
  );

  return (
    <>
      {structuredData ? (
        <script
          id="token-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(structuredData),
          }}
        />
      ) : null}
      <TokenTradingPage tokenAddress={project.token} />
    </>
  );
}
