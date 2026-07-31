import { notFound } from "next/navigation";
import { validateCreatorProject } from "@/lib/creator-project-server";
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
