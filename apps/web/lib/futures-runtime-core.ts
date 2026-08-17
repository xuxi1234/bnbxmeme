import { getAddress, keccak256, type Address, type Hex } from "viem";
import {
  cancelOrder,
  createMatchingState,
  hydrateMatchingState,
  intakeOrder,
  reconcileSubmission,
  reconcileWalletCancellation,
  recordSubmission,
  serializeMatchingState,
  type MatchingConfig,
  type MatchingState,
  type OrderEnvelope,
} from "./futures-service-core.ts";
import type { RuntimeStore } from "./futures-runtime-types.ts";

type RuntimeRelayer = {
  prepare(effect: MatchEffect): Promise<{
    raw: Hex;
    hash: Hex;
    nonce: number;
    sender: Address;
    submittedAtBlock: number;
  }>;
  broadcast(raw: Hex): Promise<Hex>;
  inspect(hash: Hex, effect: MatchEffect): Promise<Record<string, unknown>>;
};

type RuntimeReads = {
  readMarketStatus(): Promise<Record<string, unknown>>;
  readPositions(wallet: Address, limit: number): Promise<Array<Record<string, unknown>>>;
  readCollateralIntent(
    wallet: Address,
    action: "deposit" | "withdraw",
    amount: string,
  ): Promise<Record<string, unknown>>;
  readOrderCancelled(orderId: Hex): Promise<boolean>;
  readKeeperHealth(lastSuccessfulRun: number | null): Promise<Record<string, unknown>>;
};

type MatchEffect = {
  id: Hex;
  kind: "submit-match";
  status: "prepared" | "submitted" | "included" | "confirmed" | "failed" | "reorged";
  calldata: Hex;
  makerOrderId: Hex;
  takerOrderId: Hex;
  quantity: string;
  price: string;
  txHash?: Hex;
  rawTransaction?: Hex;
  submittedAtBlock?: number;
  transactionNonce?: number;
  transactionSender?: Address;
};

type CancellationEffect = {
  id: Hex;
  kind: "submit-cancellation";
  status: string;
  orderId: Hex;
  trader: Address;
  calldata: Hex;
};

type RuntimeInput = {
  wallet: Address | string;
  resource: string;
  method: "GET" | "POST" | "DELETE";
  input: Record<string, unknown>;
};

function fail(message: string): never {
  throw new Error(message);
}

const effectValues = (state: MatchingState) =>
  Object.values(state.effects) as unknown as Array<MatchEffect | CancellationEffect>;

const asEnvelope = (value: unknown): OrderEnvelope => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("invalid order envelope");
  const envelope = value as Record<string, unknown>;
  const domain = envelope.domain as Record<string, unknown>;
  const order = envelope.order as Record<string, unknown>;
  if (!domain || !order) fail("invalid order envelope");
  return {
    domain: {
      name: `${domain.name}`,
      version: `${domain.version}`,
      chainId: Number(domain.chainId),
      verifyingContract: getAddress(`${domain.verifyingContract}`),
    },
    order: {
      trader: getAddress(`${order.trader}`),
      side: Number(order.side),
      quantity: BigInt(`${order.quantity}`),
      limitPrice: BigInt(`${order.limitPrice}`),
      leverage: Number(order.leverage),
      nonce: BigInt(`${order.nonce}`),
      deadline: BigInt(`${order.deadline}`),
      reduceOnly: order.reduceOnly as boolean,
      role: Number(order.role),
    },
    signature: `${envelope.signature}` as Hex,
  };
};

export function createFuturesRuntime(deps: {
  config: MatchingConfig;
  store: RuntimeStore;
  relayer: RuntimeRelayer;
  reads: RuntimeReads;
  nowSeconds?: () => number;
  nowMillis?: () => number;
  leaseOwner?: () => string;
  requiredConfirmations: number;
}) {
  const config = deps.config;
  const store = deps.store;
  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
  const nowMillis = deps.nowMillis ?? (() => Date.now());
  const leaseOwner = deps.leaseOwner ?? (() => crypto.randomUUID());
  const deploymentKey = `${config.chainId}:${config.verifyingContract.toLowerCase()}`;
  let lastSuccessfulRun: number | null = null;

  const envelope = (data: unknown, status = 200) => ({
    status,
    payload: {
      chainId: 97,
      orderBook: config.verifyingContract,
      data,
      cursor: null,
    },
  });

  async function loadState() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await store.load(deploymentKey);
      if (row) {
        const state = await hydrateMatchingState(row.serialized, config);
        if (state.revision !== row.revision) fail("durable state revision mismatch");
        return state;
      }
      const initial = createMatchingState(config);
      if (
        await store.compareAndSwap(
          deploymentKey,
          -1,
          0,
          serializeMatchingState(initial),
        )
      )
        return initial;
    }
    fail("matching state initialization conflict");
  }

  async function persist(previous: MatchingState, next: MatchingState) {
    if (next.revision === previous.revision) return true;
    if (next.revision !== previous.revision + 1)
      fail("runtime state revisions must be adjacent");
    return store.compareAndSwap(
      deploymentKey,
      previous.revision,
      next.revision,
      serializeMatchingState(next),
    );
  }

  async function mutate<T>(
    operation: (state: MatchingState) => Promise<{ state: MatchingState; value: T }> | { state: MatchingState; value: T },
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = await loadState();
      const result = await operation(state);
      if (result.state.revision === state.revision || (await persist(state, result.state)))
        return result.value;
    }
    fail("matching state compare-and-swap conflict");
  }

  const orderRows = (state: MatchingState, wallet: Address) =>
    Object.values(state.orders)
      .filter(
        (order) =>
          order.envelope.order.trader.toLowerCase() === wallet.toLowerCase(),
      )
      .map((order) => ({
        orderId: order.id,
        status: order.status,
        side: order.envelope.order.side,
        quantity: order.envelope.order.quantity,
        filled: order.filled,
        reserved: order.reserved,
        limitPrice: order.envelope.order.limitPrice,
        leverage: order.envelope.order.leverage,
        deadline: order.envelope.order.deadline,
        reduceOnly: order.envelope.order.reduceOnly,
        role: order.envelope.order.role,
      }));

  async function reconcileOneWalletCancellation(state: MatchingState) {
    const pending = effectValues(state).find(
      (effect): effect is CancellationEffect =>
        effect.kind === "submit-cancellation" && effect.status === "prepared",
    );
    if (!pending) return false;
    if (!(await deps.reads.readOrderCancelled(pending.orderId))) return false;
    const result = reconcileWalletCancellation(state, {
      expectedRevision: state.revision,
      effectId: pending.id,
      cancelledOnChain: true,
    });
    return persist(state, result.state);
  }

  async function reconcileMatch(state: MatchingState, effect: MatchEffect) {
    if (!effect.txHash) return false;
    const observation = await deps.relayer.inspect(effect.txHash, effect);
    if (
      observation.status === "pending" &&
      observation.transactionPresent === false &&
      effect.rawTransaction
    ) {
      await deps.relayer.broadcast(effect.rawTransaction).catch(() => undefined);
      return false;
    }
    const receipt =
      observation.receipt && typeof observation.receipt === "object"
        ? (observation.receipt as {
            status: string;
            transactionHash: Hex;
            blockNumber: number;
            blockHash: Hex;
          })
        : null;
    const reconciled = reconcileSubmission(state, {
      expectedRevision: state.revision,
      effectId: effect.id,
      now: BigInt(nowSeconds()),
      receipt,
      canonicalBlockHash:
        (observation.canonicalBlockHash as Hex | undefined) ?? null,
      headBlock: Number(observation.headBlock ?? 0),
      requiredConfirmations: deps.requiredConfirmations,
      transaction: observation.transaction as
        | { hash: Hex; chainId: number; from: Address; to: Address; input: Hex }
        | undefined,
      event: observation.event as Record<string, unknown> | undefined,
      transactionPresent: observation.transactionPresent as boolean | undefined,
    });
    if (reconciled.state.revision === state.revision) return false;
    if (!(await persist(state, reconciled.state))) return false;
    const reconciledEffect = (
      reconciled.state.effects as unknown as Record<string, MatchEffect>
    )[effect.id];
    if (reconciledEffect.status === "confirmed" && receipt && observation.event) {
      const makerOrder = reconciled.state.orders[effect.makerOrderId];
      const takerOrder = reconciled.state.orders[effect.takerOrderId];
      await store.upsertFill({
        chainId: 97,
        orderBook: config.verifyingContract,
        txHash: effect.txHash,
        logIndex: Number(observation.logIndex ?? 0),
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        makerOrderId: effect.makerOrderId,
        takerOrderId: effect.takerOrderId,
        makerWallet: makerOrder.envelope.order.trader,
        takerWallet: takerOrder.envelope.order.trader,
        quantity: effect.quantity,
        price: effect.price,
      });
    }
    return true;
  }

  async function submitPrepared(state: MatchingState, effect: MatchEffect) {
    const prepared = await deps.relayer.prepare(effect);
    if (prepared.hash.toLowerCase() !== keccak256(prepared.raw).toLowerCase())
      fail("relayer prepared hash mismatch");
    const recorded = recordSubmission(state, {
      expectedRevision: state.revision,
      effectId: effect.id,
      rawTransaction: prepared.raw,
      submittedAtBlock: prepared.submittedAtBlock,
      transactionNonce: prepared.nonce,
      transactionSender: prepared.sender,
    });
    if (!(await persist(state, recorded.state))) return false;
    await deps.relayer.broadcast(prepared.raw).catch(() => undefined);
    return true;
  }

  async function drainOnce() {
    const owner = leaseOwner();
    if (!(await store.acquireLease(deploymentKey, owner, 30))) return false;
    try {
      let state = await loadState();
      if (await reconcileOneWalletCancellation(state)) state = await loadState();
      const pending = effectValues(state).find(
        (effect): effect is MatchEffect =>
          effect.kind === "submit-match" &&
          (effect.status === "submitted" || effect.status === "included"),
      );
      if (pending) {
        await reconcileMatch(state, pending);
        lastSuccessfulRun = Number(await Promise.resolve(pending.submittedAtBlock ?? 0));
        return true;
      }
      const prepared = effectValues(state).find(
        (effect): effect is MatchEffect =>
          effect.kind === "submit-match" && effect.status === "prepared",
      );
      if (prepared) {
        await submitPrepared(state, prepared);
        lastSuccessfulRun = prepared.submittedAtBlock ?? lastSuccessfulRun;
        return true;
      }
      return false;
    } finally {
      await store.releaseLease(deploymentKey, owner).catch(() => undefined);
    }
  }

  async function dispatch(request: RuntimeInput) {
    const wallet = getAddress(request.wallet);
    if (request.resource === "orders" && request.method === "POST") {
      const signed = asEnvelope(request.input.envelope);
      if (signed.order.trader !== wallet) fail("authenticated wallet does not own order");
      const result = await mutate(async (state) => {
        const accepted = await intakeOrder(state, {
          expectedRevision: state.revision,
          idempotencyKey: `${request.input.idempotencyKey}`,
          receivedAt: nowMillis(),
          now: BigInt(nowSeconds()),
          envelope: signed,
        });
        return { state: accepted.state, value: accepted };
      });
      await drainOnce();
      const state = await loadState();
      const hasMatch = effectValues(state).some(
        (effect) => effect.kind === "submit-match",
      );
      return envelope(orderRows(state, wallet), hasMatch ? 202 : result.duplicate ? 200 : 201);
    }
    if (request.resource === "orders" && request.method === "GET") {
      await drainOnce();
      return envelope(orderRows(await loadState(), wallet));
    }
    if (request.resource === "cancellations" && request.method === "DELETE") {
      const orderId = `${request.input.orderId}` as Hex;
      const result = await mutate((state) => {
        const cancelled = cancelOrder(state, {
          expectedRevision: state.revision,
          idempotencyKey: `${request.input.idempotencyKey}`,
          orderId,
          trader: wallet,
        });
        return { state: cancelled.state, value: cancelled };
      });
      if (!result.effect) fail("cancellation effect is unavailable");
      return envelope(
        {
          orderId,
          status: "cancellation-pending",
          to: config.verifyingContract,
          calldata: result.effect.calldata,
          expiresAt: nowSeconds() + 120,
        },
        202,
      );
    }
    if (request.resource === "fills" && request.method === "GET") {
      await drainOnce();
      const fills = await store.listFills(wallet, Number(request.input.limit ?? 100));
      return envelope(
        fills.map((fill) => ({
          txHash: fill.txHash,
          makerOrderId: fill.makerOrderId,
          takerOrderId: fill.takerOrderId,
          quantity: fill.quantity,
          price: fill.price,
          blockNumber: fill.blockNumber,
        })),
      );
    }
    if (request.resource === "market-status" && request.method === "GET")
      return envelope(await deps.reads.readMarketStatus());
    if (request.resource === "positions" && request.method === "GET") {
      await drainOnce();
      return envelope(
        await deps.reads.readPositions(wallet, Math.min(Number(request.input.limit ?? 8), 8)),
      );
    }
    if (request.resource === "collateral-intents" && request.method === "POST") {
      const intent = await deps.reads.readCollateralIntent(
        wallet,
        request.input.action as "deposit" | "withdraw",
        `${request.input.amount}`,
      );
      return envelope(
        {
          action: intent.action,
          amount: intent.amount,
          to: intent.to,
          calldata: intent.calldata,
          expiresAt: intent.expiresAt,
        },
        201,
      );
    }
    if (request.resource === "keeper-health" && request.method === "GET") {
      await drainOnce();
      return envelope(await deps.reads.readKeeperHealth(lastSuccessfulRun));
    }
    fail("unsupported futures runtime resource");
  }

  return { dispatch, drainOnce };
}
