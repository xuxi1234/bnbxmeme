export const CHAIN_INDEX_VERSION = 3 as const;
export const DEFAULT_INDEX_BLOCK_SPAN = 100_000n;

export type IndexedTrade = {
  id: string;
  side: "buy" | "sell";
  source: "curve" | "pancake";
  account: `0x${string}`;
  bnb: string;
  priceBNB: string;
  tokens: string;
  timestamp: number;
  blockNumber: string;
  transactionHash: `0x${string}`;
};

export type ChainIndexState = {
  version: typeof CHAIN_INDEX_VERSION;
  complete: boolean;
  factory: `0x${string}`;
  token: `0x${string}`;
  curve: `0x${string}`;
  pair: `0x${string}` | null;
  deploymentBlock: string;
  latestBlock: string;
  holderBalances: Record<string, string>;
  graduatedAt: number | null;
};

export type ChainIndexIdentity = Pick<
  ChainIndexState,
  "factory" | "token" | "curve" | "pair" | "deploymentBlock"
>;

export type TransferDelta = {
  from?: `0x${string}` | null;
  to?: `0x${string}` | null;
  value: string;
};

export type IndexedTokenTransfer = TransferDelta & {
  transactionHash: `0x${string}`;
  logIndex: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameAddress(left: string | null, right: string | null) {
  return left?.toLowerCase() === right?.toLowerCase();
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type OfficialMarketPairResolution =
  | { status: "ok"; pair: `0x${string}` | null }
  | {
      status: "mismatch";
      reason: "PAIR_NOT_ACTIVE" | "PAIR_MISMATCH";
    }
  | {
      status: "unavailable";
      reason: "INVALID_CURVE_STATE" | "OFFICIAL_PAIR_MISSING";
    };

export function resolveOfficialMarketPair({
  state,
  officialPair,
  requestedPair,
}: {
  state: number;
  officialPair: `0x${string}`;
  requestedPair: `0x${string}` | null;
}): OfficialMarketPairResolution {
  if (state !== 0 && state !== 1 && state !== 2) {
    return { status: "unavailable", reason: "INVALID_CURVE_STATE" } as const;
  }

  if (state !== 2) {
    return requestedPair
      ? { status: "mismatch", reason: "PAIR_NOT_ACTIVE" as const }
      : { status: "ok", pair: null };
  }

  if (sameAddress(officialPair, ZERO_ADDRESS)) {
    return { status: "unavailable", reason: "OFFICIAL_PAIR_MISSING" } as const;
  }
  if (requestedPair && !sameAddress(requestedPair, officialPair)) {
    return { status: "mismatch", reason: "PAIR_MISMATCH" } as const;
  }
  return { status: "ok", pair: officialPair };
}

export function isExpectedWrappedPair({
  token0,
  token1,
  token,
  wrappedNative,
}: {
  token0: `0x${string}`;
  token1: `0x${string}`;
  token: `0x${string}`;
  wrappedNative: `0x${string}`;
}) {
  return (
    (sameAddress(token0, token) && sameAddress(token1, wrappedNative)) ||
    (sameAddress(token1, token) && sameAddress(token0, wrappedNative))
  );
}

function isUnsignedInteger(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

export function isCompatibleIndexState(
  value: unknown,
  identity: ChainIndexIdentity,
): value is ChainIndexState {
  if (!isRecord(value) || value.version !== CHAIN_INDEX_VERSION) return false;
  if (
    typeof value.complete !== "boolean" ||
    typeof value.factory !== "string" ||
    typeof value.token !== "string" ||
    typeof value.curve !== "string" ||
    (value.pair !== null && typeof value.pair !== "string") ||
    value.deploymentBlock !== identity.deploymentBlock ||
    !isUnsignedInteger(value.latestBlock) ||
    !isRecord(value.holderBalances) ||
    (value.graduatedAt !== null && typeof value.graduatedAt !== "number")
  ) {
    return false;
  }

  return (
    sameAddress(value.factory, identity.factory) &&
    sameAddress(value.token, identity.token) &&
    sameAddress(value.curve, identity.curve) &&
    sameAddress(value.pair, identity.pair) &&
    Object.values(value.holderBalances).every(isUnsignedInteger)
  );
}

export function resolveScanWindow({
  deploymentBlock,
  checkpointBlock,
  chainHead,
  maxBlocks = DEFAULT_INDEX_BLOCK_SPAN,
}: {
  deploymentBlock: bigint;
  checkpointBlock: bigint | null;
  chainHead: bigint;
  maxBlocks?: bigint;
}) {
  if (maxBlocks <= 0n) throw new Error("Index span must be positive");
  if (deploymentBlock > chainHead) {
    throw new Error("Factory deployment block is ahead of the chain head");
  }

  const fromBlock =
    checkpointBlock === null ? deploymentBlock : checkpointBlock + 1n;
  if (fromBlock > chainHead) {
    return {
      shouldScan: false,
      fromBlock,
      toBlock: chainHead,
      complete: true,
    };
  }

  const cappedEnd = fromBlock + maxBlocks - 1n;
  const toBlock = cappedEnd < chainHead ? cappedEnd : chainHead;
  return {
    shouldScan: true,
    fromBlock,
    toBlock,
    complete: toBlock === chainHead,
  };
}

export function mergeIndexedTrades(
  existing: IndexedTrade[],
  incoming: IndexedTrade[],
) {
  const unique = new Map(existing.map((trade) => [trade.id, trade]));
  for (const trade of incoming) unique.set(trade.id, trade);
  return [...unique.values()].sort((left, right) => {
    const leftBlock = BigInt(left.blockNumber);
    const rightBlock = BigInt(right.blockNumber);
    if (leftBlock === rightBlock) {
      const leftSeparator = left.id.lastIndexOf("-");
      const rightSeparator = right.id.lastIndexOf("-");
      const leftLogIndex = left.id.slice(leftSeparator + 1);
      const rightLogIndex = right.id.slice(rightSeparator + 1);
      if (
        leftSeparator >= 0 &&
        rightSeparator >= 0 &&
        isUnsignedInteger(leftLogIndex) &&
        isUnsignedInteger(rightLogIndex)
      ) {
        const leftIndex = BigInt(leftLogIndex);
        const rightIndex = BigInt(rightLogIndex);
        if (leftIndex !== rightIndex) return leftIndex < rightIndex ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    }
    return leftBlock < rightBlock ? -1 : 1;
  });
}

export function applyTransferDeltas(
  existing: Record<string, string>,
  transfers: TransferDelta[],
) {
  const balances = new Map<string, bigint>(
    Object.entries(existing).map(([address, balance]) => [
      address.toLowerCase(),
      BigInt(balance),
    ]),
  );

  for (const transfer of transfers) {
    const value = BigInt(transfer.value);
    if (transfer.from) {
      const from = transfer.from.toLowerCase();
      balances.set(from, (balances.get(from) ?? 0n) - value);
    }
    if (transfer.to) {
      const to = transfer.to.toLowerCase();
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
  }

  return Object.fromEntries(
    [...balances.entries()]
      .filter(([, balance]) => balance !== 0n)
      .map(([address, balance]) => [address, balance.toString()]),
  );
}

export function resolveSwapAccount({
  transactionHash,
  swapLogIndex,
  side,
  pair,
  tokenAmount,
  fallbackRecipient,
  transfers,
}: {
  transactionHash: `0x${string}`;
  swapLogIndex: number;
  side: "buy" | "sell";
  pair: `0x${string}`;
  tokenAmount: string;
  fallbackRecipient?: `0x${string}` | null;
  transfers: IndexedTokenTransfer[];
}) {
  const pairAddress = pair.toLowerCase();
  const fallbackAddress = fallbackRecipient?.toLowerCase();
  const candidates = transfers
    .filter(
      (transfer) =>
        transfer.transactionHash.toLowerCase() ===
          transactionHash.toLowerCase() &&
        transfer.logIndex < swapLogIndex &&
        (side === "buy"
          ? transfer.from?.toLowerCase() === pairAddress
          : transfer.to?.toLowerCase() === pairAddress),
    )
    .flatMap((transfer) => {
      try {
        const account = side === "buy" ? transfer.to : transfer.from;
        if (
          !account ||
          account.toLowerCase() === pairAddress ||
          account.toLowerCase() === "0x0000000000000000000000000000000000000000"
        ) {
          return [];
        }
        return [
          {
            account,
            exactAmount: BigInt(transfer.value) === BigInt(tokenAmount),
            fallbackMatch:
              side === "buy" && transfer.to?.toLowerCase() === fallbackAddress,
            logIndex: transfer.logIndex,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((left, right) => {
      if (left.exactAmount !== right.exactAmount) {
        return left.exactAmount ? -1 : 1;
      }
      if (left.fallbackMatch !== right.fallbackMatch) {
        return left.fallbackMatch ? -1 : 1;
      }
      return right.logIndex - left.logIndex;
    });

  if (candidates[0]) return candidates[0].account;
  if (
    side === "buy" &&
    fallbackRecipient &&
    fallbackAddress !== pairAddress &&
    fallbackAddress !== "0x0000000000000000000000000000000000000000"
  ) {
    return fallbackRecipient;
  }
  return null;
}

export function materializeHolders(
  balances: Record<string, string>,
  excludedAddresses: Array<string | null | undefined>,
  limit = 50,
) {
  const excluded = new Set(
    excludedAddresses
      .filter((address): address is string => Boolean(address))
      .map((address) => address.toLowerCase()),
  );
  const all = Object.entries(balances)
    .filter(
      ([address, balance]) =>
        BigInt(balance) > 0n && !excluded.has(address.toLowerCase()),
    )
    .map(([address, balance]) => ({
      address: address as `0x${string}`,
      balance,
    }))
    .sort((left, right) => {
      const leftBalance = BigInt(left.balance);
      const rightBalance = BigInt(right.balance);
      if (leftBalance === rightBalance) {
        return left.address.localeCompare(right.address);
      }
      return leftBalance > rightBalance ? -1 : 1;
    });
  const holderSupply = all.reduce(
    (sum, holder) => sum + BigInt(holder.balance),
    0n,
  );
  const top10Balance = all
    .slice(0, 10)
    .reduce((sum, holder) => sum + BigInt(holder.balance), 0n);
  const top10ConcentrationPct =
    holderSupply > 0n
      ? Number((top10Balance * 1_000_000n) / holderSupply) / 10_000
      : null;

  return {
    holders: all.slice(0, limit),
    holderCount: all.length,
    holdersLimited: all.length > limit,
    holderSupply: holderSupply.toString(),
    top10ConcentrationPct,
  };
}

const PRICE_DECIMAL_SCALE = 1_000_000_000_000_000_000n;
const TOKENS_PER_PRICE_UNIT = 1_000_000n;

export function pricePerMillionBnb(
  bnbReserveWei: bigint,
  tokenReserveWei: bigint,
) {
  if (bnbReserveWei <= 0n || tokenReserveWei <= 0n) return null;
  const scaledPrice =
    (bnbReserveWei * TOKENS_PER_PRICE_UNIT * PRICE_DECIMAL_SCALE) /
    tokenReserveWei;
  return Number(scaledPrice) / Number(PRICE_DECIMAL_SCALE);
}

export function verifiedReservePrice(snapshot: unknown) {
  if (!isRecord(snapshot) || snapshot.priceSource !== "reserve") return null;
  const value = snapshot.pricePerMillionBnb;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function tradePricePerMillionBnb(trade: IndexedTrade | undefined) {
  if (!trade) return null;
  return pricePerMillionBnb(BigInt(trade.priceBNB), BigInt(trade.tokens));
}

export function summarizeTrades(
  trades: IndexedTrade[],
  source: IndexedTrade["source"],
  cutoffTimestamp: number,
) {
  const sourceTrades = trades.filter((trade) => trade.source === source);
  const recent = sourceTrades.filter(
    (trade) => trade.timestamp >= cutoffTimestamp,
  );
  const latest = recent.at(-1) ?? sourceTrades.at(-1);
  const oldestRecent = recent[0];
  const latestPricePerMillionBnb = tradePricePerMillionBnb(latest);
  const oldestPricePerMillionBnb = tradePricePerMillionBnb(oldestRecent);
  const priceChange24h =
    latestPricePerMillionBnb !== null &&
    oldestPricePerMillionBnb !== null &&
    oldestPricePerMillionBnb > 0
      ? ((latestPricePerMillionBnb - oldestPricePerMillionBnb) /
          oldestPricePerMillionBnb) *
        100
      : null;

  return {
    latestPricePerMillionBnb,
    volume24hBnb: recent.reduce(
      (sum, trade) => sum + Number(BigInt(trade.bnb)) / 1e18,
      0,
    ),
    priceChange24h,
    buys24h: recent.filter((trade) => trade.side === "buy").length,
    sells24h: recent.filter((trade) => trade.side === "sell").length,
  };
}

export function canServeStaleIndex(state: ChainIndexState | null) {
  return state?.complete === true;
}

export function indexCoversCheckpoint(
  state: ChainIndexState | null,
  checkpoint: bigint,
) {
  return state !== null && BigInt(state.latestBlock) >= checkpoint;
}

export function exactCheckpointFilter(checkpoint: string) {
  if (!isUnsignedInteger(checkpoint)) {
    throw new Error("Invalid cache checkpoint");
  }
  return `eq.${checkpoint}`;
}
