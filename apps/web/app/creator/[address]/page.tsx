import { notFound } from "next/navigation";
import { validateCreatorProject } from "@/lib/creator-project-server";
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

  return <CreatorProfilePage address={creator.address} />;
}
