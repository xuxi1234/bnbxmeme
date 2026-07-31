import type { MarketFilter } from "./market-ranking-core";

export type MarketNoResultsContext =
  | {
      kind: "search";
      query: string;
      filter: MarketFilter;
      showHotAction: boolean;
    }
  | {
      kind: "filter";
      filter: MarketFilter;
      showHotAction: boolean;
    };

export function resolveMarketNoResults(
  query: string,
  filter: MarketFilter,
): MarketNoResultsContext {
  const normalizedQuery = query.trim();
  const showHotAction = filter !== "hotInternal";

  if (normalizedQuery) {
    return {
      kind: "search",
      query: normalizedQuery,
      filter,
      showHotAction,
    };
  }

  return {
    kind: "filter",
    filter,
    showHotAction,
  };
}
