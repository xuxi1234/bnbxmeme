import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFuturesAuthMessage,
  FuturesApiError,
  localizeFuturesError,
  parseFuturesApiInput,
  parseFuturesApiResponse,
  readBoundedBody,
  requireFuturesWriteEnvironment,
  runBoundedRpcBatch,
} from "./futures-api-core.ts";

const address = `0x${"11".repeat(20)}`;
const contract = `0x${"22".repeat(20)}`;
const orderEnvelope = (chainId = 97) => ({
  domain: {
    name: "BNBX Futures",
    version: "1",
    chainId,
    verifyingContract: contract,
  },
  order: {
    trader: address,
    side: 0,
    quantity: "10",
    limitPrice: "2000",
    leverage: 3,
    nonce: "1",
    deadline: "10000",
    reduceOnly: false,
    role: 1,
  },
  signature: `0x${"33".repeat(65)}`,
});

test("authentication message binds preview origin, wallet, chain, nonce and expiry", () => {
  const message = buildFuturesAuthMessage({
    origin: "https://preview.example",
    wallet: address,
    chainId: 97,
    nonce: "abc123",
    expiresAt: 1_800_000,
  });
  assert.match(message, /BNBX Futures testnet access/);
  assert.match(message, /Origin: https:\/\/preview\.example/);
  assert.match(message, /Chain ID: 97/);
  assert.match(message, new RegExp(`Wallet: ${address}`));
  assert.match(message, /Nonce: abc123/);
  assert.match(message, /gasless.*does not authorize transactions/i);
});

test("API schemas reject unknown resources, fields and wrong chain or domain", () => {
  assert.deepEqual(
    parseFuturesApiInput(
      "market-status",
      "GET",
      { chainId: "97" },
      {
        chainId: 97,
        orderBook: contract,
      },
    ),
    { chainId: 97 },
  );
  assert.throws(
    () =>
      parseFuturesApiInput(
        "orders",
        "POST",
        {
          chainId: 56,
          idempotencyKey: "x",
          envelope: orderEnvelope(56),
        },
        { chainId: 97, orderBook: contract },
      ),
    (error) => error instanceof FuturesApiError && error.code === "wrong_chain",
  );
  assert.throws(
    () =>
      parseFuturesApiInput(
        "orders",
        "POST",
        {
          chainId: 97,
          idempotencyKey: "x",
          envelope: {
            ...orderEnvelope(),
            order: { ...orderEnvelope().order, leverage: 4 },
          },
        },
        { chainId: 97, orderBook: contract },
      ),
    /invalid_schema/,
  );
  assert.throws(
    () =>
      parseFuturesApiInput(
        "positions",
        "GET",
        { chainId: "97", secret: "x" },
        {
          chainId: 97,
          orderBook: contract,
        },
      ),
    /schema/i,
  );
  assert.throws(
    () =>
      parseFuturesApiInput(
        "unknown",
        "GET",
        {},
        { chainId: 97, orderBook: contract },
      ),
    /resource/i,
  );
  for (const orderId of ["nope", "0x12", `0x${"11".repeat(33)}`]) {
    assert.throws(
      () =>
        parseFuturesApiInput(
          "cancellations",
          "POST",
          { chainId: 97, idempotencyKey: "cancel", orderId },
          { chainId: 97, orderBook: contract },
        ),
      /invalid_schema/,
    );
  }
});

test("writes are enabled only by explicit Preview BSC testnet configuration", () => {
  assert.doesNotThrow(() =>
    requireFuturesWriteEnvironment({
      VERCEL_ENV: "preview",
      FUTURES_API_WRITES_ENABLED: "true",
      FUTURES_CHAIN_ID: "97",
    }),
  );
  for (const environment of [
    {
      VERCEL_ENV: "production",
      FUTURES_API_WRITES_ENABLED: "true",
      FUTURES_CHAIN_ID: "97",
    },
    {
      VERCEL_ENV: "preview",
      FUTURES_API_WRITES_ENABLED: "false",
      FUTURES_CHAIN_ID: "97",
    },
    {
      VERCEL_ENV: "preview",
      FUTURES_API_WRITES_ENABLED: "true",
      FUTURES_CHAIN_ID: "56",
    },
  ]) {
    assert.throws(
      () => requireFuturesWriteEnvironment(environment),
      (error) =>
        error instanceof FuturesApiError && error.code === "writes_disabled",
    );
  }
});

test("RPC batch rejects excess calls, timeouts and partial failures", async () => {
  assert.deepEqual(
    await runBoundedRpcBatch([async () => 1, async () => 2], {
      maximumCalls: 2,
      timeoutMs: 100,
    }),
    [1, 2],
  );
  await assert.rejects(
    () =>
      runBoundedRpcBatch([async () => 1, async () => 2], {
        maximumCalls: 1,
        timeoutMs: 100,
      }),
    (error) =>
      error instanceof FuturesApiError && error.code === "rpc_bound_exceeded",
  );
  let aborted = false;
  await assert.rejects(
    () =>
      runBoundedRpcBatch(
        [
          (signal) =>
            new Promise((_, reject) => {
              signal.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            }),
        ],
        {
          maximumCalls: 1,
          timeoutMs: 5,
        },
      ),
    (error) => error instanceof FuturesApiError && error.code === "rpc_timeout",
  );
  assert.equal(aborted, true);
});

test("stream limits stop reading immediately and response envelopes reject secrets", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
      controller.close();
    },
  });
  await assert.rejects(
    () => readBoundedBody(stream, 6),
    (error) =>
      error instanceof FuturesApiError && error.code === "response_too_large",
  );
  const response = {
    chainId: 97,
    orderBook: contract,
    data: [],
    cursor: "next",
  };
  assert.deepEqual(
    parseFuturesApiResponse("orders", response, {
      chainId: 97,
      orderBook: contract,
    }),
    response,
  );
  assert.throws(
    () =>
      parseFuturesApiResponse(
        "market-status",
        {
          chainId: 56,
          orderBook: contract,
          data: {
            marketState: "Open",
            markPrice: "1",
            oracleUpdatedAt: 1,
            fundingIndex: "0",
            fundingUpdatedAt: 1,
          },
          cursor: null,
        },
        { chainId: 97, orderBook: contract },
      ),
    /service_unavailable/,
  );
  assert.throws(
    () =>
      parseFuturesApiResponse(
        "keeper-health",
        {
          chainId: 97,
          orderBook: contract,
          data: {
            status: "healthy",
            lastFundingCheckpoint: 1,
            lastLiquidationScan: 1,
            headBlock: 2,
            lagBlocks: 1,
            apiKey: "leak",
          },
          cursor: null,
        },
        { chainId: 97, orderBook: contract },
      ),
    /service_unavailable/,
  );
  const position = {
    chainId: 97,
    orderBook: contract,
    data: [
      {
        positionId: `0x${"11".repeat(32)}`,
        side: 0,
        quantity: "1",
        entryPrice: "1",
        markPrice: "1",
        margin: "1",
        equity: "1",
        maintenanceRequirement: "1",
        marginRatioBps: "2500",
        liquidationPrice: "1",
        fundingAccrued: "0",
        liquidatable: false,
      },
    ],
    cursor: null,
  };
  assert.deepEqual(
    parseFuturesApiResponse("positions", position, {
      chainId: 97,
      orderBook: contract,
    }),
    position,
  );
  assert.throws(
    () =>
      parseFuturesApiResponse(
        "positions",
        {
          ...position,
          data: [{ ...position.data[0], liquidatable: undefined }],
        },
        { chainId: 97, orderBook: contract },
      ),
    /service_unavailable/,
  );
});

test("stable error codes have complete four-language messages", () => {
  for (const locale of ["zh", "en", "ko", "ja"]) {
    assert.ok(localizeFuturesError("unauthorized", locale).length > 3);
    assert.ok(localizeFuturesError("rate_limited", locale).length > 3);
  }
});
