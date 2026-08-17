import "server-only";

import { createPublicClient, getAddress, http } from "viem";
import { bscTestnet } from "viem/chains";
import {
  createFuturesReadModel,
  type FuturesReadClient,
} from "@/lib/futures-read-model-core";

function address(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("futures read model is unavailable");
  return getAddress(value);
}

export function futuresReadModel() {
  const rpcUrl = process.env.FUTURES_RPC_URL;
  if (!rpcUrl || Number(process.env.FUTURES_CHAIN_ID) !== 97)
    throw new Error("futures read model is unavailable");
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:") throw new Error("futures read model is unavailable");
  return createFuturesReadModel({
    client: createPublicClient({
      chain: bscTestnet,
      transport: http(url.toString(), { timeout: 5_000, retryCount: 0 }),
    }) as unknown as FuturesReadClient,
    oracle: address("FUTURES_ORACLE"),
    orderBook: address("FUTURES_ORDER_BOOK"),
    clearingHouse: address("FUTURES_CLEARING_HOUSE"),
  });
}
