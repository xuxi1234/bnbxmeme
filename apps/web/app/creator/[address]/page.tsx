import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { CreatorProfilePage } from "./creator-profile-page";

export default async function CreatorPage({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>) {
  const { address } = await params;
  if (!isAddress(address)) {
    notFound();
  }

  return <CreatorProfilePage address={address} />;
}
