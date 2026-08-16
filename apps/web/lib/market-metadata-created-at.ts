const PUBLIC_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs",
  "https://ipfs.io/ipfs",
];

export function metadataGatewayCandidates(uri: string, configuredGateway?: string) {
  if (!uri.startsWith("ipfs://")) return [];
  const path = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) {
    return [];
  }
  return [
    ...(configuredGateway ? [configuredGateway.replace(/\/+$/, "")] : []),
    ...PUBLIC_GATEWAYS,
  ].map((gateway) => `${gateway}/${path}`);
}

export function parseMetadataCreatedAt(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const createdAt = (value as Record<string, unknown>).createdAt;
  if (typeof createdAt !== "string") return null;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function readMetadataCreatedAt(uri: string | null) {
  if (!uri) return null;
  for (const candidate of metadataGatewayCandidates(uri, process.env.IPFS_GATEWAY)) {
    try {
      const response = await fetch(candidate, {
        signal: AbortSignal.timeout(5_000),
        next: { revalidate: 86_400 },
      });
      if (!response.ok) continue;
      const timestamp = parseMetadataCreatedAt(await response.json());
      if (timestamp !== null) return timestamp;
    } catch {
      // Try the next gateway. Missing metadata time must not hide the token.
    }
  }
  return null;
}
