import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  assertSanitizedEvidence,
  ORACLE_UPDATE_GAS,
  quoteConstantProductOut,
  retryServiceUnavailable,
  validateAcceptanceEnvironment,
} from "./futures-preview-acceptance-core.mjs";

const config = validateAcceptanceEnvironment(process.env);
const chain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});
const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});
const walletKeys = [
  config.walletAKey,
  config.walletBKey ?? generatePrivateKey(),
];
const accounts = walletKeys.map((key) => privateKeyToAccount(key));
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain, transport: http(config.rpcUrl) }),
);
const userAgent = "bnbx-futures-preview-acceptance/1";
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const idempotency = () => crypto.randomUUID();
const collateralAmount = parseEther("0.1");
const swapInput = parseEther("0.05");
const testnetWbnb = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const testnetUsdtWbnbPair = "0x5F52Ad4bD4f519AE79999400ad8B83A3D002fD92";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
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
const wbnbAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  erc20Abi[1],
];
const pairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount0Out", type: "uint256" },
      { name: "amount1Out", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
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
const oracleAbi = [
  {
    type: "function",
    name: "update",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "state", type: "uint8" },
      { name: "markPriceWad", type: "uint256" },
      { name: "twapBnbPerTokenWad", type: "uint256" },
      { name: "bnbUsdWad", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
];
const domain = {
  name: "BNBX Futures",
  version: "1",
  chainId: 97,
  verifyingContract: config.orderBook,
};

async function receipt(hash) {
  const result = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
  if (result.status !== "success")
    throw new Error(`testnet transaction reverted: ${hash}`);
  return hash;
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code =
      typeof body?.code === "string" ? body.code : `HTTP_${response.status}`;
    throw new Error(code);
  }
  return body;
}

async function authenticate(account) {
  const challengeResponse = await fetch(
    `${config.preview}/api/futures/session?wallet=${account.address}`,
    {
      headers: { "Accept-Language": "en", "User-Agent": userAgent },
      cache: "no-store",
    },
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
  return retryServiceUnavailable(async () =>
    json(
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
    ),
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
  const wallet = wallets[index];
  const amount = collateralAmount;
  const intentKey = idempotency();
  const intent = await retryServiceUnavailable(() =>
    api(cookie, "collateral-intents", "POST", {
      chainId: 97,
      idempotencyKey: intentKey,
      action: "deposit",
      amount: amount.toString(),
    }),
  );
  const approveHash = await receipt(
    await wallet.writeContract({
      address: config.testUsdt,
      abi: erc20Abi,
      functionName: "approve",
      args: [intent.data.to, amount],
    }),
  );
  const depositHash = await receipt(
    await wallet.sendTransaction({
      to: intent.data.to,
      data: intent.data.calldata,
    }),
  );
  return { approveHash, depositHash };
}

async function ensureCollateralBalances() {
  const required = collateralAmount * 2n;
  let fundingBalance = await publicClient.readContract({
    address: config.testUsdt,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accounts[0].address],
  });
  if (fundingBalance < required) {
    const [token0, token1, reserves] = await Promise.all([
      publicClient.readContract({
        address: testnetUsdtWbnbPair,
        abi: pairAbi,
        functionName: "token0",
      }),
      publicClient.readContract({
        address: testnetUsdtWbnbPair,
        abi: pairAbi,
        functionName: "token1",
      }),
      publicClient.readContract({
        address: testnetUsdtWbnbPair,
        abi: pairAbi,
        functionName: "getReserves",
      }),
    ]);
    if (
      token0.toLowerCase() !== config.testUsdt.toLowerCase() ||
      token1.toLowerCase() !== testnetWbnb.toLowerCase()
    )
      throw new Error("testnet collateral pool identity mismatch");
    const quotedOut = quoteConstantProductOut(
      swapInput,
      reserves[1],
      reserves[0],
    );
    const conservativeOut = (quotedOut * 95n) / 100n;
    await receipt(
      await wallets[0].writeContract({
        address: testnetWbnb,
        abi: wbnbAbi,
        functionName: "deposit",
        value: swapInput,
      }),
    );
    await receipt(
      await wallets[0].writeContract({
        address: testnetWbnb,
        abi: wbnbAbi,
        functionName: "transfer",
        args: [testnetUsdtWbnbPair, swapInput],
      }),
    );
    await receipt(
      await wallets[0].writeContract({
        address: testnetUsdtWbnbPair,
        abi: pairAbi,
        functionName: "swap",
        args: [conservativeOut, 0n, accounts[0].address, "0x"],
      }),
    );
    fundingBalance = await publicClient.readContract({
      address: config.testUsdt,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [accounts[0].address],
    });
  }
  const secondBalance = await publicClient.readContract({
    address: config.testUsdt,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accounts[1].address],
  });
  const transferAmount =
    secondBalance >= collateralAmount ? 0n : collateralAmount - secondBalance;
  if (fundingBalance < collateralAmount + transferAmount)
    throw new Error("insufficient Test USDT after testnet swap");
  if (transferAmount > 0n)
    await receipt(
      await wallets[0].writeContract({
        address: config.testUsdt,
        abi: erc20Abi,
        functionName: "transfer",
        args: [accounts[1].address, transferAmount],
      }),
    );
}

async function recoverOpenMarket(cookie) {
  for (let observation = 0; observation < 8; observation += 1) {
    const market = (
      await retryServiceUnavailable(() => api(cookie, "market-status"))
    ).data;
    if (market.marketState === "Open") return market;
    await receipt(
      await wallets[0].writeContract({
        address: config.oracle,
        abi: oracleAbi,
        functionName: "update",
        gas: ORACLE_UPDATE_GAS,
      }),
    );
    const updated = (
      await retryServiceUnavailable(() => api(cookie, "market-status"))
    ).data;
    if (updated.marketState === "Open") return updated;
    if (observation < 7) await sleep(305_000);
  }
  throw new Error("Futures oracle did not rebuild an open market");
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
  return retryServiceUnavailable(() =>
    api(cookie, "orders", "POST", {
      chainId: 97,
      idempotencyKey: key,
      envelope,
    }),
  );
}

await waitForPreview();
if ((await publicClient.getChainId()) !== 97)
  throw new Error("RPC is not chain 97");
if (
  (await publicClient.getBalance({ address: accounts[0].address })) <
  parseEther("0.015")
)
  throw new Error(`insufficient tBNB for ${accounts[0].address}`);
if (
  (await publicClient.getBalance({ address: accounts[1].address })) <
  parseEther("0.005")
) {
  await receipt(
    await wallets[0].sendTransaction({
      to: accounts[1].address,
      value: parseEther("0.01"),
    }),
  );
}
const cookies = [
  await retryServiceUnavailable(() => authenticate(accounts[0])),
  await retryServiceUnavailable(() => authenticate(accounts[1])),
];
const market = await recoverOpenMarket(cookies[0]);
await ensureCollateralBalances();
const deposits = await Promise.all([
  prepareCollateral(0, cookies[0]),
  prepareCollateral(1, cookies[1]),
]);

const baseNonce = Date.now();
const quantity = (parseEther("1") + BigInt(baseNonce % 1_000_000)).toString();
const maker = await signedOrder(
  accounts[0],
  0,
  0,
  quantity,
  market.markPrice,
  baseNonce,
);
const taker = await signedOrder(
  accounts[1],
  1,
  1,
  quantity,
  market.markPrice,
  baseNonce + 1,
);
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
  (order) =>
    order.quantity === quantity &&
    order.limitPrice === market.markPrice &&
    order.side === 1,
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
      fill.makerOrderId === makerOrder.orderId &&
      fill.takerOrderId === takerOrder.orderId,
  );
  matchingFills = [
    ...new Map(both.map((fill) => [fill.txHash, fill])).values(),
  ];
  if (matchingFills.length === 1) break;
  await sleep(4_000);
}
if (matchingFills.length !== 1)
  throw new Error("expected exactly one canonical fill");
const fill = matchingFills[0];
const [makerPositions, takerPositions] = await Promise.all([
  api(cookies[0], "positions"),
  api(cookies[1], "positions"),
]);
if (
  !makerPositions.data.some(
    (position) => position.side === 0 && position.quantity === quantity,
  )
)
  throw new Error("maker long position missing");
if (
  !takerPositions.data.some(
    (position) => position.side === 1 && position.quantity === quantity,
  )
)
  throw new Error("taker short position missing");

await submit(cookies[0], maker, makerKey);
await submit(cookies[1], taker, takerKey);
const replayFills = (await api(cookies[0], "fills")).data.filter(
  (candidate) =>
    candidate.makerOrderId === makerOrder.orderId &&
    candidate.takerOrderId === takerOrder.orderId,
);
if (replayFills.length !== 1 || replayFills[0].txHash !== fill.txHash)
  throw new Error("idempotent replay created a second fill");

const cancelQuantity = (
  parseEther("2") + BigInt(baseNonce % 1_000_000)
).toString();
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
  (order) =>
    order.quantity === cancelQuantity &&
    order.limitPrice === "1" &&
    order.status === "open",
);
if (!cancellable) throw new Error("fresh cancellable order missing");
const cancellationKey = idempotency();
const cancellation = await retryServiceUnavailable(() =>
  api(cookies[0], "cancellations", "DELETE", {
    chainId: 97,
    idempotencyKey: cancellationKey,
    orderId: cancellable.orderId,
  }),
);
const cancelHash = await receipt(
  await wallets[0].sendTransaction({
    to: cancellation.data.to,
    data: cancellation.data.calldata,
  }),
);
const cancelledOrders = (await api(cookies[0], "orders")).data;
if (
  !cancelledOrders.some(
    (order) =>
      order.orderId === cancellable.orderId && order.status === "cancelled",
  )
)
  throw new Error("wallet cancellation was not reconciled");

const withdrawAmount = parseEther("0.01").toString();
const withdrawalKey = idempotency();
const withdrawal = await retryServiceUnavailable(() =>
  api(cookies[0], "collateral-intents", "POST", {
    chainId: 97,
    idempotencyKey: withdrawalKey,
    action: "withdraw",
    amount: withdrawAmount,
  }),
);
const withdrawHash = await receipt(
  await wallets[0].sendTransaction({
    to: withdrawal.data.to,
    data: withdrawal.data.calldata,
  }),
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
  walletKeys,
);
console.log(JSON.stringify(evidence, null, 2));
