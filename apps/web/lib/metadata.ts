"use client";

import { useEffect, useState } from "react";
import { sanitizeMetadataCommunityLinks } from "@/lib/metadata-links";
import { normalizeFourMirrorMetadata } from "@/lib/four-mirror-metadata";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  telegram?: string;
  twitter?: string;
  debox?: string;
  qqGroupNumber?: string;
  createdAt?: string;
  mirrorDisclosure?: string;
  sourcePlatform?: string;
  sourceContract?: string;
  sourceUrl?: string;
};

export function resolveContentURI(uri?: string) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `/api/ipfs/${path.split("/").map(encodeURIComponent).join("/")}`;
  }
  try {
    const url = new URL(uri);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeQQGroupNumber(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 30) : undefined;
}

function sanitizeMetadata(value: unknown): TokenMetadata | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const properties =
    source.properties && typeof source.properties === "object"
      ? (source.properties as Record<string, unknown>)
      : {};
  const descriptionSource =
    typeof source.description === "string"
      ? source.description
      : typeof properties.description === "string"
        ? properties.description
        : undefined;
  const communityLinks = sanitizeMetadataCommunityLinks(source);
  const mirrorMetadata = normalizeFourMirrorMetadata({
    ...source,
    description: descriptionSource,
  });
  return {
    name: typeof source.name === "string" ? source.name.slice(0, 40) : undefined,
    symbol:
      typeof source.symbol === "string" ? source.symbol.slice(0, 10) : undefined,
    ...mirrorMetadata,
    image:
      typeof source.image === "string"
        ? resolveContentURI(source.image)
        : undefined,
    ...communityLinks,
    qqGroupNumber: safeQQGroupNumber(source.qqGroupNumber),
    createdAt:
      typeof source.createdAt === "string" &&
      Number.isFinite(Date.parse(source.createdAt))
        ? new Date(source.createdAt).toISOString()
        : undefined,
  };
}

export function useTokenMetadata(uri?: string) {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const url = resolveContentURI(uri);
    if (!url) {
      setMetadata(null);
      setIsLoading(false);
      setLoadError(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(false);
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("metadata fetch failed");
        return response.json();
      })
      .then((data) => setMetadata(sanitizeMetadata(data)))
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey, uri]);

  return {
    metadata,
    isLoading,
    loadError,
    retry: () => setReloadKey((value) => value + 1),
  };
}
