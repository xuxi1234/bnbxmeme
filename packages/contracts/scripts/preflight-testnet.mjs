import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAIN_ID = 97;
const PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const PANCAKE_V2_FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
const apiKey = process.env.BSC_SCAN_API_KEY;
const runSmoke = process.env.RUN_SMOKE === "true";

if (!rpcUrl) throw new Error("BSC_TESTNET_RPC_URL is required");
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed key");
}
if (!apiKey) throw new Error("BSC_SCAN_API_KEY is required");

const chain = defineChain({
  id: CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });
const account = privateKeyToAccount(privateKey);
const routerAbi = [
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "WETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];

const [actualChainId, balance, routerCode, routerFactory, routerWbnb] =
  await Promise.all([
    client.getChainId(),
    client.getBalance({ address: account.address }),
    client.getCode({ address: PANCAKE_V2_ROUTER }),
    client.readContract({
      address: PANCAKE_V2_ROUTER,
      abi: routerAbi,
      functionName: "factory",
    }),
    client.readContract({
      address: PANCAKE_V2_ROUTER,
      abi: routerAbi,
      functionName: "WETH",
    }),
  ]);

if (actualChainId !== CHAIN_ID) {
  throw new Error(`Refusing deployment: RPC chain ID is ${actualChainId}, expected 97`);
}
if (!routerCode || routerCode === "0x") {
  throw new Error("Official Pancake V2 Testnet Router has no bytecode");
}
if (routerFactory.toLowerCase() !== PANCAKE_V2_FACTORY.toLowerCase()) {
  throw new Error(`Pancake Factory mismatch: ${routerFactory}`);
}
if (routerWbnb.toLowerCase() !== WBNB.toLowerCase()) {
  throw new Error(`Pancake WBNB mismatch: ${routerWbnb}`);
}

const minimumBalance = runSmoke ? parseEther("1.05") : parseEther("0.05");
if (balance < minimumBalance) {
  throw new Error(
    `Insufficient deployer balance: ${formatEther(balance)} tBNB; ` +
      `${formatEther(minimumBalance)} tBNB required`,
  );
}

const apiUrl = new URL("https://api.etherscan.io/v2/api");
apiUrl.search = new URLSearchParams({
  apikey: apiKey,
  chainid: String(CHAIN_ID),
  module: "contract",
  action: "getabi",
  address: PANCAKE_V2_ROUTER,
}).toString();
const apiResponse = await fetch(apiUrl);
if (!apiResponse.ok) {
  throw new Error(`BscScan API preflight returned HTTP ${apiResponse.status}`);
}
const apiResult = await apiResponse.json();
if (apiResult.status !== "1") {
  throw new Error(`BscScan API key/configuration check failed: ${apiResult.result}`);
}

console.log(
  JSON.stringify(
    {
      status: "ready",
      chainId: actualChainId,
      deployer: account.address,
      balance: `${formatEther(balance)} tBNB`,
      minimumBalance: `${formatEther(minimumBalance)} tBNB`,
      pancakeV2Router: PANCAKE_V2_ROUTER,
      pancakeV2Factory: routerFactory,
      wbnb: routerWbnb,
      bscScanApi: "available",
      smokeTestRequested: runSmoke,
    },
    null,
    2,
  ),
);
