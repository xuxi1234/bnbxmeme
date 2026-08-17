import {
  decodeEventLog,
  getAddress,
  keccak256,
  parseTransaction,
  type Address,
  type Hex,
} from "viem";

const ORDERS_MATCHED_ABI = [
  {
    type: "event",
    name: "OrdersMatched",
    inputs: [
      { name: "makerOrderHash", type: "bytes32", indexed: true },
      { name: "takerOrderHash", type: "bytes32", indexed: true },
      { name: "fillQuantity", type: "uint128", indexed: false },
      { name: "executionPrice", type: "uint128", indexed: false },
    ],
  },
] as const;

export type PreparedMatchEffect = {
  id: Hex;
  kind: "submit-match";
  status: "prepared" | "submitted" | "included" | "confirmed" | "failed" | "reorged";
  calldata: Hex;
  makerOrderId: Hex;
  takerOrderId: Hex;
  quantity: string;
  price: string;
  transactionSender?: Address;
};

type RelayerAccount = {
  address: Address;
  signTransaction(request: Record<string, unknown>): Promise<Hex>;
};

type RelayerClient = {
  getChainId(): Promise<number>;
  getBytecode(input: { address: Address }): Promise<Hex | undefined>;
  getBalance(input: { address: Address }): Promise<bigint>;
  getTransactionCount(input: {
    address: Address;
    blockTag: "pending";
  }): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  prepareTransactionRequest(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  sendRawTransaction(input: { serializedTransaction: Hex }): Promise<Hex>;
  getTransaction(input: { hash: Hex }): Promise<unknown>;
  getTransactionReceipt(input: { hash: Hex }): Promise<unknown>;
  getBlock(input: { blockNumber: bigint }): Promise<unknown>;
};

const HASH = /^0x[0-9a-fA-F]{64}$/;
const BYTES = /^0x(?:[0-9a-fA-F]{2})+$/;

function fail(message: string): never {
  throw new Error(message);
}

const object = (value: unknown, message: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(message);
  return value as Record<string, unknown>;
};

const safeNumber = (value: unknown, message: string) => {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || (normalized as number) < 0)
    fail(message);
  return normalized as number;
};

const exactHash = (value: unknown, message: string) => {
  if (typeof value !== "string" || !HASH.test(value)) fail(message);
  return value as Hex;
};

function validateEffect(effect: PreparedMatchEffect) {
  if (effect.kind !== "submit-match") fail("relayer accepts only a match effect");
  if (effect.status !== "prepared") fail("relayer accepts only a prepared effect");
  if (!BYTES.test(effect.calldata)) fail("invalid prepared match calldata");
  exactHash(effect.id, "invalid match effect id");
  exactHash(effect.makerOrderId, "invalid maker order id");
  exactHash(effect.takerOrderId, "invalid taker order id");
  if (!/^[1-9][0-9]*$/.test(effect.quantity) || !/^[1-9][0-9]*$/.test(effect.price))
    fail("invalid prepared match economics");
}

export function createFuturesRelayer(input: {
  account: RelayerAccount;
  orderBook: Address;
  client: RelayerClient;
}) {
  const account = input.account;
  const orderBook = getAddress(input.orderBook);
  const client = input.client;

  async function preflight() {
    const chainId = await client.getChainId();
    if (chainId !== 97) fail("relayer chain must be BSC Testnet 97");
    const bytecode = await client.getBytecode({ address: orderBook });
    if (!bytecode || bytecode === "0x") fail("OrderBook bytecode is unavailable");
    const balance = await client.getBalance({ address: account.address });
    if (balance <= 0n) fail("relayer tBNB balance is empty");
    return { chainId: 97 as const, orderBook, sender: account.address, balance };
  }

  async function prepare(effect: PreparedMatchEffect) {
    validateEffect(effect);
    await preflight();
    const [nonce, head] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.getBlockNumber(),
    ]);
    if (!Number.isSafeInteger(nonce) || nonce < 0) fail("invalid relayer nonce");
    const prepared = await client.prepareTransactionRequest({
      account,
      chainId: 97,
      to: orderBook,
      data: effect.calldata,
      nonce,
      value: 0n,
    });
    const signable = { ...prepared };
    delete signable.account;
    if (
      signable.chainId !== 97 ||
      getAddress(`${signable.to}`) !== orderBook ||
      `${signable.data}`.toLowerCase() !== effect.calldata.toLowerCase() ||
      signable.nonce !== nonce
    )
      fail("prepared transaction changed exact match calldata");
    const raw = await account.signTransaction(signable);
    if (!BYTES.test(raw)) fail("invalid signed transaction bytes");
    const parsed = parseTransaction(raw);
    if (
      parsed.chainId !== 97 ||
      !parsed.to ||
      getAddress(parsed.to) !== orderBook ||
      (parsed.data ?? "0x").toLowerCase() !== effect.calldata.toLowerCase() ||
      Number(parsed.nonce) !== nonce
    )
      fail("signed transaction changed exact match calldata");
    return {
      hash: keccak256(raw),
      raw,
      nonce,
      sender: account.address,
      submittedAtBlock: safeNumber(head, "invalid relayer head block"),
    };
  }

  async function broadcast(raw: Hex) {
    if (!BYTES.test(raw)) fail("invalid signed transaction bytes");
    const expected = keccak256(raw);
    const returned = await client.sendRawTransaction({ serializedTransaction: raw });
    if (returned.toLowerCase() !== expected.toLowerCase())
      fail("broadcast transaction hash mismatch");
    return expected;
  }

  async function inspect(hash: Hex, effect: PreparedMatchEffect) {
    exactHash(hash, "invalid transaction hash");
    if (effect.kind !== "submit-match") fail("relayer accepts only a match effect");
    const [transactionValue, receiptValue, head] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
      client.getBlockNumber(),
    ]);
    if (!transactionValue && !receiptValue) {
      return {
        status: "pending" as const,
        transactionPresent: false,
        headBlock: safeNumber(head, "invalid relayer head block"),
      };
    }
    const transaction = object(transactionValue, "transaction is unavailable");
    const expectedSender = effect.transactionSender
      ? getAddress(effect.transactionSender)
      : account.address;
    if (
      exactHash(transaction.hash, "transaction hash mismatch").toLowerCase() !==
        hash.toLowerCase() ||
      transaction.chainId !== 97 ||
      getAddress(`${transaction.from}`) !== expectedSender ||
      getAddress(`${transaction.to}`) !== orderBook ||
      `${transaction.input}`.toLowerCase() !== effect.calldata.toLowerCase()
    )
      fail("transaction calldata or identity mismatch");
    if (!receiptValue) {
      return {
        status: "pending" as const,
        transactionPresent: true,
        headBlock: safeNumber(head, "invalid relayer head block"),
      };
    }
    const receipt = object(receiptValue, "invalid transaction receipt");
    const receiptHash = exactHash(receipt.transactionHash, "receipt hash mismatch");
    if (receiptHash.toLowerCase() !== hash.toLowerCase()) fail("receipt hash mismatch");
    const blockNumber = safeNumber(receipt.blockNumber, "invalid receipt block");
    const receiptBlockHash = exactHash(receipt.blockHash, "invalid receipt block hash");
    const block = object(
      await client.getBlock({ blockNumber: BigInt(blockNumber) }),
      "canonical block is unavailable",
    );
    const canonicalBlockHash = exactHash(block.hash, "invalid canonical block hash");
    if (canonicalBlockHash.toLowerCase() !== receiptBlockHash.toLowerCase()) {
      return {
        status: "reorged" as const,
        transactionPresent: true,
        headBlock: safeNumber(head, "invalid relayer head block"),
        receipt: {
          status: `${receipt.status}`,
          transactionHash: receiptHash,
          blockNumber,
          blockHash: receiptBlockHash,
        },
        canonicalBlockHash,
      };
    }
    if (!Array.isArray(receipt.logs)) fail("receipt logs are unavailable");
    for (const rawLog of receipt.logs as unknown[]) {
      const log = object(rawLog, "invalid receipt log");
      if (getAddress(`${log.address}`) !== orderBook || !Array.isArray(log.topics))
        continue;
      try {
        const decoded = decodeEventLog({
          abi: ORDERS_MATCHED_ABI,
          eventName: "OrdersMatched",
          topics: log.topics as [Hex, ...Hex[]],
          data: `${log.data}` as Hex,
          strict: true,
        });
        const args = decoded.args;
        if (
          args.makerOrderHash.toLowerCase() !== effect.makerOrderId.toLowerCase() ||
          args.takerOrderHash.toLowerCase() !== effect.takerOrderId.toLowerCase() ||
          args.fillQuantity.toString() !== effect.quantity ||
          args.executionPrice.toString() !== effect.price
        )
          fail("OrdersMatched event changed prepared economics");
        return {
          status: "included" as const,
          transactionPresent: true,
          headBlock: safeNumber(head, "invalid relayer head block"),
          transaction: {
            hash,
            chainId: 97,
            from: expectedSender,
            to: orderBook,
            input: effect.calldata,
          },
          receipt: {
            status: `${receipt.status}`,
            transactionHash: receiptHash,
            blockNumber,
            blockHash: receiptBlockHash,
          },
          canonicalBlockHash,
          logIndex: safeNumber(log.logIndex, "invalid event log index"),
          event: {
            eventName: "OrdersMatched" as const,
            address: orderBook,
            makerOrderHash: args.makerOrderHash,
            takerOrderHash: args.takerOrderHash,
            fillQuantity: args.fillQuantity.toString(),
            executionPrice: args.executionPrice.toString(),
          },
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("changed prepared"))
          throw error;
      }
    }
    fail("canonical OrdersMatched event is missing");
  }

  return { preflight, prepare, broadcast, inspect };
}
