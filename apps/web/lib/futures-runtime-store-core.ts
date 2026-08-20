import { getAddress, type Address, type Hex } from "viem";
import type {
  CanonicalFill,
  FuturesRuntimeRpc,
  RuntimeStore,
} from "./futures-runtime-types.ts";

const MAX_STATE_BYTES = 2_097_152;
const DEPLOYMENT = /^97:0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const UINT = /^(?:0|[1-9][0-9]{0,77})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = (message = "invalid runtime store response"): never => {
  throw new Error(message);
};

const deployment = (value: string) => {
  if (!DEPLOYMENT.test(value)) fail("invalid deployment key");
  return value;
};

const integer = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail();
  return value as number;
};

const address = (value: unknown) => {
  if (typeof value !== "string") fail();
  const normalized = value as string;
  if (normalized !== normalized.toLowerCase()) fail();
  try {
    return getAddress(normalized) as Address;
  } catch {
    return fail();
  }
};

const hash = (value: unknown) => {
  if (typeof value !== "string" || !HASH.test(value)) fail();
  return value as Hex;
};

const decimal = (value: unknown) => {
  if (typeof value !== "string" || !UINT.test(value) || BigInt(value) < 1n)
    fail();
  return value as string;
};

const booleanResponse = (value: unknown): boolean => {
  if (typeof value !== "boolean") fail();
  return value as boolean;
};

const objectState = (serialized: string) => {
  if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES)
    fail("matching state is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return fail("invalid matching state JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail("invalid matching state JSON");
  return parsed as Record<string, unknown>;
};

const canonicalFill = (row: unknown): CanonicalFill => {
  if (!row || typeof row !== "object" || Array.isArray(row)) fail();
  const value = row as Record<string, unknown>;
  if (value.chain_id !== 97) fail();
  return {
    chainId: 97,
    orderBook: address(value.order_book),
    txHash: hash(value.tx_hash),
    logIndex: integer(value.log_index),
    blockNumber: integer(value.block_number),
    blockHash: hash(value.block_hash),
    makerOrderId: hash(value.maker_order_id),
    takerOrderId: hash(value.taker_order_id),
    makerWallet: address(value.maker_wallet),
    takerWallet: address(value.taker_wallet),
    quantity: decimal(value.quantity),
    price: decimal(value.price),
  };
};

export function createFuturesRuntimeStore(
  rpc: FuturesRuntimeRpc,
): RuntimeStore {
  return {
    async load(deploymentKey) {
      const response = await rpc("futures_matching_state_load", {
        p_deployment_key: deployment(deploymentKey),
      });
      if (!Array.isArray(response) || response.length > 1) fail();
      const rows = response as unknown[];
      if (rows.length === 0) return null;
      const row = rows[0];
      if (!row || typeof row !== "object" || Array.isArray(row)) fail();
      const value = row as Record<string, unknown>;
      const revision = integer(value.revision);
      if (
        !value.serialized ||
        typeof value.serialized !== "object" ||
        Array.isArray(value.serialized)
      )
        fail();
      const serialized = JSON.stringify(value.serialized);
      objectState(serialized);
      return { revision, serialized };
    },

    async compareAndSwap(
      deploymentKey,
      expectedRevision,
      nextRevision,
      serialized,
    ) {
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < -1 ||
        !Number.isSafeInteger(nextRevision) ||
        nextRevision !== expectedRevision + 1
      )
        fail("matching revisions must be adjacent");
      return booleanResponse(
        await rpc("futures_matching_state_cas", {
          p_deployment_key: deployment(deploymentKey),
          p_expected_revision: expectedRevision,
          p_next_revision: nextRevision,
          p_serialized: objectState(serialized),
        }),
      );
    },

    async acquireLease(deploymentKey, owner, ttlSeconds) {
      if (
        !UUID.test(owner) ||
        !Number.isSafeInteger(ttlSeconds) ||
        ttlSeconds < 1 ||
        ttlSeconds > 60
      )
        fail("invalid effect lease");
      return booleanResponse(
        await rpc("futures_effect_lease_acquire", {
          p_deployment_key: deployment(deploymentKey),
          p_lease_owner: owner,
          p_lease_seconds: ttlSeconds,
        }),
      );
    },

    async releaseLease(deploymentKey, owner) {
      if (!UUID.test(owner)) fail("invalid effect lease");
      booleanResponse(
        await rpc("futures_effect_lease_release", {
          p_deployment_key: deployment(deploymentKey),
          p_lease_owner: owner,
        }),
      );
    },

    async upsertFill(fill) {
      if (fill.chainId !== 97) fail("invalid canonical fill");
      const response = await rpc("futures_fill_upsert", {
        p_chain_id: 97,
        p_order_book: getAddress(fill.orderBook).toLowerCase(),
        p_tx_hash: hash(fill.txHash).toLowerCase(),
        p_log_index: integer(fill.logIndex),
        p_block_number: integer(fill.blockNumber),
        p_block_hash: hash(fill.blockHash).toLowerCase(),
        p_maker_order_id: hash(fill.makerOrderId).toLowerCase(),
        p_taker_order_id: hash(fill.takerOrderId).toLowerCase(),
        p_maker_wallet: getAddress(fill.makerWallet).toLowerCase(),
        p_taker_wallet: getAddress(fill.takerWallet).toLowerCase(),
        p_quantity: decimal(fill.quantity),
        p_price: decimal(fill.price),
      });
      if (!booleanResponse(response)) fail("canonical fill was rejected");
    },

    async listFills(wallet, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        fail("invalid fill limit");
      const response = await rpc("futures_fill_list", {
        p_wallet: getAddress(wallet).toLowerCase(),
        p_limit: limit,
      });
      if (!Array.isArray(response) || response.length > limit) fail();
      return (response as unknown[]).map(canonicalFill);
    },
  };
}
