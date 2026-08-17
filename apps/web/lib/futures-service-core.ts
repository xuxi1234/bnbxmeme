import {
  encodeFunctionData,
  getAddress,
  hashTypedData,
  keccak256,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";

const UINT64_MAX = (1n << 64n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ORDER_TYPES = {
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
    { name: "reduceOnly", type: "bool" },
    { name: "role", type: "uint8" },
  ],
} as const;
const ORDERBOOK_ABI = [
  {
    type: "function",
    name: "matchOrders",
    stateMutability: "nonpayable",
    inputs: [
      { name: "maker", type: "tuple", components: ORDER_TYPES.Order },
      { name: "makerSignature", type: "bytes" },
      { name: "taker", type: "tuple", components: ORDER_TYPES.Order },
      { name: "takerSignature", type: "bytes" },
      { name: "fillQuantity", type: "uint128" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "order", type: "tuple", components: ORDER_TYPES.Order }],
    outputs: [],
  },
] as const;

export type MatchingConfig = {
  chainId: number;
  verifyingContract: Address;
  domainName: string;
  domainVersion: string;
};

export type SignedOrder = {
  trader: Address;
  side: number;
  quantity: bigint;
  limitPrice: bigint;
  leverage: number;
  nonce: bigint;
  deadline: bigint;
  reduceOnly: boolean;
  role: number;
};

export type OrderEnvelope = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  order: SignedOrder;
  signature: Hex;
};

type StoredEnvelope = Omit<OrderEnvelope, "order"> & {
  order: Omit<SignedOrder, "quantity" | "limitPrice" | "nonce" | "deadline"> & {
    quantity: string;
    limitPrice: string;
    nonce: string;
    deadline: string;
  };
};

type StoredOrder = {
  id: Hex;
  envelope: StoredEnvelope;
  receivedAt: number;
  sequence: number;
  filled: string;
  reserved: string;
  status: "open" | "reserved" | "filled" | "cancellation-pending" | "cancelled";
};

type MatchEffect = {
  id: Hex;
  kind: "submit-match";
  makerOrderId: Hex;
  takerOrderId: Hex;
  quantity: string;
  price: string;
  calldata: Hex;
  makerEnvelope: StoredEnvelope;
  takerEnvelope: StoredEnvelope;
  status:
    "prepared" | "submitted" | "included" | "confirmed" | "failed" | "reorged";
  txHash?: Hex;
  rawTransaction?: Hex;
  walletConfirmed?: never;
  submittedAtBlock?: number;
  transactionNonce?: number;
  transactionSender?: Address;
  receipt?: { status: string; blockNumber: number; blockHash: Hex };
};

type CancellationEffect = {
  id: Hex;
  kind: "submit-cancellation";
  orderId: Hex;
  trader: Address;
  envelope: StoredEnvelope;
  calldata: Hex;
  status:
    "prepared" | "submitted" | "included" | "confirmed" | "failed" | "reorged";
  txHash?: Hex;
  rawTransaction?: Hex;
  walletConfirmed?: boolean;
  submittedAtBlock?: number;
  transactionNonce?: number;
  transactionSender?: Address;
  receipt?: { status: string; blockNumber: number; blockHash: Hex };
};

type ServiceEffect = MatchEffect | CancellationEffect;

export type MatchingState = {
  config: MatchingConfig;
  revision: number;
  nextSequence: number;
  nextEffectSequence: number;
  orders: Record<string, StoredOrder>;
  effects: Record<string, ServiceEffect>;
  idempotency: Record<string, { operation: string; fingerprint: string }>;
};

const asBoundedInteger = (
  value: unknown,
  label: string,
  maximum: bigint,
  allowZero = false,
) => {
  let parsed: bigint;
  try {
    parsed = BigInt(value as bigint);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  if (parsed < (allowZero ? 0n : 1n) || parsed > maximum) {
    throw new Error(`${label} is outside its allowed range`);
  }
  return parsed;
};

const normalizeConfig = (config: MatchingConfig): MatchingConfig => {
  if (!Number.isSafeInteger(config.chainId) || config.chainId < 1) {
    throw new Error("chainId must be a positive integer");
  }
  if (!config.domainName || !config.domainVersion) {
    throw new Error("EIP-712 domain identity is required");
  }
  return { ...config, verifyingContract: getAddress(config.verifyingContract) };
};

const storedEnvelope = (envelope: OrderEnvelope): StoredEnvelope => ({
  domain: {
    ...envelope.domain,
    verifyingContract: getAddress(envelope.domain.verifyingContract),
  },
  order: {
    ...envelope.order,
    trader: getAddress(envelope.order.trader),
    quantity: envelope.order.quantity.toString(),
    limitPrice: envelope.order.limitPrice.toString(),
    nonce: envelope.order.nonce.toString(),
    deadline: envelope.order.deadline.toString(),
  },
  signature: envelope.signature,
});

const effectFingerprint = (...parts: string[]) =>
  hashTypedData({
    domain: {
      name: "BNBX Futures service effect",
      version: "1",
      chainId: 1,
      verifyingContract: `0x${"00".repeat(20)}`,
    },
    types: { Effect: [{ name: "identity", type: "string" }] },
    primaryType: "Effect",
    message: { identity: parts.join(":") },
  });

const assertRevision = (state: MatchingState, expectedRevision: number) => {
  if (expectedRevision !== state.revision) {
    throw new Error(
      `state revision conflict: expected ${expectedRevision}, current ${state.revision}`,
    );
  }
};

const clone = (state: MatchingState) => structuredClone(state);
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const finalized = (state: MatchingState) => deepFreeze(state);
const amount = (value: string) => BigInt(value);
const remaining = (order: StoredOrder) =>
  amount(order.envelope.order.quantity) -
  amount(order.filled) -
  amount(order.reserved);

export async function validateOrderEnvelope(
  envelope: OrderEnvelope,
  configured: MatchingConfig,
  now: bigint,
) {
  const config = normalizeConfig(configured);
  if (
    envelope.domain.name !== config.domainName ||
    envelope.domain.version !== config.domainVersion ||
    envelope.domain.chainId !== config.chainId ||
    getAddress(envelope.domain.verifyingContract) !== config.verifyingContract
  ) {
    throw new Error("order domain identity mismatch");
  }
  const trader = getAddress(envelope.order.trader);
  const quantity = asBoundedInteger(
    envelope.order.quantity,
    "quantity",
    UINT128_MAX,
  );
  const limitPrice = asBoundedInteger(
    envelope.order.limitPrice,
    "limit price",
    UINT128_MAX,
  );
  const nonce = asBoundedInteger(
    envelope.order.nonce,
    "nonce",
    UINT64_MAX,
    true,
  );
  const deadline = asBoundedInteger(
    envelope.order.deadline,
    "deadline",
    UINT64_MAX,
  );
  if (deadline < now) throw new Error("order expired");
  if (![0, 1].includes(envelope.order.side)) throw new Error("invalid side");
  if (![0, 1].includes(envelope.order.role)) throw new Error("invalid role");
  if (
    !Number.isSafeInteger(envelope.order.leverage) ||
    envelope.order.leverage < 1 ||
    envelope.order.leverage > 3
  ) {
    throw new Error("leverage must be between one and three");
  }
  if (typeof envelope.order.reduceOnly !== "boolean")
    throw new Error("reduceOnly must be boolean");
  const message = {
    ...envelope.order,
    trader,
    quantity,
    limitPrice,
    nonce,
    deadline,
  };
  const domain = {
    name: config.domainName,
    version: config.domainVersion,
    chainId: config.chainId,
    verifyingContract: config.verifyingContract,
  };
  const valid = await verifyTypedData({
    address: trader,
    domain,
    types: ORDER_TYPES,
    primaryType: "Order",
    message,
    signature: envelope.signature,
  });
  if (!valid)
    throw new Error("order signature does not bind the supplied economics");
  return {
    orderId: hashTypedData({
      domain,
      types: ORDER_TYPES,
      primaryType: "Order",
      message,
    }),
    order: {
      ...message,
      quantity: quantity.toString(),
      limitPrice: limitPrice.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    },
  };
}

export function createMatchingState(config: MatchingConfig): MatchingState {
  return finalized({
    config: normalizeConfig(config),
    revision: 0,
    nextSequence: 0,
    nextEffectSequence: 0,
    orders: {},
    effects: {},
    idempotency: {},
  });
}

const crosses = (maker: StoredOrder, taker: StoredOrder) => {
  if (maker.envelope.order.side === taker.envelope.order.side) return false;
  if (maker.envelope.order.trader === taker.envelope.order.trader) return false;
  const makerPrice = amount(maker.envelope.order.limitPrice);
  const takerPrice = amount(taker.envelope.order.limitPrice);
  return taker.envelope.order.side === 0
    ? makerPrice <= takerPrice
    : makerPrice >= takerPrice;
};

const makerPriority =
  (taker: StoredOrder) => (left: StoredOrder, right: StoredOrder) => {
    const leftPrice = amount(left.envelope.order.limitPrice);
    const rightPrice = amount(right.envelope.order.limitPrice);
    if (leftPrice !== rightPrice) {
      if (taker.envelope.order.side === 0)
        return leftPrice < rightPrice ? -1 : 1;
      return leftPrice > rightPrice ? -1 : 1;
    }
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.id.localeCompare(right.id);
  };

const takerPriority = (left: StoredOrder, right: StoredOrder) => {
  if (left.envelope.order.side === right.envelope.order.side) {
    const leftPrice = amount(left.envelope.order.limitPrice);
    const rightPrice = amount(right.envelope.order.limitPrice);
    if (leftPrice !== rightPrice) {
      if (left.envelope.order.side === 0)
        return leftPrice > rightPrice ? -1 : 1;
      return leftPrice < rightPrice ? -1 : 1;
    }
  }
  return left.sequence - right.sequence || left.id.localeCompare(right.id);
};

const typedOrder = (envelope: StoredEnvelope) => ({
  ...envelope.order,
  quantity: BigInt(envelope.order.quantity),
  limitPrice: BigInt(envelope.order.limitPrice),
  nonce: BigInt(envelope.order.nonce),
  deadline: BigInt(envelope.order.deadline),
});

const runMatching = (state: MatchingState, now: bigint) => {
  const effects: MatchEffect[] = [];
  const takers = Object.values(state.orders)
    .filter(
      (order) =>
        order.envelope.order.role === 1 &&
        order.status !== "cancelled" &&
        order.status !== "cancellation-pending" &&
        amount(order.envelope.order.deadline) >= now &&
        remaining(order) > 0n,
    )
    .sort(takerPriority);
  for (const taker of takers) {
    const makers = Object.values(state.orders)
      .filter(
        (candidate) =>
          candidate.envelope.order.role === 0 &&
          candidate.status !== "cancelled" &&
          candidate.status !== "cancellation-pending" &&
          amount(candidate.envelope.order.deadline) >= now &&
          remaining(candidate) > 0n &&
          crosses(candidate, taker),
      )
      .sort(makerPriority(taker));
    for (const maker of makers) {
      const takerRemaining = remaining(taker);
      if (takerRemaining === 0n) break;
      const quantity =
        remaining(maker) < takerRemaining ? remaining(maker) : takerRemaining;
      const makerOffset = amount(maker.filled) + amount(maker.reserved);
      const takerOffset = amount(taker.filled) + amount(taker.reserved);
      const effect: MatchEffect = {
        id: effectFingerprint(
          maker.id,
          taker.id,
          makerOffset.toString(),
          takerOffset.toString(),
          quantity.toString(),
          state.nextEffectSequence.toString(),
        ),
        kind: "submit-match",
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        quantity: quantity.toString(),
        price: maker.envelope.order.limitPrice,
        calldata: encodeFunctionData({
          abi: ORDERBOOK_ABI,
          functionName: "matchOrders",
          args: [
            typedOrder(maker.envelope),
            maker.envelope.signature,
            typedOrder(taker.envelope),
            taker.envelope.signature,
            quantity,
          ],
        }),
        makerEnvelope: maker.envelope,
        takerEnvelope: taker.envelope,
        status: "prepared",
      };
      state.nextEffectSequence += 1;
      maker.reserved = (amount(maker.reserved) + quantity).toString();
      taker.reserved = (amount(taker.reserved) + quantity).toString();
      maker.status = "reserved";
      taker.status = "reserved";
      state.effects[effect.id] = effect;
      effects.push(effect);
    }
  }
  return effects;
};

export async function intakeOrder(
  state: MatchingState,
  command: {
    expectedRevision: number;
    idempotencyKey: string;
    receivedAt: number;
    now: bigint;
    envelope: OrderEnvelope;
  },
) {
  if (!command.idempotencyKey) throw new Error("idempotency key is required");
  const validated = await validateOrderEnvelope(
    command.envelope,
    state.config,
    command.now,
  );
  const fingerprint = `intake:${validated.orderId}`;
  const prior = state.idempotency[command.idempotencyKey];
  if (prior) {
    if (prior.operation !== "intake" || prior.fingerprint !== fingerprint) {
      throw new Error("idempotency key payload mismatch");
    }
    return {
      state,
      acceptedOrderId: validated.orderId,
      duplicate: true,
      effects: [] as MatchEffect[],
    };
  }
  assertRevision(state, command.expectedRevision);
  if (!Number.isSafeInteger(command.receivedAt) || command.receivedAt < 0) {
    throw new Error("receivedAt must be a non-negative integer");
  }
  if (state.orders[validated.orderId]) {
    const next = clone(state);
    next.idempotency[command.idempotencyKey] = {
      operation: "intake",
      fingerprint,
    };
    next.revision += 1;
    return {
      state: finalized(next),
      acceptedOrderId: validated.orderId,
      duplicate: true,
      effects: [] as MatchEffect[],
    };
  }
  const next = clone(state);
  const accepted: StoredOrder = {
    id: validated.orderId,
    envelope: storedEnvelope(command.envelope),
    receivedAt: command.receivedAt,
    sequence: next.nextSequence,
    filled: "0",
    reserved: "0",
    status: "open",
  };
  next.nextSequence += 1;
  next.orders[accepted.id] = accepted;
  next.idempotency[command.idempotencyKey] = {
    operation: "intake",
    fingerprint,
  };
  const effects = runMatching(next, command.now);
  next.revision += 1;
  return {
    state: finalized(next),
    acceptedOrderId: accepted.id,
    duplicate: false,
    effects,
  };
}

export function cancelOrder(
  state: MatchingState,
  command: {
    expectedRevision: number;
    idempotencyKey: string;
    orderId: string;
    trader: Address;
  },
) {
  const fingerprint = `cancel:${command.orderId}:${getAddress(command.trader)}`;
  const prior = state.idempotency[command.idempotencyKey];
  if (prior) {
    if (prior.operation !== "cancel" || prior.fingerprint !== fingerprint) {
      throw new Error("idempotency key payload mismatch");
    }
    return { state, duplicate: true };
  }
  assertRevision(state, command.expectedRevision);
  const order = state.orders[command.orderId];
  if (!order) throw new Error("order not found");
  if (order.envelope.order.trader !== getAddress(command.trader)) {
    throw new Error("cancellation trader mismatch");
  }
  if (order.status === "cancellation-pending" || order.status === "cancelled") {
    const existing = Object.values(state.effects).find(
      (effect): effect is CancellationEffect =>
        effect.kind === "submit-cancellation" &&
        effect.orderId === order.id &&
        (order.status === "cancelled"
          ? effect.status === "confirmed"
          : ["prepared", "submitted", "included"].includes(effect.status)),
    );
    if (!existing)
      throw new Error("cancellation state lacks its durable effect");
    const next = clone(state);
    next.idempotency[command.idempotencyKey] = {
      operation: "cancel",
      fingerprint,
    };
    next.revision += 1;
    return { state: finalized(next), effect: existing, duplicate: true };
  }
  if (amount(order.reserved) !== 0n) {
    throw new Error("order has a pending match and cannot be cancelled yet");
  }
  const next = clone(state);
  const nextOrder = next.orders[command.orderId];
  nextOrder.status = "cancellation-pending";
  const effect: CancellationEffect = {
    id: effectFingerprint(
      "cancel",
      command.orderId,
      next.nextEffectSequence.toString(),
    ),
    kind: "submit-cancellation",
    orderId: nextOrder.id,
    trader: nextOrder.envelope.order.trader,
    envelope: nextOrder.envelope,
    calldata: encodeFunctionData({
      abi: ORDERBOOK_ABI,
      functionName: "cancel",
      args: [typedOrder(nextOrder.envelope)],
    }),
    status: "prepared",
  };
  next.nextEffectSequence += 1;
  next.effects[effect.id] = effect;
  next.idempotency[command.idempotencyKey] = {
    operation: "cancel",
    fingerprint,
  };
  next.revision += 1;
  return {
    state: finalized(next),
    effect: deepFreeze(effect),
    duplicate: false,
  };
}

export function recordSubmission(
  state: MatchingState,
  command: {
    expectedRevision: number;
    effectId: string;
    rawTransaction: Hex;
    submittedAtBlock: number;
    transactionNonce: number;
    transactionSender: Address;
  },
) {
  const effect = state.effects[command.effectId];
  if (!effect) throw new Error("submission effect not found");
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(command.rawTransaction))
    throw new Error("invalid raw signed transaction");
  const txHash = keccak256(command.rawTransaction);
  if (
    !Number.isSafeInteger(command.submittedAtBlock) ||
    command.submittedAtBlock < 0 ||
    !Number.isSafeInteger(command.transactionNonce) ||
    command.transactionNonce < 0 ||
    getAddress(command.transactionSender) !== command.transactionSender
  ) {
    throw new Error("submission block and nonce are required");
  }
  if (effect.txHash) {
    if (
      effect.txHash.toLowerCase() === txHash.toLowerCase() &&
      effect.rawTransaction?.toLowerCase() ===
        command.rawTransaction.toLowerCase() &&
      effect.submittedAtBlock === command.submittedAtBlock &&
      effect.transactionNonce === command.transactionNonce &&
      effect.transactionSender === command.transactionSender
    ) {
      return { state, duplicate: true };
    }
    throw new Error("submission already binds another transaction");
  }
  if (effect.kind === "submit-match") {
    for (const id of [effect.makerOrderId, effect.takerOrderId]) {
      if (state.orders[id].status === "cancelled") {
        throw new Error("cancelled order cannot be submitted");
      }
    }
  }
  assertRevision(state, command.expectedRevision);
  const next = clone(state);
  next.effects[command.effectId].txHash = txHash;
  next.effects[command.effectId].rawTransaction = command.rawTransaction;
  next.effects[command.effectId].submittedAtBlock = command.submittedAtBlock;
  next.effects[command.effectId].transactionNonce = command.transactionNonce;
  next.effects[command.effectId].transactionSender = command.transactionSender;
  next.effects[command.effectId].status = "submitted";
  next.revision += 1;
  return { state: finalized(next), duplicate: false };
}

export function reconcileWalletCancellation(
  state: MatchingState,
  command: {
    expectedRevision: number;
    effectId: string;
    cancelledOnChain: boolean;
  },
) {
  const effect = state.effects[command.effectId];
  if (!effect || effect.kind !== "submit-cancellation")
    throw new Error("wallet cancellation effect not found");
  if (effect.status === "confirmed" && effect.walletConfirmed)
    return { state, duplicate: true };
  if (effect.status !== "prepared")
    throw new Error("wallet cancellation is already bound to a transaction");
  if (command.cancelledOnChain !== true)
    throw new Error("wallet cancellation is not confirmed on-chain");
  assertRevision(state, command.expectedRevision);
  const next = clone(state);
  const nextEffect = next.effects[command.effectId] as CancellationEffect;
  nextEffect.status = "confirmed";
  nextEffect.walletConfirmed = true;
  next.orders[nextEffect.orderId].status = "cancelled";
  next.revision += 1;
  return { state: finalized(next), duplicate: false };
}

const updateOrdersForEffect = (
  state: MatchingState,
  effect: MatchEffect,
  operation: "confirm" | "release" | "reverse",
) => {
  const quantity = amount(effect.quantity);
  for (const id of [effect.makerOrderId, effect.takerOrderId]) {
    const order = state.orders[id];
    if (operation === "confirm") {
      order.reserved = (amount(order.reserved) - quantity).toString();
      order.filled = (amount(order.filled) + quantity).toString();
    } else if (operation === "release") {
      order.reserved = (amount(order.reserved) - quantity).toString();
    } else {
      order.filled = (amount(order.filled) - quantity).toString();
    }
    if (
      order.status !== "cancelled" &&
      order.status !== "cancellation-pending"
    ) {
      order.status =
        amount(order.filled) === amount(order.envelope.order.quantity)
          ? "filled"
          : amount(order.reserved) > 0n
            ? "reserved"
            : "open";
    }
  }
};

export function reconcileSubmission(
  state: MatchingState,
  command: {
    expectedRevision: number;
    effectId: string;
    now: bigint;
    receipt: {
      status: string;
      transactionHash: Hex;
      blockNumber: number;
      blockHash: Hex;
    } | null;
    canonicalBlockHash: Hex | null;
    headBlock: number;
    requiredConfirmations: number;
    transaction?: {
      hash: Hex;
      chainId: number;
      from: Address;
      to: Address;
      input: Hex;
    };
    event?: Record<string, unknown>;
    transactionPresent?: boolean;
    dropAfterBlocks?: number;
    nonceConsumption?: {
      transactionHash: Hex;
      sender: Address;
      nonce: number;
      blockNumber: number;
      blockHash: Hex;
    };
  },
) {
  const effect = state.effects[command.effectId];
  if (!effect?.txHash) throw new Error("submission has no transaction");
  if (
    !Number.isSafeInteger(command.requiredConfirmations) ||
    command.requiredConfirmations < 1 ||
    command.requiredConfirmations > 100
  ) {
    throw new Error(
      "required confirmations must be between one and one hundred",
    );
  }
  const canonical = Boolean(
    command.receipt &&
    command.canonicalBlockHash &&
    command.receipt.blockHash.toLowerCase() ===
      command.canonicalBlockHash.toLowerCase(),
  );
  if (effect.status === "reorged" || effect.status === "failed")
    return { state, duplicate: true };
  if (effect.status === "confirmed" && canonical)
    return { state, duplicate: true };
  assertRevision(state, command.expectedRevision);
  const next = clone(state);
  const nextEffect = next.effects[command.effectId];
  const releaseEffect = (outcome: "failed" | "reorged") => {
    if (nextEffect.kind === "submit-match") {
      updateOrdersForEffect(
        next,
        nextEffect,
        effect.status === "confirmed" ? "reverse" : "release",
      );
      nextEffect.status = outcome;
      return runMatching(next, command.now);
    }
    next.orders[nextEffect.orderId].status = "open";
    nextEffect.status = outcome;
    return [] as MatchEffect[];
  };
  if (!command.receipt) {
    const dropAfterBlocks = command.dropAfterBlocks ?? 20;
    if (
      !Number.isSafeInteger(dropAfterBlocks) ||
      dropAfterBlocks < 1 ||
      dropAfterBlocks > 1_000
    ) {
      throw new Error("invalid dropped-transaction window");
    }
    if (!Number.isSafeInteger(command.headBlock) || command.headBlock < 0) {
      throw new Error("invalid dropped-transaction head block");
    }
    const consumption = command.nonceConsumption;
    const consumptionConfirmed = Boolean(
      consumption &&
      HASH.test(consumption.transactionHash) &&
      consumption.transactionHash.toLowerCase() !==
        effect.txHash.toLowerCase() &&
      getAddress(consumption.sender) === effect.transactionSender &&
      consumption.nonce === effect.transactionNonce &&
      Number.isSafeInteger(consumption.blockNumber) &&
      consumption.blockNumber >= 0 &&
      consumption.blockHash.toLowerCase() ===
        command.canonicalBlockHash?.toLowerCase() &&
      command.headBlock - consumption.blockNumber + 1 >=
        command.requiredConfirmations,
    );
    if (
      effect.status === "submitted" &&
      (command.transactionPresent !== false ||
        command.headBlock - (effect.submittedAtBlock ?? command.headBlock) <
          dropAfterBlocks ||
        !consumptionConfirmed)
    ) {
      return { state, duplicate: true, effects: [] as MatchEffect[] };
    }
    const effects = releaseEffect("reorged");
    next.revision += 1;
    return { state: finalized(next), duplicate: false, effects };
  }
  if (
    command.receipt.transactionHash.toLowerCase() !==
    effect.txHash.toLowerCase()
  ) {
    throw new Error("receipt transaction does not match submission");
  }
  if (!canonical) {
    const effects = releaseEffect("reorged");
    next.revision += 1;
    return { state: finalized(next), duplicate: false, effects };
  } else if (command.receipt.status !== "success") {
    const effects = releaseEffect("failed");
    next.revision += 1;
    return { state: finalized(next), duplicate: false, effects };
  } else {
    if (
      !Number.isSafeInteger(command.receipt.blockNumber) ||
      command.receipt.blockNumber < 0 ||
      !Number.isSafeInteger(command.headBlock) ||
      command.headBlock < command.receipt.blockNumber
    ) {
      throw new Error("invalid confirmation block range");
    }
    if (
      !command.transaction ||
      command.transaction.hash.toLowerCase() !== effect.txHash.toLowerCase() ||
      command.transaction.chainId !== state.config.chainId ||
      getAddress(command.transaction.to) !== state.config.verifyingContract ||
      command.transaction.input.toLowerCase() !== effect.calldata.toLowerCase()
    ) {
      throw new Error("transaction does not execute the prepared effect");
    }
    if (nextEffect.kind === "submit-match") {
      if (
        !command.event ||
        command.event.eventName !== "OrdersMatched" ||
        `${command.event.address}`.toLowerCase() !==
          state.config.verifyingContract.toLowerCase() ||
        `${command.event.makerOrderHash}`.toLowerCase() !==
          nextEffect.makerOrderId.toLowerCase() ||
        `${command.event.takerOrderHash}`.toLowerCase() !==
          nextEffect.takerOrderId.toLowerCase() ||
        `${command.event.fillQuantity}` !== nextEffect.quantity ||
        `${command.event.executionPrice}` !== nextEffect.price
      ) {
        throw new Error(
          "canonical match event does not bind prepared economics",
        );
      }
    } else if (
      !command.event ||
      command.event.eventName !== "OrderCancelled" ||
      `${command.event.address}`.toLowerCase() !==
        state.config.verifyingContract.toLowerCase() ||
      `${command.event.orderHash}`.toLowerCase() !==
        nextEffect.orderId.toLowerCase() ||
      getAddress(`${command.event.trader}`) !== nextEffect.trader ||
      getAddress(command.transaction.from) !== nextEffect.trader
    ) {
      throw new Error(
        "canonical cancellation event does not bind the trader and order",
      );
    }
    const confirmations = command.headBlock - command.receipt.blockNumber + 1;
    nextEffect.receipt = command.receipt;
    if (confirmations >= command.requiredConfirmations) {
      if (nextEffect.kind === "submit-match") {
        updateOrdersForEffect(next, nextEffect, "confirm");
      } else {
        next.orders[nextEffect.orderId].status = "cancelled";
      }
      nextEffect.status = "confirmed";
    } else {
      nextEffect.status = "included";
    }
  }
  next.revision += 1;
  return {
    state: finalized(next),
    duplicate: false,
    effects: [] as MatchEffect[],
  };
}

export function serializeMatchingState(state: MatchingState) {
  return JSON.stringify(state);
}

export async function hydrateMatchingState(
  serialized: string,
  expectedConfig: MatchingConfig,
) {
  const state = JSON.parse(serialized) as MatchingState;
  const config = normalizeConfig(expectedConfig);
  if (
    !state ||
    typeof state !== "object" ||
    state.config.chainId !== config.chainId ||
    getAddress(state.config.verifyingContract) !== config.verifyingContract ||
    state.config.domainName !== config.domainName ||
    state.config.domainVersion !== config.domainVersion ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !Number.isSafeInteger(state.nextSequence) ||
    state.nextSequence < 0 ||
    !Number.isSafeInteger(state.nextEffectSequence) ||
    state.nextEffectSequence < 0 ||
    !state.orders ||
    typeof state.orders !== "object" ||
    !state.effects ||
    typeof state.effects !== "object" ||
    !state.idempotency ||
    typeof state.idempotency !== "object"
  ) {
    throw new Error("invalid durable matching state schema");
  }
  const orderSequences = new Set<number>();
  for (const [id, order] of Object.entries(state.orders)) {
    const total = amount(order.envelope.order.quantity);
    const filled = amount(order.filled);
    const reserved = amount(order.reserved);
    if (
      id !== order.id ||
      !HASH.test(id) ||
      total < 1n ||
      filled < 0n ||
      reserved < 0n ||
      filled + reserved > total ||
      ![
        "open",
        "reserved",
        "filled",
        "cancellation-pending",
        "cancelled",
      ].includes(order.status) ||
      order.envelope.domain.chainId !== config.chainId ||
      order.envelope.domain.name !== config.domainName ||
      order.envelope.domain.version !== config.domainVersion ||
      getAddress(order.envelope.domain.verifyingContract) !==
        config.verifyingContract ||
      getAddress(order.envelope.order.trader) !== order.envelope.order.trader ||
      ![0, 1].includes(order.envelope.order.side) ||
      ![0, 1].includes(order.envelope.order.role) ||
      ![1, 2, 3].includes(order.envelope.order.leverage) ||
      typeof order.envelope.order.reduceOnly !== "boolean" ||
      !Number.isSafeInteger(order.receivedAt) ||
      order.receivedAt < 0 ||
      !Number.isSafeInteger(order.sequence) ||
      order.sequence < 0 ||
      order.sequence >= state.nextSequence ||
      orderSequences.has(order.sequence)
    ) {
      throw new Error("invalid durable order invariant");
    }
    asBoundedInteger(order.envelope.order.quantity, "quantity", UINT128_MAX);
    asBoundedInteger(
      order.envelope.order.limitPrice,
      "limit price",
      UINT128_MAX,
    );
    asBoundedInteger(order.envelope.order.nonce, "nonce", UINT64_MAX, true);
    asBoundedInteger(order.envelope.order.deadline, "deadline", UINT64_MAX);
    orderSequences.add(order.sequence);
    const message = typedOrder(order.envelope);
    const orderId = hashTypedData({
      domain: order.envelope.domain,
      types: ORDER_TYPES,
      primaryType: "Order",
      message,
    });
    if (
      orderId.toLowerCase() !== id.toLowerCase() ||
      !(await verifyTypedData({
        address: getAddress(order.envelope.order.trader),
        domain: order.envelope.domain,
        types: ORDER_TYPES,
        primaryType: "Order",
        message,
        signature: order.envelope.signature,
      }))
    ) {
      throw new Error("durable order signature or hash mismatch");
    }
  }
  const reservedByOrder = new Map<string, bigint>();
  const filledByOrder = new Map<string, bigint>();
  const cancellationStatus = new Map<
    string,
    "cancellation-pending" | "cancelled"
  >();
  for (const [id, effect] of Object.entries(state.effects)) {
    if (
      id !== effect.id ||
      !HASH.test(id) ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(effect.calldata) ||
      ![
        "prepared",
        "submitted",
        "included",
        "confirmed",
        "failed",
        "reorged",
      ].includes(effect.status)
    ) {
      throw new Error("invalid durable effect invariant");
    }
    const active = ["prepared", "submitted", "included"].includes(
      effect.status,
    );
    const requiresSubmission = ["submitted", "included", "confirmed"].includes(
      effect.status,
    );
    const hasCompleteSubmission = Boolean(
      effect.txHash &&
      effect.rawTransaction &&
      effect.transactionSender !== undefined &&
      Number.isSafeInteger(effect.submittedAtBlock) &&
      Number.isSafeInteger(effect.transactionNonce),
    );
    const walletConfirmedCancellation = Boolean(
      effect.kind === "submit-cancellation" &&
        effect.status === "confirmed" &&
        effect.walletConfirmed === true &&
        !effect.txHash &&
        !effect.rawTransaction,
    );
    if (
      (requiresSubmission &&
        !hasCompleteSubmission &&
        !walletConfirmedCancellation) ||
      Boolean(effect.txHash || effect.rawTransaction) !==
        hasCompleteSubmission ||
      (hasCompleteSubmission &&
        (!/^0x(?:[0-9a-fA-F]{2})+$/.test(effect.rawTransaction as string) ||
          keccak256(effect.rawTransaction as Hex).toLowerCase() !==
            effect.txHash?.toLowerCase())) ||
      (effect.walletConfirmed === true && !walletConfirmedCancellation)
    ) {
      throw new Error("durable effect submission state mismatch");
    }
    let expectedCalldata: Hex;
    if (effect.kind === "submit-match") {
      const maker = state.orders[effect.makerOrderId];
      const taker = state.orders[effect.takerOrderId];
      if (
        !maker ||
        !taker ||
        effect.makerEnvelope.signature !== maker.envelope.signature ||
        effect.takerEnvelope.signature !== taker.envelope.signature ||
        effect.price !== maker.envelope.order.limitPrice ||
        !crosses(maker, taker) ||
        amount(effect.quantity) < 1n
      ) {
        throw new Error("durable match effect economics mismatch");
      }
      expectedCalldata = encodeFunctionData({
        abi: ORDERBOOK_ABI,
        functionName: "matchOrders",
        args: [
          typedOrder(maker.envelope),
          maker.envelope.signature,
          typedOrder(taker.envelope),
          taker.envelope.signature,
          amount(effect.quantity),
        ],
      });
      for (const orderId of [effect.makerOrderId, effect.takerOrderId]) {
        const target =
          effect.status === "confirmed"
            ? filledByOrder
            : active
              ? reservedByOrder
              : null;
        if (target)
          target.set(
            orderId,
            (target.get(orderId) ?? 0n) + amount(effect.quantity),
          );
      }
    } else {
      const order = state.orders[effect.orderId];
      if (
        !order ||
        effect.trader !== order.envelope.order.trader ||
        effect.envelope.signature !== order.envelope.signature
      ) {
        throw new Error("durable cancellation effect economics mismatch");
      }
      expectedCalldata = encodeFunctionData({
        abi: ORDERBOOK_ABI,
        functionName: "cancel",
        args: [typedOrder(order.envelope)],
      });
      if (["prepared", "submitted", "included"].includes(effect.status)) {
        if (cancellationStatus.has(effect.orderId))
          throw new Error("multiple active durable cancellation effects");
        cancellationStatus.set(effect.orderId, "cancellation-pending");
      } else if (effect.status === "confirmed") {
        if (cancellationStatus.has(effect.orderId))
          throw new Error("multiple active durable cancellation effects");
        cancellationStatus.set(effect.orderId, "cancelled");
      }
    }
    if (expectedCalldata.toLowerCase() !== effect.calldata.toLowerCase()) {
      throw new Error("durable effect calldata mismatch");
    }
  }
  for (const order of Object.values(state.orders)) {
    if (
      amount(order.reserved) !== (reservedByOrder.get(order.id) ?? 0n) ||
      amount(order.filled) !== (filledByOrder.get(order.id) ?? 0n)
    ) {
      throw new Error("durable order accounting mismatch");
    }
    const expectedStatus =
      cancellationStatus.get(order.id) ??
      (amount(order.filled) === amount(order.envelope.order.quantity)
        ? "filled"
        : amount(order.reserved) > 0n
          ? "reserved"
          : "open");
    if (order.status !== expectedStatus) {
      throw new Error("durable order status mismatch");
    }
  }
  return finalized(state);
}

export async function commitMatchingState(
  persisted: string,
  expectedRevision: number,
  nextState: MatchingState,
) {
  const current = await hydrateMatchingState(persisted, nextState.config);
  await hydrateMatchingState(
    serializeMatchingState(nextState),
    nextState.config,
  );
  if (
    current.revision !== expectedRevision ||
    nextState.revision !== expectedRevision + 1
  ) {
    throw new Error("durable compare-and-swap revision conflict");
  }
  return serializeMatchingState(nextState);
}

export async function persistMatchingStateAtomic(
  store: {
    compareAndSwap(
      expectedRevision: number,
      serialized: string,
    ): Promise<boolean>;
  },
  persisted: string,
  expectedRevision: number,
  nextState: MatchingState,
) {
  const serialized = await commitMatchingState(
    persisted,
    expectedRevision,
    nextState,
  );
  if (!(await store.compareAndSwap(expectedRevision, serialized))) {
    throw new Error("atomic matching state persistence conflict");
  }
  return serialized;
}
