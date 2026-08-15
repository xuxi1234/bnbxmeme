import { getAddress } from "viem";

export const FUTURES_API_RESOURCES = [
  "market-status",
  "orders",
  "cancellations",
  "fills",
  "positions",
  "collateral-intents",
  "keeper-health",
] as const;

export type FuturesApiResource = (typeof FUTURES_API_RESOURCES)[number];
export type FuturesLocale = "zh" | "en" | "ko" | "ja";
export type FuturesApiCode =
  | "invalid_resource"
  | "method_not_allowed"
  | "invalid_schema"
  | "wrong_chain"
  | "wrong_domain"
  | "writes_disabled"
  | "unauthorized"
  | "rate_limited"
  | "rpc_bound_exceeded"
  | "rpc_timeout"
  | "service_unavailable"
  | "request_rejected"
  | "response_too_large";

export class FuturesApiError extends Error {
  code: FuturesApiCode;
  status: number;

  constructor(code: FuturesApiCode, status: number, message: string = code) {
    super(message);
    this.name = "FuturesApiError";
    this.code = code;
    this.status = status;
  }
}

const messages: Record<FuturesLocale, Record<FuturesApiCode, string>> = {
  zh: {
    invalid_resource: "无效的合约接口资源。",
    method_not_allowed: "此接口不支持该请求方式。",
    invalid_schema: "请求字段或格式无效。",
    wrong_chain: "请切换到 BSC 测试网。",
    wrong_domain: "订单签名域与当前测试合约不一致。",
    writes_disabled: "当前环境已禁用合约写入。",
    unauthorized: "钱包身份验证已失效，请重新签名。",
    rate_limited: "请求过于频繁，请稍后重试。",
    rpc_bound_exceeded: "链上读取数量超过安全上限。",
    rpc_timeout: "测试网节点响应超时。",
    service_unavailable: "合约服务暂时不可用。",
    request_rejected: "请求被测试网合约服务拒绝。",
    response_too_large: "服务响应超过安全大小限制。",
  },
  en: {
    invalid_resource: "Invalid Futures API resource.",
    method_not_allowed: "This method is not supported for the resource.",
    invalid_schema: "The request fields or format are invalid.",
    wrong_chain: "Switch to BSC Testnet.",
    wrong_domain:
      "The order signature domain does not match the test contract.",
    writes_disabled: "Futures writes are disabled in this environment.",
    unauthorized: "Wallet authentication expired. Sign in again.",
    rate_limited: "Too many requests. Try again shortly.",
    rpc_bound_exceeded: "The request exceeds the safe RPC call limit.",
    rpc_timeout: "The testnet RPC timed out.",
    service_unavailable: "The Futures service is temporarily unavailable.",
    request_rejected:
      "The request was rejected by the testnet Futures service.",
    response_too_large: "The service response exceeds the safe size limit.",
  },
  ko: {
    invalid_resource: "잘못된 선물 API 리소스입니다.",
    method_not_allowed: "이 리소스에서 지원하지 않는 요청 방식입니다.",
    invalid_schema: "요청 필드 또는 형식이 잘못되었습니다.",
    wrong_chain: "BSC 테스트넷으로 전환하세요.",
    wrong_domain: "주문 서명 도메인이 테스트 계약과 일치하지 않습니다.",
    writes_disabled: "현재 환경에서는 선물 쓰기가 비활성화되어 있습니다.",
    unauthorized: "지갑 인증이 만료되었습니다. 다시 서명하세요.",
    rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    rpc_bound_exceeded: "안전한 RPC 호출 한도를 초과했습니다.",
    rpc_timeout: "테스트넷 RPC 응답 시간이 초과되었습니다.",
    service_unavailable: "선물 서비스를 일시적으로 사용할 수 없습니다.",
    request_rejected: "테스트넷 선물 서비스가 요청을 거부했습니다.",
    response_too_large: "서비스 응답이 안전한 크기 제한을 초과했습니다.",
  },
  ja: {
    invalid_resource: "無効な先物 API リソースです。",
    method_not_allowed: "このリソースでは利用できないリクエスト方式です。",
    invalid_schema: "リクエストの項目または形式が無効です。",
    wrong_chain: "BSC テストネットへ切り替えてください。",
    wrong_domain: "注文署名ドメインがテストコントラクトと一致しません。",
    writes_disabled: "現在の環境では先物の書き込みが無効です。",
    unauthorized: "ウォレット認証が期限切れです。再署名してください。",
    rate_limited: "リクエストが多すぎます。しばらくして再試行してください。",
    rpc_bound_exceeded: "安全な RPC 呼び出し上限を超えています。",
    rpc_timeout: "テストネット RPC がタイムアウトしました。",
    service_unavailable: "先物サービスは一時的に利用できません。",
    request_rejected: "テストネット先物サービスがリクエストを拒否しました。",
    response_too_large: "サービス応答が安全なサイズ上限を超えています。",
  },
};

export const localizeFuturesError = (
  code: FuturesApiCode,
  locale: FuturesLocale,
) => messages[locale][code];

export function buildFuturesAuthMessage(input: {
  origin: string;
  wallet: string;
  chainId: number;
  nonce: string;
  expiresAt: number;
}) {
  const wallet = getAddress(input.wallet).toLowerCase();
  if (
    input.chainId !== 97 ||
    !input.nonce ||
    !Number.isSafeInteger(input.expiresAt)
  ) {
    throw new FuturesApiError("invalid_schema", 400);
  }
  return [
    "BNBX Futures testnet access",
    "",
    `Origin: ${new URL(input.origin).origin}`,
    `Chain ID: ${input.chainId}`,
    `Wallet: ${wallet}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${new Date(input.expiresAt).toISOString()}`,
    "",
    "This signature is gasless and does not authorize transactions.",
  ].join("\n");
}

export function requireFuturesWriteEnvironment(
  environment: Record<string, string | undefined>,
) {
  if (
    environment.VERCEL_ENV !== "preview" ||
    environment.FUTURES_API_WRITES_ENABLED !== "true" ||
    environment.FUTURES_CHAIN_ID !== "97"
  ) {
    throw new FuturesApiError("writes_disabled", 403);
  }
}

const exactKeys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new FuturesApiError(
      "invalid_schema",
      400,
      "schema contains an unknown field",
    );
  }
};
const chain = (value: unknown) => {
  const parsed =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (parsed !== 97) throw new FuturesApiError("wrong_chain", 400);
  return 97;
};
const string = (value: unknown, maximum: number) => {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new FuturesApiError("invalid_schema", 400);
  }
  return value;
};

export function parseFuturesApiInput(
  resource: string,
  method: string,
  raw: unknown,
  config: {
    chainId: number;
    orderBook: string;
    domainName?: string;
    domainVersion?: string;
  },
) {
  if (!FUTURES_API_RESOURCES.includes(resource as FuturesApiResource)) {
    throw new FuturesApiError("invalid_resource", 404, "invalid API resource");
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    config.chainId !== 97
  ) {
    throw new FuturesApiError("invalid_schema", 400);
  }
  const input = raw as Record<string, unknown>;
  if (method === "GET") {
    if (
      ![
        "market-status",
        "orders",
        "fills",
        "positions",
        "keeper-health",
      ].includes(resource)
    ) {
      throw new FuturesApiError("method_not_allowed", 405);
    }
    exactKeys(input, ["chainId", "cursor", "limit"]);
    const result: Record<string, unknown> = { chainId: chain(input.chainId) };
    if (input.cursor !== undefined) result.cursor = string(input.cursor, 160);
    if (input.limit !== undefined) {
      const limit = Number(input.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new FuturesApiError("invalid_schema", 400);
      result.limit = limit;
    }
    return result;
  }
  if (method !== "POST" && method !== "DELETE") {
    throw new FuturesApiError("method_not_allowed", 405);
  }
  if (resource === "orders" && method === "POST") {
    exactKeys(input, ["chainId", "idempotencyKey", "envelope"]);
    chain(input.chainId);
    if (
      !input.envelope ||
      typeof input.envelope !== "object" ||
      Array.isArray(input.envelope)
    )
      throw new FuturesApiError("invalid_schema", 400);
    const envelope = input.envelope as Record<string, unknown>;
    exactKeys(envelope, ["domain", "order", "signature"]);
    const domain = envelope.domain as Record<string, unknown> | undefined;
    const order = envelope.order as Record<string, unknown> | undefined;
    if (!domain || !order) throw new FuturesApiError("invalid_schema", 400);
    exactKeys(domain, ["name", "version", "chainId", "verifyingContract"]);
    exactKeys(order, [
      "trader",
      "side",
      "quantity",
      "limitPrice",
      "leverage",
      "nonce",
      "deadline",
      "reduceOnly",
      "role",
    ]);
    if (domain.chainId !== config.chainId)
      throw new FuturesApiError("wrong_chain", 400);
    if (
      domain.name !== (config.domainName ?? "BNBX Futures") ||
      domain.version !== (config.domainVersion ?? "1")
    )
      throw new FuturesApiError("wrong_domain", 400);
    try {
      if (
        getAddress(`${domain.verifyingContract}`) !==
        getAddress(config.orderBook)
      )
        throw new FuturesApiError("wrong_domain", 400);
    } catch (error) {
      if (error instanceof FuturesApiError) throw error;
      throw new FuturesApiError("wrong_domain", 400);
    }
    const boundedUint = (
      value: unknown,
      maximum: bigint,
      allowZero = false,
    ) => {
      if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))
        throw new FuturesApiError("invalid_schema", 400);
      const parsed = BigInt(value);
      if (parsed < (allowZero ? 0n : 1n) || parsed > maximum)
        throw new FuturesApiError("invalid_schema", 400);
    };
    try {
      getAddress(`${order.trader}`);
    } catch {
      throw new FuturesApiError("invalid_schema", 400);
    }
    if (
      ![0, 1].includes(order.side as number) ||
      ![0, 1].includes(order.role as number) ||
      ![1, 2, 3].includes(order.leverage as number) ||
      typeof order.reduceOnly !== "boolean" ||
      typeof envelope.signature !== "string" ||
      !/^0x[0-9a-fA-F]{130}$/.test(envelope.signature)
    )
      throw new FuturesApiError("invalid_schema", 400);
    boundedUint(order.quantity, (1n << 128n) - 1n);
    boundedUint(order.limitPrice, (1n << 128n) - 1n);
    boundedUint(order.nonce, (1n << 64n) - 1n, true);
    boundedUint(order.deadline, (1n << 64n) - 1n);
    return {
      chainId: 97,
      idempotencyKey: string(input.idempotencyKey, 128),
      envelope,
    };
  }
  if (
    resource === "cancellations" &&
    (method === "POST" || method === "DELETE")
  ) {
    exactKeys(input, ["chainId", "idempotencyKey", "orderId"]);
    if (
      typeof input.orderId !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(input.orderId)
    )
      throw new FuturesApiError("invalid_schema", 400);
    return {
      chainId: chain(input.chainId),
      idempotencyKey: string(input.idempotencyKey, 128),
      orderId: input.orderId,
    };
  }
  if (resource === "collateral-intents" && method === "POST") {
    exactKeys(input, ["chainId", "idempotencyKey", "action", "amount"]);
    if (
      !new Set(["deposit", "withdraw"]).has(`${input.action}`) ||
      !/^[1-9][0-9]{0,39}$/.test(`${input.amount}`)
    )
      throw new FuturesApiError("invalid_schema", 400);
    return {
      chainId: chain(input.chainId),
      idempotencyKey: string(input.idempotencyKey, 128),
      action: input.action,
      amount: input.amount,
    };
  }
  throw new FuturesApiError("method_not_allowed", 405);
}

export async function runBoundedRpcBatch<T>(
  calls: Array<(signal: AbortSignal) => Promise<T>>,
  config: { maximumCalls: number; timeoutMs: number },
) {
  if (
    !Number.isSafeInteger(config.maximumCalls) ||
    config.maximumCalls < 1 ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 30_000
  )
    throw new FuturesApiError("invalid_schema", 400);
  if (calls.length > config.maximumCalls)
    throw new FuturesApiError("rpc_bound_exceeded", 400);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.all(calls.map((call) => call(controller.signal))),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new FuturesApiError("rpc_timeout", 504));
        }, config.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  status = 413,
  code: FuturesApiCode = "response_too_large",
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new FuturesApiError("invalid_schema", 400);
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new FuturesApiError(code, status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export function parseFuturesApiResponse(
  resource: string,
  payload: unknown,
  config: { chainId: number; orderBook: string },
) {
  const invalid = () => {
    throw new FuturesApiError("service_unavailable", 503);
  };
  const object = (value: unknown, keys: string[]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== keys.length ||
      Object.keys(record).some((key) => !keys.includes(key))
    )
      invalid();
    return record;
  };
  const decimal = (value: unknown, signed = false) => {
    if (
      typeof value !== "string" ||
      !(signed ? /^-?(?:0|[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/).test(value) ||
      value.length > 80
    )
      invalid();
  };
  const integer = (value: unknown) => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  };
  const hash = (value: unknown) => {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value))
      invalid();
  };
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    invalid();
  const envelope = object(payload, ["chainId", "orderBook", "data", "cursor"]);
  let responseOrderBook: string;
  try {
    responseOrderBook = getAddress(`${envelope.orderBook}`);
  } catch {
    return invalid();
  }
  if (
    envelope.chainId !== config.chainId ||
    config.chainId !== 97 ||
    responseOrderBook !== getAddress(config.orderBook) ||
    (envelope.cursor !== null &&
      (typeof envelope.cursor !== "string" || envelope.cursor.length > 160))
  )
    invalid();
  const list = (
    keys: string[],
    validate: (item: Record<string, unknown>) => void,
  ) => {
    if (!Array.isArray(envelope.data) || envelope.data.length > 100) invalid();
    (envelope.data as unknown[]).forEach((item) =>
      validate(object(item, keys)),
    );
  };
  if (resource === "market-status") {
    const data = object(envelope.data, [
      "marketState",
      "markPrice",
      "oracleUpdatedAt",
      "fundingIndex",
      "fundingUpdatedAt",
    ]);
    if (!["Open", "CloseOnly"].includes(`${data.marketState}`)) invalid();
    decimal(data.markPrice);
    decimal(data.fundingIndex, true);
    integer(data.oracleUpdatedAt);
    integer(data.fundingUpdatedAt);
  } else if (resource === "orders") {
    list(
      [
        "orderId",
        "status",
        "side",
        "quantity",
        "filled",
        "reserved",
        "limitPrice",
        "leverage",
        "deadline",
        "reduceOnly",
        "role",
      ],
      (data) => {
        hash(data.orderId);
        if (
          ![
            "open",
            "reserved",
            "filled",
            "cancellation-pending",
            "cancelled",
          ].includes(`${data.status}`) ||
          ![0, 1].includes(data.side as number) ||
          ![0, 1].includes(data.role as number) ||
          ![1, 2, 3].includes(data.leverage as number) ||
          typeof data.reduceOnly !== "boolean"
        )
          invalid();
        for (const field of [
          "quantity",
          "filled",
          "reserved",
          "limitPrice",
          "deadline",
        ])
          decimal(data[field]);
      },
    );
  } else if (resource === "fills") {
    list(
      [
        "txHash",
        "makerOrderId",
        "takerOrderId",
        "quantity",
        "price",
        "blockNumber",
      ],
      (data) => {
        hash(data.txHash);
        hash(data.makerOrderId);
        hash(data.takerOrderId);
        decimal(data.quantity);
        decimal(data.price);
        integer(data.blockNumber);
      },
    );
  } else if (resource === "positions") {
    list(
      [
        "positionId",
        "side",
        "quantity",
        "entryPrice",
        "markPrice",
        "margin",
        "equity",
        "maintenanceRequirement",
        "marginRatioBps",
        "liquidationPrice",
        "fundingAccrued",
      ],
      (data) => {
        hash(data.positionId);
        if (![0, 1].includes(data.side as number)) invalid();
        for (const field of [
          "quantity",
          "entryPrice",
          "markPrice",
          "margin",
          "maintenanceRequirement",
          "marginRatioBps",
          "liquidationPrice",
        ])
          decimal(data[field]);
        decimal(data.equity, true);
        decimal(data.fundingAccrued, true);
      },
    );
  } else if (resource === "cancellations") {
    const data = object(envelope.data, ["orderId", "status"]);
    hash(data.orderId);
    if (!["cancellation-pending", "cancelled"].includes(`${data.status}`))
      invalid();
  } else if (resource === "collateral-intents") {
    const data = object(envelope.data, [
      "action",
      "amount",
      "to",
      "calldata",
      "expiresAt",
    ]);
    if (!["deposit", "withdraw"].includes(`${data.action}`)) invalid();
    decimal(data.amount);
    integer(data.expiresAt);
    try {
      getAddress(`${data.to}`);
    } catch {
      invalid();
    }
    if (
      typeof data.calldata !== "string" ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(data.calldata)
    )
      invalid();
  } else if (resource === "keeper-health") {
    const data = object(envelope.data, [
      "status",
      "lastFundingCheckpoint",
      "lastLiquidationScan",
      "headBlock",
      "lagBlocks",
    ]);
    if (!["healthy", "degraded"].includes(`${data.status}`)) invalid();
    for (const field of [
      "lastFundingCheckpoint",
      "lastLiquidationScan",
      "headBlock",
      "lagBlocks",
    ])
      integer(data[field]);
  } else invalid();
  return envelope;
}
