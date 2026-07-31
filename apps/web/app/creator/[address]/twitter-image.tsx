import {
  CREATOR_SHARE_IMAGE_SIZE,
  readCreatorShareImageAlt,
  renderCreatorShareImage,
} from "@/lib/creator-share-image-server";

export const size = CREATOR_SHARE_IMAGE_SIZE;
export const contentType = "image/png";

type ImageProps = Readonly<{
  params: Promise<{ address: string }>;
}>;

export async function generateImageMetadata({ params }: ImageProps) {
  const { address } = await params;
  return [
    {
      id: "default",
      alt: await readCreatorShareImageAlt(address),
      size,
      contentType,
    },
  ];
}

export default async function CreatorTwitterImage({ params }: ImageProps) {
  const { address } = await params;
  return renderCreatorShareImage(address);
}
