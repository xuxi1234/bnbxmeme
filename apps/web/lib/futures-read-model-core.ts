import {
  encodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";

const ORACLE_ABI = [
  {
    type: "function",
    name: "safeRead",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "state", type: "uint8" },
      { name: "markPriceWad", type: "uint256" },
      { name: "twapBnbPerTokenWad", type: "uint256" },
      { name: "bnbUsdWad", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
] as const;

const ORDER_BOOK_ABI = [
  {
    type: "function",
    name: "cumulativeFundingIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int256" }],
  },
  {
    type: "function",
    name: "fundingUpdatedAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "cancelled",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "activeLotCount",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "activeLotId",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint8" }],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "lots",
    stateMutability: "view",
    inputs: [{ type: "uint64" }],
    outputs: [
      { name: "id", type: "uint64" },
      { name: "longTrader", type: "address" },
      { name: "shortTrader", type: "address" },
      { name: "remainingQuantity", type: "uint128" },
      { name: "entryPrice", type: "uint128" },
      { name: "longMargin", type: "uint256" },
      { name: "shortMargin", type: "uint256" },
      { name: "remainingOpenInterest", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "lotFundingCheckpoint",
    stateMutability: "view",
    inputs: [{ type: "uint64" }],
    outputs: [{ type: "int256" }, { type: "uint64" }],
  },
] as const;

export const CLEARING_HOUSE_INTENT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

export type FuturesReadClient = {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  readContract(request: Record<string, unknown>): Promise<unknown>;
  multicall(input: {
    contracts: Array<Record<string, unknown>>;
    allowFailure: true;
  }): Promise<Array<{ status: string; result?: unknown }>>;
};

function fail(message: string): never {
  throw new Error(message);
}

const number = (value: unknown, message: string) => {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || (normalized as number) < 0)
    fail(message);
  return normalized as number;
};

const bigint = (value: unknown, message: string) => {
  if (typeof value !== "bigint") fail(message);
  return value as bigint;
};

const ceilDiv = (value: bigint, denominator: bigint) =>
  value === 0n ? 0n : (value + denominator - 1n) / denominator;

export function createFuturesReadModel(input: {
  client: FuturesReadClient;
  oracle: Address;
  orderBook: Address;
  clearingHouse: Address;
  now?: () => number;
}) {
  const client = input.client;
  const oracle = getAddress(input.oracle);
  const orderBook = getAddress(input.orderBook);
  const clearingHouse = getAddress(input.clearingHouse);
  const now = input.now ?? (() => Math.floor(Date.now() / 1_000));

  async function ensureChain() {
    if ((await client.getChainId()) !== 97) fail("read model chain must be 97");
  }

  async function readMarketStatus() {
    await ensureChain();
    const [oracleValue, fundingValue, fundingUpdatedValue] = await Promise.all([
      client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "safeRead" }),
      client.readContract({
        address: orderBook,
        abi: ORDER_BOOK_ABI,
        functionName: "cumulativeFundingIndex",
      }),
      client.readContract({
        address: orderBook,
        abi: ORDER_BOOK_ABI,
        functionName: "fundingUpdatedAt",
      }),
    ]);
    if (!Array.isArray(oracleValue) || oracleValue.length !== 5)
      fail("invalid oracle response");
    const oracleResult = oracleValue as unknown[];
    const state = number(oracleResult[0], "invalid oracle state");
    if (state !== 0 && state !== 1) fail("invalid oracle state");
    return {
      marketState: state === 1 ? ("Open" as const) : ("CloseOnly" as const),
      markPrice: bigint(oracleResult[1], "invalid oracle mark").toString(),
      oracleUpdatedAt: number(oracleResult[4], "invalid oracle timestamp"),
      fundingIndex: bigint(fundingValue, "invalid funding index").toString(),
      fundingUpdatedAt: number(fundingUpdatedValue, "invalid funding timestamp"),
    };
  }

  async function readOrderCancelled(orderId: Hex) {
    await ensureChain();
    if (!/^0x[0-9a-fA-F]{64}$/.test(orderId)) fail("invalid order id");
    const value = await client.readContract({
      address: orderBook,
      abi: ORDER_BOOK_ABI,
      functionName: "cancelled",
      args: [orderId],
    });
    if (typeof value !== "boolean") fail("invalid cancellation response");
    return value;
  }

  async function readCollateralIntent(
    wallet: Address,
    action: "deposit" | "withdraw",
    amount: string,
  ) {
    getAddress(wallet);
    if (!/^[1-9][0-9]{0,39}$/.test(amount)) fail("invalid collateral amount");
    await ensureChain();
    const calldata = encodeFunctionData({
      abi: CLEARING_HOUSE_INTENT_ABI,
      functionName: action,
      args: [BigInt(amount)],
    });
    return {
      action,
      amount,
      to: clearingHouse,
      calldata,
      expiresAt: now() + 120,
      abi: CLEARING_HOUSE_INTENT_ABI,
    };
  }

  async function readPositions(wallet: Address, limit: number) {
    const trader = getAddress(wallet);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8)
      fail("position limit must be between one and eight");
    await ensureChain();
    const [market, countValue] = await Promise.all([
      readMarketStatus(),
      client.readContract({
        address: orderBook,
        abi: ORDER_BOOK_ABI,
        functionName: "activeLotCount",
        args: [trader],
      }),
    ]);
    const count = Math.min(number(countValue, "invalid active lot count"), limit);
    if (count === 0) return [];
    const idResults = await client.multicall({
      allowFailure: true,
      contracts: Array.from({ length: count }, (_, index) => ({
        address: orderBook,
        abi: ORDER_BOOK_ABI,
        functionName: "activeLotId",
        args: [trader, index],
      })),
    });
    if (idResults.length !== count || idResults.some((result) => result.status !== "success"))
      fail("active lot ids are unavailable");
    const ids = idResults.map((result) => bigint(result.result, "invalid active lot id"));
    const details = await client.multicall({
      allowFailure: true,
      contracts: ids.flatMap((id) => [
        { address: orderBook, abi: ORDER_BOOK_ABI, functionName: "lots", args: [id] },
        {
          address: orderBook,
          abi: ORDER_BOOK_ABI,
          functionName: "lotFundingCheckpoint",
          args: [id],
        },
      ]),
    });
    if (details.length !== ids.length * 2 || details.some((result) => result.status !== "success"))
      fail("active lot details are unavailable");
    const mark = BigInt(market.markPrice);
    return ids.map((id, index) => {
      const lot = details[index * 2].result;
      if (!Array.isArray(lot) || lot.length !== 8) fail("invalid active lot");
      const lotResult = lot as unknown[];
      const longTrader = getAddress(`${lotResult[1]}`);
      const shortTrader = getAddress(`${lotResult[2]}`);
      if (trader !== longTrader && trader !== shortTrader)
        fail("active lot is outside the requested wallet");
      const side = trader === longTrader ? 0 : 1;
      const quantity = bigint(lotResult[3], "invalid lot quantity");
      const entry = bigint(lotResult[4], "invalid lot entry price");
      const margin = bigint(lotResult[side === 0 ? 5 : 6], "invalid lot margin");
      const notional = (quantity * mark) / 10n ** 18n;
      const magnitude = (quantity * (mark >= entry ? mark - entry : entry - mark)) / 10n ** 18n;
      const longPnl = mark >= entry ? magnitude : -magnitude;
      const pnl = side === 0 ? longPnl : -longPnl;
      const equity = BigInt(margin) + pnl;
      const maintenance = ceilDiv(notional * 2_000n, 10_000n);
      const closingFee = ceilDiv(notional * 100n, 10_000n);
      const requirement = maintenance + closingFee;
      const liquidatable = equity < BigInt(requirement);
      const marginRatioBps = notional === 0n || equity <= 0n ? 0n : (equity * 10_000n) / notional;
      return {
        positionId: keccak256(encodePacked(["address", "uint64"], [orderBook, id])),
        side,
        quantity: quantity.toString(),
        entryPrice: entry.toString(),
        markPrice: mark.toString(),
        margin: margin.toString(),
        equity: equity.toString(),
        maintenanceRequirement: requirement.toString(),
        marginRatioBps: marginRatioBps.toString(),
        liquidationPrice: "0",
        fundingAccrued: "0",
        liquidatable,
      };
    });
  }

  async function readKeeperHealth(lastSuccessfulRun: number | null) {
    await ensureChain();
    const headBlock = number(await client.getBlockNumber(), "invalid head block");
    const last = lastSuccessfulRun ?? 0;
    const lagBlocks = last === 0 ? headBlock : Math.max(0, headBlock - last);
    return {
      status: lagBlocks <= 20 ? ("healthy" as const) : ("degraded" as const),
      lastFundingCheckpoint: last,
      lastLiquidationScan: last,
      headBlock,
      lagBlocks,
    };
  }

  return {
    readMarketStatus,
    readOrderCancelled,
    readCollateralIntent,
    readPositions,
    readKeeperHealth,
  };
}
