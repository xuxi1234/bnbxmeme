import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertSanitizedEvidence,
  validateAcceptanceEnvironment,
} from "./futures-preview-acceptance-core.mjs";

const config = validateAcceptanceEnvironment(process.env);
const chain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
const accounts = [
  privateKeyToAccount(config.walletAKey),
  privateKeyToAccount(config.walletBKey),
];
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain, transport: http(config.rpcUrl) }),
);
const userAgent = "bnbx-futures-preview-acceptance/1";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const idempotency = () => crypto.randomUUID();

const erc20Abi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
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
];
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
};
const domain = {
  name: "BNBX Futures",
  version: "1",
  chainId: 97,
  verifyingContract: config.orderBook,
};

async function receipt(hash) {
  const result = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (result.status !== "success") throw new Error(`testnet transaction reverted: ${hash}`);
  return hash;
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === "string" ? body.code : `HTTP_${response.status}`;
    throw new Error(code);
  }
  return body;
}

async function authenticate(account) {
  const challengeResponse = await fetch(
    `${config.preview}/api/futures/session?wallet=${account.address}`,
    { headers: { "Accept-Language": "en", "User-Agent": userAgent }, cache: "no-store" },
  );
  const challenge = await json(challengeResponse);
  const signature = await account.signMessage({ message: challenge.message });
  const sessionResponse = await fetch(`${config.preview}/api/futures/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      token: challenge.token,
      message: challenge.message,
      signature,
    }),
    cache: "no-store",
  });
  await json(sessionResponse);
  const cookie = sessionResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("bnbx_futures_testnet_session="))
    throw new Error("session cookie missing");
  return cookie;
}

async function api(cookie, resource, method = "GET", input) {
  const suffix = method === "GET" ? "?chainId=97&limit=100" : "";
  return json(
    await fetch(`${config.preview}/api/futures/${resource}${suffix}`, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Accept-Language": "en",
        "User-Agent": userAgent,
      },
      body: method === "GET" ? undefined : JSON.stringify(input),
      cache: "no-store",
    }),
  );
}

async function waitForPreview() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${config.preview}/futures`, {
        headers: { "User-Agent": userAgent },
        cache: "no-store",
      });
      if (response.ok) return;
      lastError = new Error(`preview HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(15_000);
  }
  throw lastError ?? new Error("Preview did not become ready");
}

async function prepareCollateral(index, cookie) {
  const account = accounts[index];
  const wallet = wallets[index];
  const amount = parseEther("1000");
  const mintHash = await receipt(
    await wallet.writeContract({
      address: config.testUsdt,
      abi: erc20Abi,
      functionName: "mint",
      args: [account.address, amount],
    }),
  );
  const intent = await api(cookie, "collateral-intents", "POST", {
    chainId: 97,
    idempotencyKey: idempotency(),
    action: "deposit",
    amount: amount.toString(),
  });
  const approveHash = await receipt(
    await wallet.writeContract({
      address: config.testUsdt,
      abi: erc20Abi,
      functionName: "approve",
      args: [intent.data.to, amount],
    }),
  );
  const depositHash = await receipt(
    await wallet.sendTransaction({ to: intent.data.to, data: intent.data.calldata }),
  );
  return { mintHash, approveHash, depositHash };
}

async function signedOrder(account, side, role, quantity, limitPrice, nonce) {
  const order = {
    trader: account.address,
    side,
    quantity,
    limitPrice,
    leverage: 1,
    nonce: `${nonce}`,
    deadline: `${Math.floor(Date.now() / 1000) + 1_200}`,
    reduceOnly: false,
    role,
  };
  const signature = await account.signTypedData({
    domain,
    types: orderTypes,
    primaryType: "Order",
    message: {
      ...order,
      quantity: BigInt(order.quantity),
      limitPrice: BigInt(order.limitPrice),
      nonce: BigInt(order.nonce),
      deadline: BigInt(order.deadline),
    },
  });
  return { domain, order, signature };
}

async function submit(cookie, envelope, key) {
  return api(cookie, "orders", "POST", {
    chainId: 97,
    idempotencyKey: key,
    envelope,
  });
}

await waitForPreview();
if ((await publicClient.getChainId()) !== 97) throw new Error("RPC is not chain 97");
for (const account of accounts) {
  if ((await publicClient.getBalance({ address: account.address })) < parseEther("0.005"))
    throw new Error(`insufficient tBNB for ${account.address}`);
}
const cookies = [await authenticate(accounts[0]), await authenticate(accounts[1])];
const market = (await api(cookies[0], "market-status")).data;
if (market.marketState !== "Open") throw new Error("Futures market is not open");
const deposits = await Promise.all([
  prepareCollateral(0, cookies[0]),
  prepareCollateral(1, cookies[1]),
]);

const baseNonce = Date.now();
const quantity = (parseEther("1") + BigInt(baseNonce % 1_000_000)).toString();
const maker = await signedOrder(accounts[0], 0, 0, quantity, market.markPrice, baseNonce);
const taker = await signedOrder(accounts[1], 1, 1, quantity, market.markPrice, baseNonce + 1);
const makerKey = idempotency();
const takerKey = idempotency();
const makerResponse = await submit(cookies[0], maker, makerKey);
const makerOrder = makerResponse.data.find(
  (order) =>
    order.quantity === quantity &&
    order.limitPrice === market.markPrice &&
    order.side === 0 &&
    order.status === "open",
);
if (!makerOrder) throw new Error("maker order missing from response");
const takerResponse = await submit(cookies[1], taker, takerKey);
const takerOrder = takerResponse.data.find(
  (order) => order.quantity === quantity && order.limitPrice === market.markPrice && order.side === 1,
);
if (!takerOrder) throw new Error("taker order missing from response");

let matchingFills = [];
for (let attempt = 0; attempt < 24; attempt += 1) {
  const [makerFills, takerFills] = await Promise.all([
    api(cookies[0], "fills"),
    api(cookies[1], "fills"),
  ]);
  const both = [...makerFills.data, ...takerFills.data].filter(
    (fill) =>
      fill.makerOrderId === makerOrder.orderId && fill.takerOrderId === takerOrder.orderId,
  );
  matchingFills = [...new Map(both.map((fill) => [fill.txHash, fill])).values()];
  if (matchingFills.length === 1) break;
  await sleep(4_000);
}
if (matchingFills.length !== 1) throw new Error("expected exactly one canonical fill");
const fill = matchingFills[0];
const [makerPositions, takerPositions] = await Promise.all([
  api(cookies[0], "positions"),
  api(cookies[1], "positions"),
]);
if (!makerPositions.data.some((position) => position.side === 0 && position.quantity === quantity))
  throw new Error("maker long position missing");
if (!takerPositions.data.some((position) => position.side === 1 && position.quantity === quantity))
  throw new Error("taker short position missing");

await submit(cookies[0], maker, makerKey);
await submit(cookies[1], taker, takerKey);
const replayFills = (await api(cookies[0], "fills")).data.filter(
  (candidate) =>
    candidate.makerOrderId === makerOrder.orderId && candidate.takerOrderId === takerOrder.orderId,
);
if (replayFills.length !== 1 || replayFills[0].txHash !== fill.txHash)
  throw new Error("idempotent replay created a second fill");

const cancelQuantity = (parseEther("2") + BigInt(baseNonce % 1_000_000)).toString();
const cancelEnvelope = await signedOrder(
  accounts[0],
  0,
  0,
  cancelQuantity,
  "1",
  baseNonce + 2,
);
const cancelSubmit = await submit(cookies[0], cancelEnvelope, idempotency());
const cancellable = cancelSubmit.data.find(
  (order) => order.quantity === cancelQuantity && order.limitPrice === "1" && order.status === "open",
);
if (!cancellable) throw new Error("fresh cancellable order missing");
const cancellation = await api(cookies[0], "cancellations", "DELETE", {
  chainId: 97,
  idempotencyKey: idempotency(),
  orderId: cancellable.orderId,
});
const cancelHash = await receipt(
  await wallets[0].sendTransaction({
    to: cancellation.data.to,
    data: cancellation.data.calldata,
  }),
);
const cancelledOrders = (await api(cookies[0], "orders")).data;
if (!cancelledOrders.some((order) => order.orderId === cancellable.orderId && order.status === "cancelled"))
  throw new Error("wallet cancellation was not reconciled");

const withdrawAmount = parseEther("1").toString();
const withdrawal = await api(cookies[0], "collateral-intents", "POST", {
  chainId: 97,
  idempotencyKey: idempotency(),
  action: "withdraw",
  amount: withdrawAmount,
});
const withdrawHash = await receipt(
  await wallets[0].sendTransaction({ to: withdrawal.data.to, data: withdrawal.data.calldata }),
);

const evidence = assertSanitizedEvidence(
  {
    status: "PASS",
    chainId: 97,
    previewUrl: config.preview,
    wallets: accounts.map((account) => account.address),
    deposits,
    makerOrderId: makerOrder.orderId,
    takerOrderId: takerOrder.orderId,
    relayerTransactionHash: fill.txHash,
    blockNumber: fill.blockNumber,
    fillQuantity: fill.quantity,
    fillPrice: fill.price,
    positionSides: [0, 1],
    idempotentReplayFillCount: replayFills.length,
    cancelledOrderId: cancellable.orderId,
    cancellationTransactionHash: cancelHash,
    withdrawalTransactionHash: withdrawHash,
  },
  [config.walletAKey, config.walletBKey],
);
console.log(JSON.stringify(evidence, null, 2));
