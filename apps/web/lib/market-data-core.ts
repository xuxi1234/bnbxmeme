export type FactoryCount<Factory extends string = string> = {
  factory: Factory;
  count: bigint;
};

export type MarketScoreTarget = {
  token: string;
  curve: string | null;
  state: number | null;
  liquidityPair: string | null;
};

export function buildMarketScoreRefreshKey(entries: MarketScoreTarget[]) {
  return entries
    .map(({ token, curve, state, liquidityPair }) => {
      const graduatedPair =
        state === 2 ? (liquidityPair?.toLowerCase() ?? "") : "";
      return [
        token.toLowerCase(),
        curve?.toLowerCase() ?? "",
        state ?? "",
        graduatedPair,
      ].join(":");
    })
    .join("|");
}

export function buildFactorySlots<Factory extends string>(
  factories: FactoryCount<Factory>[],
  maxPerFactory?: number,
) {
  if (
    maxPerFactory !== undefined &&
    (!Number.isSafeInteger(maxPerFactory) || maxPerFactory <= 0)
  ) {
    throw new Error("Factory slot limit must be a positive safe integer");
  }
  return factories.flatMap(({ factory, count }, factoryOrder) => {
    if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Factory token count is outside the supported range");
    }
    const total = Number(count);
    const visible =
      maxPerFactory === undefined ? total : Math.min(total, maxPerFactory);
    return Array.from({ length: visible }, (_, position) => ({
      factory,
      factoryOrder,
      index: BigInt(total - position - 1),
      creationIndex: total - position - 1,
    }));
  });
}

export function chunkItems<Item>(items: Item[], size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Chunk size must be a positive safe integer");
  }
  const chunks: Item[][] = [];
  for (let position = 0; position < items.length; position += size) {
    chunks.push(items.slice(position, position + size));
  }
  return chunks;
}
