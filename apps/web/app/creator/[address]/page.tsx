import { notFound, permanentRedirect } from "next/navigation";
import { validateCreatorProject } from "@/lib/creator-project-server";
import {
  creatorProjectPath,
  isCanonicalProjectAddress,
} from "@/lib/project-paths";
import { buildCreatorStructuredData, serializeJsonLd } from "@/lib/seo";
import { CreatorProfilePage } from "./creator-profile-page";

export default async function CreatorPage({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>) {
  const { address } = await params;
  const creator = await validateCreatorProject(address);

  if (creator.status === "not_found") {
    notFound();
  }
  if (!isCanonicalProjectAddress(address, creator.address)) {
    permanentRedirect(creatorProjectPath(creator.address));
  }

  const structuredData = buildCreatorStructuredData(creator.address);

  return (
    <>
      {structuredData ? (
        <script
          id="creator-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(structuredData),
          }}
        />
      ) : null}
      <CreatorProfilePage address={creator.address} />
    </>
  );
}
