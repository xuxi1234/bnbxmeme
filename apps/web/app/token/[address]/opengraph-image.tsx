import {
  readTokenShareImageAlt,
  renderTokenShareImage,
  TOKEN_SHARE_IMAGE_SIZE,
} from "@/lib/token-share-image-server";

export const size = TOKEN_SHARE_IMAGE_SIZE;
export const contentType = "image/png";

type ImageProps = Readonly<{
  params: Promise<{ address: string }>;
}>;

export async function generateImageMetadata({ params }: ImageProps) {
  const { address } = await params;
  return [
    {
      id: "default",
      alt: await readTokenShareImageAlt(address),
      size,
      contentType,
    },
  ];
}

export default async function TokenOpenGraphImage({ params }: ImageProps) {
  const { address } = await params;
  return renderTokenShareImage(address);
}
