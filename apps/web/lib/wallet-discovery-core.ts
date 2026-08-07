export type DiscoverableConnector = {
  id: string;
  name: string;
  type?: string;
  getProvider: () => Promise<unknown>;
};

export async function discoverWeb3Connectors<T extends DiscoverableConnector>(
  connectors: readonly T[],
): Promise<T[]> {
  const discovered: Array<{ connector: T; provider: unknown }> = [];

  for (const connector of connectors) {
    if (connector.type && connector.type !== "injected") continue;
    try {
      const provider = await connector.getProvider();
      if (provider) discovered.push({ connector, provider });
    } catch {
      // A connector can be advertised before its extension or in-app provider is ready.
    }
  }

  const namedProviders = new Set(
    discovered
      .filter(({ connector }) => connector.id !== "injected" && connector.name.toLowerCase() !== "injected")
      .map(({ provider }) => provider),
  );
  const seenProviders = new Set<unknown>();

  return discovered
    .filter(({ connector, provider }) => {
      const generic = connector.id === "injected" || connector.name.toLowerCase() === "injected";
      if (generic && namedProviders.has(provider)) return false;
      if (seenProviders.has(provider)) return false;
      seenProviders.add(provider);
      return true;
    })
    .map(({ connector }) => connector);
}

export function chooseWeb3WalletAction(connectors: readonly unknown[]) {
  if (connectors.length === 0) return "guide" as const;
  if (connectors.length === 1) return "connect" as const;
  return "select" as const;
}
