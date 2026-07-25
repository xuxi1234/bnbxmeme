import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required");
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY is required");
}

const deployment = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../deployments/bsc-testnet.json"),
    "utf8",
  ),
);
const chain = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "BscScan Testnet", url: "https://testnet.bscscan.com" },
  },
});
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl),
});

const factoryAbi = [
  {
    type: "function",
    name: "tokenCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allTokens",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "curveOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createTokenAndBuy",
    stateMutability: "payable",
    inputs: [
      { type: "string" },
      { type: "string" },
      { type: "uint8" },
      { type: "string" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
    ],
    outputs: [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
    ],
  },
];
const curveAbi = [
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "realBNBPrincipal",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "liquidityPair",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];
const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

function feeOn(gross) {
  return (gross * 50n + 9_999n) / 10_000n;
}
function grossForExactNet(net) {
  let gross = (net * 10_000n + 9_949n) / 9_950n;
  while (gross - feeOn(gross) > net) gross -= 1n;
  while (gross - feeOn(gross) < net) gross += 1n;
  return gross;
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}

const balance = await publicClient.getBalance({ address: account.address });
const target = parseEther("1");
const requiredValue = parseEther("0.001") + grossForExactNet(target);
if (balance < requiredValue + parseEther("0.01")) {
  throw new Error(
    `Deployer needs at least ~1.02 tBNB for smoke test; balance is ${balance}`,
  );
}

const countBefore = await publicClient.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "tokenCount",
});
const latest = await publicClient.getBlock();
const hash = await walletClient.writeContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "createTokenAndBuy",
  args: [
    "BNBX Testnet Smoke",
    "BNBXTEST",
    1,
    "",
    parseEther("800000000"),
    latest.timestamp + 1_200n,
    account.address,
  ],
  value: requiredValue,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
check(receipt.status === "success", "Smoke transaction reverted");

const token = await publicClient.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "allTokens",
  args: [countBefore],
});
const curve = await publicClient.readContract({
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "curveOf",
  args: [token],
});
const [state, principal, pair, userTokens] = await Promise.all([
  publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "state",
  }),
  publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "realBNBPrincipal",
  }),
  publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "liquidityPair",
  }),
  publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  }),
]);
const dead = "0x000000000000000000000000000000000000dEaD";
const [pairTokens, pairWbnb, burnedLP] = await Promise.all([
  publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [pair],
  }),
  publicClient.readContract({
    address: deployment.wbnb,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [pair],
  }),
  publicClient.readContract({
    address: pair,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [dead],
  }),
]);

check(Number(state) === 2, "Curve did not graduate");
check(principal === target, "Curve principal is not exactly 1 BNB");
check(userTokens === parseEther("800000000"), "User did not receive 800m tokens");
check(pairTokens === parseEther("200000000"), "Pair did not receive 200m tokens");
check(pairWbnb >= target, "Pair did not receive all WBNB principal");
check(burnedLP > 0n, "Burn address did not receive LP");

const result = {
  status: "passed",
  chainId: 97,
  testedAt: new Date().toISOString(),
  creator: account.address,
  transactionHash: hash,
  token,
  curve,
  pair,
  principal: principal.toString(),
  userTokens: userTokens.toString(),
  pairTokens: pairTokens.toString(),
  pairWbnb: pairWbnb.toString(),
  burnedLP: burnedLP.toString(),
};
writeFileSync(
  resolve(import.meta.dirname, "../deployments/bsc-testnet-smoke.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
