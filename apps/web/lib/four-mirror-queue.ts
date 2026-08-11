export type MirrorQueueResult<T, R> =
  | { item: T; status: "success"; value: R }
  | { item: T; status: "failed" | "cancelled"; error: unknown };

export function isWalletRejection(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (current && typeof current === "object") {
      const candidate = current as {
        code?: unknown;
        name?: unknown;
        message?: unknown;
        shortMessage?: unknown;
        cause?: unknown;
      };
      if (candidate.code === 4001 || candidate.name === "UserRejectedRequestError") {
        return true;
      }
      const text = `${String(candidate.message ?? "")} ${String(candidate.shortMessage ?? "")}`;
      if (/User rejected|User denied|rejected the request/i.test(text)) return true;
      current = candidate.cause;
      continue;
    }
    return /User rejected|User denied|rejected the request/i.test(String(current));
  }
  return false;
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
