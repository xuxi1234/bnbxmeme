import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function text(form: FormData, key: string, maxLength: number) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeQQUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{5,12}$/.test(trimmed)) {
    const params = new URLSearchParams({
      src_type: "internal",
      version: "1",
      uin: trimmed,
      card_type: "group",
      source: "external",
    });
    return `mqqapi://card/show_pslcard?${params.toString()}`;
  }

  if (trimmed.startsWith("mqqapi://card/show_pslcard?")) {
    try {
      const url = new URL(trimmed);
      const groupNumber = url.searchParams.get("uin") ?? "";
      return /^\d{5,12}$/.test(groupNumber) ? url.toString() : "";
    } catch {
      return "";
    }
  }

  return safeUrl(trimmed);
}

async function pinImage(image: File, jwt: string) {
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
    throw new Error("图片仅支持 JPG、PNG、WebP 或 GIF");
  }
  if (image.size > MAX_IMAGE_BYTES) {
    throw new Error("图片不能超过 2MB");
  }

  const upload = new FormData();
  upload.set("network", "public");
  upload.set("name", `bnbx-${Date.now()}-${image.name.slice(0, 80)}`);
  upload.set("file", image);

  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: upload,
  });
  if (!response.ok) throw new Error("代币图片上传失败");

  const result = (await response.json()) as { data?: { cid?: string } };
  if (!result.data?.cid) throw new Error("图片上传未返回 IPFS CID");
  return `ipfs://${result.data.cid}`;
}

export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { error: "IPFS 上传服务尚未配置" },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const name = text(form, "name", 40);
    const symbol = text(form, "symbol", 10).toUpperCase();
    const description = text(form, "description", 500);
    const image = form.get("image");

    if (!name || !symbol) {
      return NextResponse.json({ error: "代币名称和符号不能为空" }, { status: 400 });
    }

    let imageURI = "";
    if (image instanceof File && image.size > 0) {
      imageURI = await pinImage(image, jwt);
    }

    const metadata = {
      name,
      symbol,
      description,
      image: imageURI,
      website: safeUrl(text(form, "website", 200)),
      telegram: safeUrl(text(form, "telegram", 200)),
      twitter: safeUrl(text(form, "twitter", 200)),
      debox: safeUrl(text(form, "debox", 200)),
      qq: safeQQUrl(text(form, "qq", 200)),
      createdBy: "BNBX",
      chainId: 97,
    };

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: { name: `bnbx-${symbol}-metadata.json` },
        pinataContent: metadata,
      }),
    });
    if (!response.ok) throw new Error("代币资料上传失败");

    const result = (await response.json()) as { IpfsHash?: string };
    if (!result.IpfsHash) throw new Error("资料上传未返回 IPFS CID");

    return NextResponse.json({
      metadataURI: `ipfs://${result.IpfsHash}`,
      metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
