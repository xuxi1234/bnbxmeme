import type { MarketFilter } from "./market-ranking-core";

type FeaturedEntry = {
  token: string;
  name?: string | null;
  symbol?: string | null;
};

export function pinFeaturedExternalEntry<T extends FeaturedEntry>(
  filter: MarketFilter,
  query: string,
  entries: T[],
  featuredEntry: T,
) {
  if (filter !== "newExternal" && filter !== "hotExternal") return entries;

  const normalizedQuery = query.trim().toLowerCase();
  const matchesSearch =
    !normalizedQuery ||
    featuredEntry.token.toLowerCase().includes(normalizedQuery) ||
    featuredEntry.name?.toLowerCase().includes(normalizedQuery) ||
    featuredEntry.symbol?.toLowerCase().includes(normalizedQuery);
  if (!matchesSearch) return entries;

  const featuredToken = featuredEntry.token.toLowerCase();
  return [
    featuredEntry,
    ...entries.filter((entry) => entry.token.toLowerCase() !== featuredToken),
  ];
}
