export type MirrorQueueResult<T, R> =
  | { item: T; status: "success"; value: R }
  | { item: T; status: "failed" | "cancelled"; error: unknown };

export function isWalletRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /User rejected|User denied|rejected the request/i.test(message);
}

export function selectedMirrorFeeBNB(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid selected count");
  }
  return (count / 1_000).toFixed(3);
}

export async function runSequentialMirrorQueue<T, R>(
  items: readonly T[],
  deployOne: (item: T, index: number) => Promise<R>,
  { shouldStop = () => false }: { shouldStop?: (error: unknown) => boolean } = {},
) {
  const results: MirrorQueueResult<T, R>[] = [];
  for (const [index, item] of items.entries()) {
    try {
      const value = await deployOne(item, index);
      results.push({ item, status: "success", value });
    } catch (error) {
      const stop = shouldStop(error);
      results.push({ item, status: stop ? "cancelled" : "failed", error });
      if (stop) break;
    }
  }
  return results;
}
