import type { Address, Hex } from "viem";

export type CanonicalFill = {
  chainId: 97;
  orderBook: Address;
  txHash: Hex;
  logIndex: number;
  blockNumber: number;
  blockHash: Hex;
  makerOrderId: Hex;
  takerOrderId: Hex;
  makerWallet: Address;
  takerWallet: Address;
  quantity: string;
  price: string;
};

export type FuturesRuntimeRpc = (
  name: string,
  body: Record<string, unknown>,
) => Promise<unknown>;

export type RuntimeStore = {
  load(
    deploymentKey: string,
  ): Promise<{ revision: number; serialized: string } | null>;
  compareAndSwap(
    deploymentKey: string,
    expectedRevision: number,
    nextRevision: number,
    serialized: string,
  ): Promise<boolean>;
  acquireLease(
    deploymentKey: string,
    owner: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  releaseLease(deploymentKey: string, owner: string): Promise<void>;
  upsertFill(fill: CanonicalFill): Promise<void>;
  listFills(wallet: Address, limit: number): Promise<CanonicalFill[]>;
};
