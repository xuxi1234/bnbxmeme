import "server-only";

import { getAddress } from "viem";
import { futuresReadModel } from "@/lib/futures-read-model";
import { futuresRelayer } from "@/lib/futures-relayer";
import { createFuturesRuntime } from "@/lib/futures-runtime-core";
import { futuresRuntimeStore } from "@/lib/futures-runtime-store";

let runtime: ReturnType<typeof createFuturesRuntime> | undefined;

export function futuresRuntime() {
  if (runtime) return runtime;
  const orderBook = process.env.FUTURES_ORDER_BOOK;
  const confirmations = Number(
    process.env.FUTURES_REQUIRED_CONFIRMATIONS ?? "2",
  );
  if (
    Number(process.env.FUTURES_CHAIN_ID) !== 97 ||
    !orderBook ||
    !Number.isSafeInteger(confirmations) ||
    confirmations < 1 ||
    confirmations > 20
  )
    throw new Error("futures runtime is unavailable");
  runtime = createFuturesRuntime({
    config: {
      chainId: 97,
      verifyingContract: getAddress(orderBook),
      domainName: "BNBX Futures",
      domainVersion: "1",
    },
    store: futuresRuntimeStore,
    relayer: futuresRelayer(),
    reads: futuresReadModel(),
    requiredConfirmations: confirmations,
  });
  return runtime;
}

export async function dispatchFuturesRuntime(input: {
  wallet: string;
  resource: string;
  method: "GET" | "POST" | "DELETE";
  input: Record<string, unknown>;
}) {
  return futuresRuntime().dispatch(input);
}
