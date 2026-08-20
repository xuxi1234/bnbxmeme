import "server-only";

import { createPublicClient, getAddress, http, type Hex } from "viem";
import { bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createFuturesRelayer } from "@/lib/futures-relayer-core";

function configuration() {
  const rawKey = process.env.FUTURES_RELAYER_PRIVATE_KEY;
  const rpcUrl = process.env.FUTURES_RPC_URL;
  const orderBook = process.env.FUTURES_ORDER_BOOK;
  if (
    !rawKey ||
    !/^0x[0-9a-fA-F]{64}$/.test(rawKey) ||
    !rpcUrl ||
    !orderBook ||
    Number(process.env.FUTURES_CHAIN_ID) !== 97
  )
    throw new Error("futures relayer is unavailable");
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:") throw new Error("futures relayer is unavailable");
  return {
    account: privateKeyToAccount(rawKey as Hex),
    orderBook: getAddress(orderBook),
    rpcUrl: url.toString(),
  };
}

export function futuresRelayer() {
  const config = configuration();
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(config.rpcUrl, { timeout: 5_000, retryCount: 0 }),
  });
  return createFuturesRelayer({
    account: config.account,
    orderBook: config.orderBook,
    client,
  });
}
