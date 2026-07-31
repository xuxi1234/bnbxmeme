import {
  renderTokenShareImage,
  TOKEN_SHARE_IMAGE_SIZE,
} from "@/lib/token-share-image-server";

export const alt = "BNBX token project on BNB Chain";
export const size = TOKEN_SHARE_IMAGE_SIZE;
export const contentType = "image/png";

export default async function TokenOpenGraphImage({
  params,
}: Readonly<{
  params: Promise<{ address: string }>;
}>) {
  const { address } = await params;
  return renderTokenShareImage(address);
}
