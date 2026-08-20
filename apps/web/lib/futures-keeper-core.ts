import {
  encodeFunctionData,
  getAddress,
  hashTypedData,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";

type KeeperConfig = { chainId: number; orderBook: string };
type SubmissionStatus = "prepared" | "submitted" | "included" | "confirmed";
type SubmissionAttempt = { txHash: Hex; outcome: "failed" | "reorged" };
type ChainSimulation = {
  success: boolean;
  chainId: number;
  to: string;
  input: Hex;
  blockNumber: number;
  blockHash: Hex;
};
type BaseEffect = {
  id: string;
  chainId: number;
  orderBook: string;
  calldata: Hex;
  status: SubmissionStatus;
  attempts: SubmissionAttempt[];
  txHash?: Hex;
  submittedAtBlock?: number;
  transactionNonce?: number;
  transactionSender?: Address;
  simulation?: ChainSimulation;
  receipt?: {
    status: string;
    transactionHash: Hex;
    blockNumber: number;
    blockHash: Hex;
  };
};
type FundingEffect = BaseEffect & {
  kind: "funding-checkpoint";
  checkpointAt: number;
  intervalSeconds: number;
  rateBps: 0;
};
type LiquidationEffect = BaseEffect & {
  kind: "liquidation";
  lotId: string;
  oracleUpdatedAt: number;
  markPrice: string;
  replacementOrderId: Hex;
  replacement: LiquidationReplacement;
  snapshot: LiquidationSnapshot;
  canonicalSnapshotBlockHash: Hex;
};
type KeeperEffect = FundingEffect | LiquidationEffect;

export type KeeperState = {
  config: KeeperConfig;
  revision: number;
  effects: Record<string, KeeperEffect>;
  candidates: Record<string, string>;
};

type LiquidationReplacement = {
  maker: string;
  target: string;
  side: number;
  quantity: string;
  limitPrice: string;
  leverage: number;
  nonce: string;
  deadline: string;
  signature: string;
};

type LiquidationSnapshot = {
  blockNumber: number;
  blockHash: Hex;
  marketState: "Open" | "CloseOnly";
  lot: {
    id: string;
    longTrader: string;
    shortTrader: string;
    remainingQuantity: string;
  };
  targetEquity: string;
  maintenanceRequirement: string;
  closeFee: string;
  nonceAvailable: boolean;
  oracleMarkPrice: string;
  oracleUpdatedAt: number;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9][0-9]*)$/;
const INT = /^-?(?:0|[1-9][0-9]*)$/;
const LIQUIDATION_TYPES = {
  LiquidationOrder: [
    { name: "maker", type: "address" },
    { name: "target", type: "address" },
    { name: "side", type: "uint8" },
    { name: "quantity", type: "uint128" },
    { name: "limitPrice", type: "uint128" },
    { name: "leverage", type: "uint8" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;
const KEEPER_ABI = [
  {
    type: "function",
    name: "checkpointFunding",
    stateMutability: "nonpayable",
    inputs: [{ name: "rateBps", type: "int256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lotId", type: "uint64" },
      {
        name: "replacement",
        type: "tuple",
        components: LIQUIDATION_TYPES.LiquidationOrder,
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const finish = (state: KeeperState) => freeze(state);
const assertRevision = (state: KeeperState, expected: number) => {
  if (state.revision !== expected) throw new Error("keeper revision conflict");
};

export function createKeeperState(config: KeeperConfig): KeeperState {
  if (
    !Number.isSafeInteger(config.chainId) ||
    config.chainId < 1 ||
    !ADDRESS.test(config.orderBook)
  ) {
    throw new Error("invalid keeper chain identity");
  }
  return finish({
    config: {
      chainId: config.chainId,
      orderBook: getAddress(config.orderBook),
    },
    revision: 0,
    effects: {},
    candidates: {},
  });
}

export function queueFundingCheckpoint(
  state: KeeperState,
  command: {
    expectedRevision: number;
    observedAt: number;
    intervalSeconds: number;
    rateBps: number;
  },
) {
  if (command.rateBps !== 0)
    throw new Error("Phase 1 funding rate must remain zero");
  if (
    !Number.isSafeInteger(command.observedAt) ||
    command.observedAt < 0 ||
    !Number.isSafeInteger(command.intervalSeconds) ||
    command.intervalSeconds < 1
  ) {
    throw new Error("invalid funding checkpoint time");
  }
  const checkpointAt =
    Math.floor(command.observedAt / command.intervalSeconds) *
    command.intervalSeconds;
  const id = `funding:${state.config.chainId}:${state.config.orderBook.toLowerCase()}:${checkpointAt}`;
  if (state.effects[id])
    return { state, effect: state.effects[id], duplicate: true };
  assertRevision(state, command.expectedRevision);
  const effect: FundingEffect = {
    id,
    kind: "funding-checkpoint",
    chainId: state.config.chainId,
    orderBook: state.config.orderBook,
    checkpointAt,
    intervalSeconds: command.intervalSeconds,
    rateBps: 0,
    calldata: encodeFunctionData({
      abi: KEEPER_ABI,
      functionName: "checkpointFunding",
      args: [0n],
    }),
    status: "prepared",
    attempts: [],
  };
  const next = structuredClone(state);
  next.effects[id] = effect;
  next.revision += 1;
  return { state: finish(next), effect: freeze(effect), duplicate: false };
}

export async function queueLiquidationCandidate(
  state: KeeperState,
  command: {
    expectedRevision: number;
    candidateId: string;
    lotId: string;
    oracleUpdatedAt: number;
    observedAt: number;
    markPrice: string;
    replacement: LiquidationReplacement;
    snapshot: LiquidationSnapshot;
    canonicalSnapshotBlockHash: Hex;
  },
) {
  if (
    !command.candidateId ||
    !UINT.test(command.lotId) ||
    command.lotId === "0"
  ) {
    throw new Error("invalid liquidation candidate identity");
  }
  if (
    !Number.isSafeInteger(command.observedAt) ||
    !Number.isSafeInteger(command.oracleUpdatedAt) ||
    command.oracleUpdatedAt > command.observedAt ||
    command.observedAt - command.oracleUpdatedAt > 300
  ) {
    throw new Error("liquidation candidate uses a stale oracle observation");
  }
  const replacement = command.replacement;
  if (
    !ADDRESS.test(replacement.maker) ||
    !ADDRESS.test(replacement.target) ||
    ![0, 1].includes(replacement.side) ||
    ![1, 2, 3].includes(replacement.leverage) ||
    !UINT.test(replacement.quantity) ||
    replacement.quantity === "0" ||
    !UINT.test(replacement.limitPrice) ||
    replacement.limitPrice === "0" ||
    !UINT.test(replacement.nonce) ||
    !UINT.test(replacement.deadline) ||
    !/^0x[0-9a-fA-F]{130}$/.test(replacement.signature) ||
    !UINT.test(command.markPrice) ||
    command.markPrice === "0"
  ) {
    throw new Error("invalid signed liquidation economics");
  }
  if (BigInt(replacement.deadline) < BigInt(command.observedAt)) {
    throw new Error("signed liquidation authorization expired");
  }
  const message = {
    maker: getAddress(replacement.maker) as Address,
    target: getAddress(replacement.target) as Address,
    side: replacement.side,
    quantity: BigInt(replacement.quantity),
    limitPrice: BigInt(replacement.limitPrice),
    leverage: replacement.leverage,
    nonce: BigInt(replacement.nonce),
    deadline: BigInt(replacement.deadline),
  };
  const domain = {
    name: "BNBX Futures",
    version: "1",
    chainId: state.config.chainId,
    verifyingContract: getAddress(state.config.orderBook),
  };
  if (
    !(await verifyTypedData({
      address: message.maker,
      domain,
      types: LIQUIDATION_TYPES,
      primaryType: "LiquidationOrder",
      message,
      signature: replacement.signature as Hex,
    }))
  ) {
    throw new Error(
      "liquidation signature does not bind the supplied economics",
    );
  }
  const snapshot = command.snapshot;
  if (
    !Number.isSafeInteger(snapshot.blockNumber) ||
    snapshot.blockNumber < 0 ||
    !HASH.test(snapshot.blockHash) ||
    snapshot.marketState !== "Open" ||
    snapshot.nonceAvailable !== true ||
    snapshot.lot.id !== command.lotId ||
    !ADDRESS.test(snapshot.lot.longTrader) ||
    !ADDRESS.test(snapshot.lot.shortTrader) ||
    !UINT.test(snapshot.lot.remainingQuantity) ||
    snapshot.lot.remainingQuantity !== replacement.quantity ||
    !INT.test(snapshot.targetEquity) ||
    !UINT.test(snapshot.maintenanceRequirement) ||
    !UINT.test(snapshot.closeFee) ||
    snapshot.oracleMarkPrice !== command.markPrice ||
    snapshot.oracleUpdatedAt !== command.oracleUpdatedAt ||
    snapshot.blockHash.toLowerCase() !==
      command.canonicalSnapshotBlockHash.toLowerCase()
  ) {
    throw new Error(
      "liquidation candidate lacks a valid block-bound chain snapshot",
    );
  }
  const target = getAddress(replacement.target);
  const targetIsLong = getAddress(snapshot.lot.longTrader) === target;
  const targetIsShort = getAddress(snapshot.lot.shortTrader) === target;
  const survivor = targetIsLong
    ? getAddress(snapshot.lot.shortTrader)
    : getAddress(snapshot.lot.longTrader);
  if (
    (!targetIsLong && !targetIsShort) ||
    replacement.side !== (targetIsLong ? 0 : 1) ||
    message.maker === target ||
    message.maker === survivor ||
    BigInt(snapshot.targetEquity) >=
      BigInt(snapshot.maintenanceRequirement) + BigInt(snapshot.closeFee)
  ) {
    throw new Error(
      "liquidation candidate is not strictly eligible for this lot",
    );
  }
  const mark = BigInt(command.markPrice);
  const limit = BigInt(replacement.limitPrice);
  if ((targetIsLong && mark > limit) || (targetIsShort && mark < limit)) {
    throw new Error(
      "liquidation replacement limit does not cross the oracle mark",
    );
  }
  const replacementOrderId = hashTypedData({
    domain,
    types: LIQUIDATION_TYPES,
    primaryType: "LiquidationOrder",
    message,
  });
  const fingerprint = stable({
    lotId: command.lotId,
    oracleUpdatedAt: command.oracleUpdatedAt,
    markPrice: command.markPrice,
    replacement,
    snapshot,
  });
  const prior = state.candidates[command.candidateId];
  if (prior) {
    if (prior !== fingerprint)
      throw new Error("candidate identity payload mismatch");
    const id = `liquidation:${command.candidateId}`;
    return { state, effect: state.effects[id], duplicate: true };
  }
  assertRevision(state, command.expectedRevision);
  const effect: LiquidationEffect = {
    id: `liquidation:${command.candidateId}`,
    kind: "liquidation",
    chainId: state.config.chainId,
    orderBook: state.config.orderBook,
    lotId: command.lotId,
    oracleUpdatedAt: command.oracleUpdatedAt,
    markPrice: command.markPrice,
    replacementOrderId,
    replacement: structuredClone(replacement),
    snapshot: structuredClone(snapshot),
    canonicalSnapshotBlockHash: command.canonicalSnapshotBlockHash,
    calldata: encodeFunctionData({
      abi: KEEPER_ABI,
      functionName: "liquidate",
      args: [BigInt(command.lotId), message, replacement.signature as Hex],
    }),
    status: "prepared",
    attempts: [],
  };
  const next = structuredClone(state);
  next.candidates[command.candidateId] = fingerprint;
  next.effects[effect.id] = effect;
  next.revision += 1;
  return { state: finish(next), effect: freeze(effect), duplicate: false };
}

export function recordKeeperSubmission(
  state: KeeperState,
  command: {
    expectedRevision: number;
    effectId: string;
    txHash: Hex;
    submittedAtBlock: number;
    transactionNonce: number;
    transactionSender: Address;
    simulation: ChainSimulation;
    canonicalSimulationBlockHash: Hex;
  },
) {
  const effect = state.effects[command.effectId];
  if (!effect) throw new Error("keeper effect not found");
  if (effect.txHash?.toLowerCase() === command.txHash.toLowerCase())
    return { state, duplicate: true };
  if (effect.status !== "prepared" || !HASH.test(command.txHash)) {
    throw new Error("keeper effect is not ready for submission");
  }
  if (
    effect.attempts.some(
      ({ txHash }) => txHash.toLowerCase() === command.txHash.toLowerCase(),
    )
  ) {
    throw new Error("transaction hash was already used by this keeper effect");
  }
  if (
    Object.values(state.effects).some(
      (candidate) =>
        candidate.id !== effect.id &&
        (candidate.txHash?.toLowerCase() === command.txHash.toLowerCase() ||
          candidate.attempts.some(
            ({ txHash }) =>
              txHash.toLowerCase() === command.txHash.toLowerCase(),
          )),
    )
  ) {
    throw new Error(
      "transaction hash is already bound to another keeper effect",
    );
  }
  const simulation = command.simulation;
  if (
    simulation.success !== true ||
    simulation.chainId !== state.config.chainId ||
    getAddress(simulation.to) !== state.config.orderBook ||
    simulation.input.toLowerCase() !== effect.calldata.toLowerCase() ||
    !Number.isSafeInteger(simulation.blockNumber) ||
    simulation.blockNumber < 0 ||
    !HASH.test(simulation.blockHash) ||
    simulation.blockHash.toLowerCase() !==
      command.canonicalSimulationBlockHash.toLowerCase() ||
    !Number.isSafeInteger(command.submittedAtBlock) ||
    command.submittedAtBlock < simulation.blockNumber ||
    !Number.isSafeInteger(command.transactionNonce) ||
    command.transactionNonce < 0 ||
    getAddress(command.transactionSender) !== command.transactionSender ||
    (effect.kind === "liquidation" &&
      simulation.blockNumber < effect.snapshot.blockNumber)
  ) {
    throw new Error(
      "keeper submission requires an exact successful chain simulation",
    );
  }
  assertRevision(state, command.expectedRevision);
  const next = structuredClone(state);
  next.effects[effect.id].txHash = command.txHash;
  next.effects[effect.id].submittedAtBlock = command.submittedAtBlock;
  next.effects[effect.id].transactionNonce = command.transactionNonce;
  next.effects[effect.id].transactionSender = command.transactionSender;
  next.effects[effect.id].simulation = structuredClone(simulation);
  next.effects[effect.id].status = "submitted";
  next.revision += 1;
  return { state: finish(next), duplicate: false };
}

export function reconcileKeeperSubmission(
  state: KeeperState,
  command: {
    expectedRevision: number;
    effectId: string;
    receipt: {
      status: string;
      transactionHash: Hex;
      blockNumber: number;
      blockHash: Hex;
    } | null;
    canonicalBlockHash: Hex | null;
    headBlock: number;
    requiredConfirmations: number;
    transaction?: { hash: Hex; chainId: number; to: string; input: Hex };
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
  if (!effect?.txHash) throw new Error("keeper effect has no submission");
  if (
    !Number.isSafeInteger(command.requiredConfirmations) ||
    command.requiredConfirmations < 1 ||
    command.requiredConfirmations > 100
  )
    throw new Error("invalid keeper confirmation requirement");
  if (
    effect.status === "confirmed" &&
    command.receipt &&
    command.canonicalBlockHash &&
    command.receipt.blockHash.toLowerCase() ===
      command.canonicalBlockHash.toLowerCase()
  ) {
    return { state, duplicate: true };
  }
  assertRevision(state, command.expectedRevision);
  const next = structuredClone(state);
  const nextEffect = next.effects[effect.id];
  const retry = (outcome: "failed" | "reorged") => {
    nextEffect.attempts.push({ txHash: nextEffect.txHash as Hex, outcome });
    delete nextEffect.txHash;
    delete nextEffect.receipt;
    delete nextEffect.simulation;
    delete nextEffect.submittedAtBlock;
    delete nextEffect.transactionNonce;
    delete nextEffect.transactionSender;
    nextEffect.status = "prepared";
    next.revision += 1;
    return { state: finish(next), duplicate: false };
  };
  if (!command.receipt) {
    const dropAfterBlocks = command.dropAfterBlocks ?? 20;
    if (
      !Number.isSafeInteger(dropAfterBlocks) ||
      dropAfterBlocks < 1 ||
      dropAfterBlocks > 1_000
    ) {
      throw new Error("invalid keeper dropped-transaction window");
    }
    if (!Number.isSafeInteger(command.headBlock) || command.headBlock < 0) {
      throw new Error("invalid keeper dropped-transaction head block");
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
      return { state, duplicate: true };
    }
    return retry("reorged");
  }
  if (
    command.receipt.transactionHash.toLowerCase() !==
    effect.txHash.toLowerCase()
  ) {
    throw new Error("keeper receipt transaction mismatch");
  }
  const canonical =
    command.canonicalBlockHash &&
    command.receipt.blockHash.toLowerCase() ===
      command.canonicalBlockHash.toLowerCase();
  if (!canonical) return retry("reorged");
  if (command.receipt.status !== "success") return retry("failed");
  if (
    !Number.isSafeInteger(command.receipt.blockNumber) ||
    command.receipt.blockNumber < 0 ||
    !Number.isSafeInteger(command.headBlock) ||
    command.headBlock < command.receipt.blockNumber
  ) {
    throw new Error("invalid keeper confirmation block range");
  }
  if (
    !command.transaction ||
    command.transaction.hash.toLowerCase() !== effect.txHash.toLowerCase() ||
    command.transaction.chainId !== state.config.chainId ||
    getAddress(command.transaction.to) !== state.config.orderBook ||
    command.transaction.input.toLowerCase() !== effect.calldata.toLowerCase()
  ) {
    throw new Error("keeper transaction does not execute the prepared effect");
  }
  if (effect.kind === "funding-checkpoint") {
    if (
      !command.event ||
      command.event.eventName !== "FundingCheckpoint" ||
      `${command.event.address}`.toLowerCase() !==
        state.config.orderBook.toLowerCase() ||
      `${command.event.cumulativeIndex}` !== "0" ||
      typeof command.event.updatedAt !== "bigint" ||
      command.event.updatedAt < BigInt(effect.checkpointAt) ||
      command.event.updatedAt >=
        BigInt(effect.checkpointAt + effect.intervalSeconds)
    ) {
      throw new Error("canonical funding event mismatch");
    }
  } else if (
    !command.event ||
    command.event.eventName !== "LiquidationExecuted" ||
    `${command.event.address}`.toLowerCase() !==
      state.config.orderBook.toLowerCase() ||
    `${command.event.lotId}` !== effect.lotId ||
    `${command.event.replacementOrderHash}`.toLowerCase() !==
      effect.replacementOrderId.toLowerCase() ||
    getAddress(`${command.event.target}`) !==
      getAddress(effect.replacement.target) ||
    getAddress(`${command.event.replacementMaker}`) !==
      getAddress(effect.replacement.maker) ||
    `${command.event.quantity}` !== effect.replacement.quantity ||
    `${command.event.markPrice}` !== effect.markPrice
  ) {
    throw new Error("canonical liquidation event mismatch");
  }
  const confirmations = command.headBlock - command.receipt.blockNumber + 1;
  nextEffect.receipt = command.receipt;
  nextEffect.status =
    confirmations >= command.requiredConfirmations ? "confirmed" : "included";
  next.revision += 1;
  return { state: finish(next), duplicate: false };
}

export const serializeKeeperState = (state: KeeperState) =>
  JSON.stringify(state);
export async function hydrateKeeperState(
  serialized: string,
  expectedConfig: KeeperConfig,
) {
  const state = JSON.parse(serialized) as KeeperState;
  const expectedOrderBook = getAddress(expectedConfig.orderBook);
  if (
    !state ||
    typeof state !== "object" ||
    state.config.chainId !== expectedConfig.chainId ||
    getAddress(state.config.orderBook) !== expectedOrderBook ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !state.effects ||
    typeof state.effects !== "object" ||
    !state.candidates ||
    typeof state.candidates !== "object"
  ) {
    throw new Error("invalid durable keeper state schema");
  }
  const transactionHashes = new Set<string>();
  for (const [id, effect] of Object.entries(state.effects)) {
    if (
      id !== effect.id ||
      effect.chainId !== state.config.chainId ||
      getAddress(effect.orderBook) !== expectedOrderBook ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(effect.calldata) ||
      !["prepared", "submitted", "included", "confirmed"].includes(
        effect.status,
      ) ||
      !Array.isArray(effect.attempts)
    ) {
      throw new Error("invalid durable keeper effect invariant");
    }
    const requiresSubmission = ["submitted", "included", "confirmed"].includes(
      effect.status,
    );
    const hasCompleteSubmission = Boolean(
      effect.txHash &&
      effect.transactionSender !== undefined &&
      Number.isSafeInteger(effect.submittedAtBlock) &&
      Number.isSafeInteger(effect.transactionNonce) &&
      effect.simulation,
    );
    if (
      (requiresSubmission && !hasCompleteSubmission) ||
      Boolean(effect.txHash) !== hasCompleteSubmission
    ) {
      throw new Error("durable keeper submission state mismatch");
    }
    if (hasCompleteSubmission) {
      const simulation = effect.simulation as ChainSimulation;
      if (
        getAddress(effect.transactionSender as Address) !==
          effect.transactionSender ||
        (effect.transactionNonce as number) < 0 ||
        simulation.success !== true ||
        simulation.chainId !== state.config.chainId ||
        getAddress(simulation.to) !== expectedOrderBook ||
        simulation.input.toLowerCase() !== effect.calldata.toLowerCase() ||
        !Number.isSafeInteger(simulation.blockNumber) ||
        simulation.blockNumber < 0 ||
        !HASH.test(simulation.blockHash) ||
        (effect.status === "submitted" && effect.receipt !== undefined) ||
        (["included", "confirmed"].includes(effect.status) && !effect.receipt)
      ) {
        throw new Error("durable keeper simulation or receipt mismatch");
      }
    }
    let expectedCalldata: Hex;
    if (effect.kind === "funding-checkpoint") {
      const expectedId = `funding:${state.config.chainId}:${state.config.orderBook.toLowerCase()}:${effect.checkpointAt}`;
      if (
        id !== expectedId ||
        effect.rateBps !== 0 ||
        !Number.isSafeInteger(effect.intervalSeconds) ||
        effect.intervalSeconds < 1 ||
        effect.checkpointAt % effect.intervalSeconds !== 0
      ) {
        throw new Error("durable funding effect economics mismatch");
      }
      expectedCalldata = encodeFunctionData({
        abi: KEEPER_ABI,
        functionName: "checkpointFunding",
        args: [0n],
      });
    } else {
      const replacement = effect.replacement;
      const message = {
        maker: getAddress(replacement.maker) as Address,
        target: getAddress(replacement.target) as Address,
        side: replacement.side,
        quantity: BigInt(replacement.quantity),
        limitPrice: BigInt(replacement.limitPrice),
        leverage: replacement.leverage,
        nonce: BigInt(replacement.nonce),
        deadline: BigInt(replacement.deadline),
      };
      const domain = {
        name: "BNBX Futures",
        version: "1",
        chainId: state.config.chainId,
        verifyingContract: getAddress(state.config.orderBook),
      };
      const replacementOrderId = hashTypedData({
        domain,
        types: LIQUIDATION_TYPES,
        primaryType: "LiquidationOrder",
        message,
      });
      const snapshot = effect.snapshot;
      const target = getAddress(replacement.target);
      const targetIsLong = getAddress(snapshot.lot.longTrader) === target;
      const targetIsShort = getAddress(snapshot.lot.shortTrader) === target;
      const survivor = targetIsLong
        ? getAddress(snapshot.lot.shortTrader)
        : getAddress(snapshot.lot.longTrader);
      if (
        replacementOrderId.toLowerCase() !==
          effect.replacementOrderId.toLowerCase() ||
        !(await verifyTypedData({
          address: message.maker,
          domain,
          types: LIQUIDATION_TYPES,
          primaryType: "LiquidationOrder",
          message,
          signature: replacement.signature as Hex,
        })) ||
        effect.snapshot.lot.id !== effect.lotId ||
        effect.snapshot.lot.remainingQuantity !== replacement.quantity ||
        effect.snapshot.oracleMarkPrice !== effect.markPrice ||
        effect.snapshot.oracleUpdatedAt !== effect.oracleUpdatedAt ||
        !Number.isSafeInteger(effect.oracleUpdatedAt) ||
        effect.oracleUpdatedAt < 0 ||
        !Number.isSafeInteger(snapshot.blockNumber) ||
        snapshot.blockNumber < 0 ||
        !HASH.test(snapshot.blockHash) ||
        !HASH.test(effect.canonicalSnapshotBlockHash) ||
        snapshot.blockHash.toLowerCase() !==
          effect.canonicalSnapshotBlockHash.toLowerCase() ||
        snapshot.marketState !== "Open" ||
        snapshot.nonceAvailable !== true ||
        !ADDRESS.test(snapshot.lot.longTrader) ||
        !ADDRESS.test(snapshot.lot.shortTrader) ||
        !UINT.test(snapshot.lot.remainingQuantity) ||
        !INT.test(snapshot.targetEquity) ||
        !UINT.test(snapshot.maintenanceRequirement) ||
        !UINT.test(snapshot.closeFee) ||
        !UINT.test(effect.markPrice) ||
        effect.markPrice === "0" ||
        ![0, 1].includes(replacement.side) ||
        ![1, 2, 3].includes(replacement.leverage) ||
        (!targetIsLong && !targetIsShort) ||
        replacement.side !== (targetIsLong ? 0 : 1) ||
        message.maker === target ||
        message.maker === survivor ||
        BigInt(snapshot.targetEquity) >=
          BigInt(snapshot.maintenanceRequirement) + BigInt(snapshot.closeFee) ||
        (targetIsLong &&
          BigInt(effect.markPrice) > BigInt(replacement.limitPrice)) ||
        (targetIsShort &&
          BigInt(effect.markPrice) < BigInt(replacement.limitPrice)) ||
        (effect.simulation &&
          effect.simulation.blockNumber < snapshot.blockNumber)
      ) {
        throw new Error("durable liquidation effect economics mismatch");
      }
      expectedCalldata = encodeFunctionData({
        abi: KEEPER_ABI,
        functionName: "liquidate",
        args: [BigInt(effect.lotId), message, replacement.signature as Hex],
      });
      const candidateId = id.startsWith("liquidation:")
        ? id.slice("liquidation:".length)
        : "";
      const expectedFingerprint = stable({
        lotId: effect.lotId,
        oracleUpdatedAt: effect.oracleUpdatedAt,
        markPrice: effect.markPrice,
        replacement,
        snapshot: effect.snapshot,
      });
      if (
        !candidateId ||
        state.candidates[candidateId] !== expectedFingerprint
      ) {
        throw new Error("durable liquidation candidate fingerprint mismatch");
      }
    }
    if (expectedCalldata.toLowerCase() !== effect.calldata.toLowerCase()) {
      throw new Error("durable keeper calldata mismatch");
    }
    for (const hash of [
      effect.txHash,
      ...effect.attempts.map(({ txHash }) => txHash),
    ]) {
      if (!hash) continue;
      const normalized = hash.toLowerCase();
      if (!HASH.test(hash) || transactionHashes.has(normalized)) {
        throw new Error("invalid or duplicate durable keeper transaction");
      }
      transactionHashes.add(normalized);
    }
  }
  return finish(state);
}
export async function commitKeeperState(
  persisted: string,
  expectedRevision: number,
  nextState: KeeperState,
) {
  const current = await hydrateKeeperState(persisted, nextState.config);
  await hydrateKeeperState(serializeKeeperState(nextState), nextState.config);
  if (
    current.revision !== expectedRevision ||
    nextState.revision !== expectedRevision + 1
  ) {
    throw new Error("keeper durable compare-and-swap revision conflict");
  }
  return serializeKeeperState(nextState);
}

export async function persistKeeperStateAtomic(
  store: {
    compareAndSwap(
      expectedRevision: number,
      serialized: string,
    ): Promise<boolean>;
  },
  persisted: string,
  expectedRevision: number,
  nextState: KeeperState,
) {
  const serialized = await commitKeeperState(
    persisted,
    expectedRevision,
    nextState,
  );
  if (!(await store.compareAndSwap(expectedRevision, serialized))) {
    throw new Error("atomic keeper state persistence conflict");
  }
  return serialized;
}
