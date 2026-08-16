"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { isAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { WalletButton } from "@/components/wallet-button";
import { useLanguage } from "@/components/language-provider";
import {
  FUTURES_COPY,
  buildFuturesOrder,
  classifyMarginRisk,
  formatFuturesDecimal,
} from "@/lib/futures-ui-core";

type Envelope<T> = {
  chainId: 97;
  orderBook: Address;
  data: T;
  cursor: string | null;
};
type Market = {
  marketState: "Open" | "CloseOnly";
  markPrice: string;
  oracleUpdatedAt: number;
  fundingIndex: string;
  fundingUpdatedAt: number;
};
type Order = {
  orderId: Hex;
  status: string;
  side: 0 | 1;
  quantity: string;
  filled: string;
  reserved: string;
  limitPrice: string;
  leverage: 1 | 2 | 3;
  deadline: string;
  reduceOnly: boolean;
  role: 0 | 1;
};
type Fill = {
  txHash: Hex;
  makerOrderId: Hex;
  takerOrderId: Hex;
  quantity: string;
  price: string;
  blockNumber: number;
};
type Position = {
  positionId: Hex;
  side: 0 | 1;
  quantity: string;
  entryPrice: string;
  markPrice: string;
  margin: string;
  equity: string;
  maintenanceRequirement: string;
  marginRatioBps: string;
  liquidationPrice: string;
  fundingAccrued: string;
  liquidatable: boolean;
};
type Keeper = {
  status: "healthy" | "degraded";
  lastFundingCheckpoint: number;
  lastLiquidationScan: number;
  headBlock: number;
  lagBlocks: number;
};
type CollateralIntent = {
  action: "deposit" | "withdraw";
  amount: string;
  to: Address;
  calldata: Hex;
  expiresAt: number;
};

const orderBook = process.env.NEXT_PUBLIC_FUTURES_ORDER_BOOK ?? "";
const testUsdt = process.env.NEXT_PUBLIC_FUTURES_TEST_USDT ?? "";
const orderTypes = {
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
const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const idempotency = () => crypto.randomUUID();
const MAX_ORACLE_AGE_SECONDS = 3_900;
class FuturesApiResponseError extends Error {}
const apiFailure = (body: unknown, fallback: string) =>
  new FuturesApiResponseError(
    body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
      ? body.message
      : fallback,
  );
const visibleError = (cause: unknown, fallback: string) =>
  cause instanceof FuturesApiResponseError ? cause.message : fallback;

export function FuturesConsole() {
  const { language } = useLanguage();
  const copy = FUTURES_COPY[language];
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: bscTestnet.id });
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const [authenticated, setAuthenticated] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [keeper, setKeeper] = useState<Keeper | null>(null);
  const [side, setSide] = useState<"long" | "short">("long");
  const [role, setRole] = useState<"maker" | "taker">("maker");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("1");
  const [leverage, setLeverage] = useState<1 | 2 | 3>(1);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [collateralAmount, setCollateralAmount] = useState("10");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const configured = isAddress(orderBook) && isAddress(testUsdt);
  const wrongChain = isConnected && chainId !== bscTestnet.id;
  const canWrite = Boolean(
    configured &&
    authenticated &&
    isConnected &&
    chainId === bscTestnet.id &&
    market,
  );
  const canSubmitOrder = Boolean(
    canWrite && (market?.marketState === "Open" || reduceOnly),
  );
  const locale = language === "zh" ? "zh-CN" : language;

  const api = useCallback(
    async <T,>(resource: string, init?: RequestInit) => {
      const suffix =
        init?.method && init.method !== "GET" ? "" : "?chainId=97&limit=100";
      const response = await fetch(`/api/futures/${resource}${suffix}`, {
        ...init,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": locale,
          ...init?.headers,
        },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw apiFailure(body, copy.unavailable);
      return body as Envelope<T>;
    },
    [copy.unavailable, locale],
  );

  const authenticate = useCallback(async () => {
    if (!address || !configured || chainId !== bscTestnet.id) return;
    setBusy("auth");
    setError("");
    setNotice(copy.signing);
    try {
      const challengeResponse = await fetch(
        `/api/futures/session?wallet=${address}`,
        { headers: { "Accept-Language": locale }, cache: "no-store" },
      );
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw apiFailure(challenge, copy.unavailable);
      if (typeof challenge.message !== "string") throw new Error();
      const signature = await signMessageAsync({ message: challenge.message });
      const sessionResponse = await fetch("/api/futures/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": locale,
        },
        body: JSON.stringify({
          token: challenge.token,
          message: challenge.message,
          signature,
        }),
      });
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw apiFailure(session, copy.unavailable);
      setAuthenticated(true);
      setNotice(copy.signedIn);
    } catch (cause) {
      setAuthenticated(false);
      setError(visibleError(cause, copy.unavailable));
      setNotice("");
    } finally {
      setBusy("");
    }
  }, [address, chainId, configured, copy, locale, signMessageAsync]);

  const refresh = useCallback(async () => {
    if (!authenticated) return;
    setBusy("refresh");
    setError("");
    try {
      const [
        marketResult,
        orderResult,
        fillResult,
        positionResult,
        keeperResult,
      ] = await Promise.all([
        api<Market>("market-status"),
        api<Order[]>("orders"),
        api<Fill[]>("fills"),
        api<Position[]>("positions"),
        api<Keeper>("keeper-health"),
      ]);
      setMarket(marketResult.data);
      setOrders(orderResult.data);
      setFills(fillResult.data);
      setPositions(positionResult.data);
      setKeeper(keeperResult.data);
    } catch (cause) {
      setError(visibleError(cause, copy.unavailable));
    } finally {
      setBusy("");
    }
  }, [api, authenticated, copy.unavailable]);

  useEffect(() => {
    setAuthenticated(false);
    setMarket(null);
    setOrders([]);
    setFills([]);
    setPositions([]);
  }, [address, chainId]);
  useEffect(() => {
    void refresh();
  }, [authenticated, refresh]);

  async function submitOrder() {
    if (!address || !canSubmitOrder || !isAddress(orderBook)) return;
    setBusy("order");
    setError("");
    setNotice(copy.signing);
    try {
      const order = buildFuturesOrder({
        trader: address,
        side,
        role,
        quantity,
        limitPrice: price,
        leverage,
        reduceOnly,
        nonce: Date.now(),
        deadline: Math.floor(Date.now() / 1000) + 1_200,
      });
      const signature = await signTypedDataAsync({
        domain: {
          name: "BNBX Futures",
          version: "1",
          chainId: bscTestnet.id,
          verifyingContract: orderBook as Address,
        },
        types: orderTypes,
        primaryType: "Order",
        message: {
          ...order,
          trader: order.trader as Address,
          quantity: BigInt(order.quantity),
          limitPrice: BigInt(order.limitPrice),
          nonce: BigInt(order.nonce),
          deadline: BigInt(order.deadline),
        },
      });
      await api<Order[]>("orders", {
        method: "POST",
        body: JSON.stringify({
          chainId: 97,
          idempotencyKey: idempotency(),
          envelope: {
            domain: {
              name: "BNBX Futures",
              version: "1",
              chainId: 97,
              verifyingContract: orderBook,
            },
            order,
            signature,
          },
        }),
      });
      setNotice(copy.success);
      await refresh();
    } catch (cause) {
      setError(visibleError(cause, copy.unavailable));
      setNotice("");
    } finally {
      setBusy("");
    }
  }

  async function cancelOrder(orderId: Hex) {
    if (!canWrite) return;
    setBusy(orderId);
    setError("");
    try {
      await api("cancellations", {
        method: "DELETE",
        body: JSON.stringify({
          chainId: 97,
          idempotencyKey: idempotency(),
          orderId,
        }),
      });
      setNotice(copy.success);
      await refresh();
    } catch (cause) {
      setError(visibleError(cause, copy.unavailable));
    } finally {
      setBusy("");
    }
  }

  async function collateral(action: "deposit" | "withdraw") {
    if (!canWrite || !isAddress(testUsdt) || !publicClient || !address) return;
    setBusy(action);
    setError("");
    setNotice(copy.transaction);
    try {
      const amount = buildFuturesOrder({
        trader: address,
        side: "long",
        role: "maker",
        quantity: collateralAmount,
        limitPrice: "1",
        leverage: 1,
        reduceOnly: false,
        nonce: 0,
        deadline: 1,
      }).quantity;
      const result = await api<CollateralIntent>("collateral-intents", {
        method: "POST",
        body: JSON.stringify({
          chainId: 97,
          idempotencyKey: idempotency(),
          action,
          amount,
        }),
      });
      if (action === "deposit") {
        setNotice(copy.approve);
        const approval = await writeContractAsync({
          address: testUsdt as Address,
          abi: approveAbi,
          functionName: "approve",
          args: [result.data.to, BigInt(amount)],
          chainId: bscTestnet.id,
        });
        await publicClient.waitForTransactionReceipt({ hash: approval });
      }
      setNotice(copy.transaction);
      const hash = await sendTransactionAsync({
        to: result.data.to,
        data: result.data.calldata,
        chainId: bscTestnet.id,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNotice(copy.success);
      await refresh();
    } catch (cause) {
      setError(visibleError(cause, copy.unavailable));
      setNotice("");
    } finally {
      setBusy("");
    }
  }

  const oracleHealthy = Boolean(
    market &&
    Date.now() / 1000 - market.oracleUpdatedAt <= MAX_ORACLE_AGE_SECONDS,
  );
  const status = useMemo(
    () => (market?.marketState === "Open" ? copy.marketOpen : copy.closeOnly),
    [copy, market],
  );

  return (
    <main className="futures-shell">
      <section className="futures-hero">
        <div>
          <span className="futures-testnet">TESTNET · {copy.chain97}</span>
          <h1>{copy.title}</h1>
          <p>{copy.testnetAssetWarning}</p>
          <small>{copy.feeNotice}</small>
        </div>
        <div className="futures-access">
          <WalletButton connectLabel={copy.connect} />
          {wrongChain && (
            <button
              className="button"
              onClick={() => switchChainAsync({ chainId: bscTestnet.id })}
            >
              {copy.switchChain}
            </button>
          )}
          {isConnected && !wrongChain && !authenticated && (
            <button
              className="button"
              disabled={!configured || busy === "auth"}
              onClick={authenticate}
            >
              {copy.authenticate}
            </button>
          )}
          {authenticated && (
            <button
              className="button secondary"
              disabled={busy === "refresh"}
              onClick={refresh}
            >
              {copy.refresh}
            </button>
          )}
        </div>
      </section>
      {!configured && <div className="futures-alert">{copy.unavailable}</div>}
      {(notice || error) && (
        <div className={`futures-alert ${error ? "danger" : ""}`} role="status">
          {error || notice}
        </div>
      )}
      <section className="futures-status" aria-label={status}>
        <article>
          <span>{copy.testnet}</span>
          <strong>
            {copy.testBnbx} / {copy.testUsdt}
          </strong>
        </article>
        <article>
          <span>{status}</span>
          <strong>
            {formatFuturesDecimal(market?.markPrice)} {copy.testUsdt}
          </strong>
        </article>
        <article>
          <span>{oracleHealthy ? copy.oracleHealthy : copy.oracleStale}</span>
          <strong>
            {market
              ? new Date(market.oracleUpdatedAt * 1000).toLocaleTimeString(
                  locale,
                )
              : "—"}
          </strong>
        </article>
        <article>
          <span>{copy.keeper}</span>
          <strong>
            {keeper
              ? `${keeper.status === "healthy" ? copy.keeperHealthy : copy.keeperDegraded} · ${keeper.lagBlocks}`
              : "—"}
          </strong>
        </article>
      </section>
      <section className="futures-workspace">
        <div className="futures-ticket">
          <div className="futures-tabs">
            <button
              className={side === "long" ? "active long" : ""}
              onClick={() => setSide("long")}
            >
              {copy.long}
            </button>
            <button
              className={side === "short" ? "active short" : ""}
              onClick={() => setSide("short")}
            >
              {copy.short}
            </button>
          </div>
          <label>
            {copy.quantity}
            <input
              value={quantity}
              inputMode="decimal"
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label>
            {copy.limitPrice}
            <input
              value={price}
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label>
            {copy.leverage}
            <select
              value={leverage}
              onChange={(event) =>
                setLeverage(Number(event.target.value) as 1 | 2 | 3)
              }
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="3">3×</option>
            </select>
          </label>
          <div className="futures-tabs compact">
            <button
              className={role === "maker" ? "active" : ""}
              onClick={() => setRole("maker")}
            >
              {copy.maker}
            </button>
            <button
              className={role === "taker" ? "active" : ""}
              onClick={() => setRole("taker")}
            >
              {copy.taker}
            </button>
          </div>
          <label className="futures-check">
            <input
              type="checkbox"
              checked={reduceOnly}
              onChange={(event) => setReduceOnly(event.target.checked)}
            />
            {copy.reduceOnly}
          </label>
          <small>{copy.deadline}</small>
          <button
            className="button wide"
            disabled={!canSubmitOrder || busy === "order"}
            onClick={submitOrder}
          >
            {copy.submitOrder}
          </button>
        </div>
        <div className="futures-account">
          <h2>{copy.collateral}</h2>
          <label>
            {copy.amount}
            <input
              value={collateralAmount}
              inputMode="decimal"
              onChange={(event) => setCollateralAmount(event.target.value)}
            />
          </label>
          <div className="futures-actions">
            <button
              className="button"
              disabled={!canWrite || busy !== ""}
              onClick={() => collateral("deposit")}
            >
              {copy.deposit}
            </button>
            <button
              className="button secondary"
              disabled={!canWrite || busy !== ""}
              onClick={() => collateral("withdraw")}
            >
              {copy.withdraw}
            </button>
          </div>
          <h2>{copy.positions}</h2>
          {positions.length === 0 ? (
            <p>{busy === "refresh" ? copy.loading : copy.empty}</p>
          ) : (
            positions.map((position) => {
              const risk = classifyMarginRisk(
                position.marginRatioBps,
                position.liquidatable,
              );
              return (
                <article
                  className={`futures-position ${risk}`}
                  key={position.positionId}
                >
                  <header>
                    <strong>
                      {position.side === 0 ? copy.long : copy.short} ·{" "}
                      {formatFuturesDecimal(position.quantity)} {copy.testBnbx}
                    </strong>
                    <span>
                      {risk === "healthy"
                        ? copy.riskHealthy
                        : risk === "warning"
                          ? copy.riskWarning
                          : copy.riskLiquidation}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>{copy.entryPrice}</dt>
                      <dd>{formatFuturesDecimal(position.entryPrice)}</dd>
                    </div>
                    <div>
                      <dt>{copy.markPrice}</dt>
                      <dd>{formatFuturesDecimal(position.markPrice)}</dd>
                    </div>
                    <div>
                      <dt>{copy.marginRatio}</dt>
                      <dd>
                        {formatFuturesDecimal(position.marginRatioBps, 2, 2)}%
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.liquidationPrice}</dt>
                      <dd>{formatFuturesDecimal(position.liquidationPrice)}</dd>
                    </div>
                    <div>
                      <dt>{copy.equity}</dt>
                      <dd>{formatFuturesDecimal(position.equity)}</dd>
                    </div>
                    <div>
                      <dt>{copy.collateral}</dt>
                      <dd>{formatFuturesDecimal(position.margin)}</dd>
                    </div>
                    <div>
                      <dt>{copy.maintenance}</dt>
                      <dd>
                        {formatFuturesDecimal(position.maintenanceRequirement)}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.funding}</dt>
                      <dd>{formatFuturesDecimal(position.fundingAccrued)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })
          )}
        </div>
      </section>
      <section className="futures-ledger">
        <div>
          <h2>{copy.openOrders}</h2>
          {orders.length === 0 ? (
            <p>{copy.empty}</p>
          ) : (
            orders.map((order) => (
              <article key={order.orderId}>
                <span>
                  {order.side === 0 ? copy.long : copy.short} ·{" "}
                  {order.role === 0 ? copy.makerRole : copy.takerRole} ·{" "}
                  {order.leverage}×
                </span>
                <strong>
                  {formatFuturesDecimal(order.quantity)} @{" "}
                  {formatFuturesDecimal(order.limitPrice)}
                </strong>
                <button
                  onClick={() => cancelOrder(order.orderId)}
                  disabled={!canWrite || busy === order.orderId}
                >
                  {copy.cancel}
                </button>
              </article>
            ))
          )}
        </div>
        <div>
          <h2>{copy.fills}</h2>
          {fills.length === 0 ? (
            <p>{copy.empty}</p>
          ) : (
            fills.map((fill) => (
              <article key={`${fill.txHash}-${fill.makerOrderId}`}>
                <span>
                  #{fill.blockNumber} · {short(fill.txHash)}
                </span>
                <strong>
                  {formatFuturesDecimal(fill.quantity)} @{" "}
                  {formatFuturesDecimal(fill.price)}
                </strong>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
